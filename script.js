import * as THREE from 'https://unpkg.com/three@0.126.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.126.0/examples/jsm/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let pyodide;
let loadingOverlay = document.getElementById('loading-overlay');
let python_ready = false;
let currentSprites = []; // To store sprites for dynamic scaling
let currentLayoutDisplay = 'points'; // Global variable to store current display mode
let isShiftHeld = false; // To track if Shift key is currently held down
let isClickPlayModeActive = false; // To track if play mode is active via button click
let currentlyHovered = null; // To track the object the mouse is over
let playButton; // Declare playButton globally
let pivotButtons; // Declare pivotButtons globally
let currentPivotVoiceIndex = 0; // 0: Bass, 1: Tenor, 2: Alto, 3: Soprano (default Bass)
let lastPlayedFrequencies = [];
let lastPlayedRatios = [];
const initialBaseFreq = 130.8128; // The fixed base frequency for the very first chord

// --- AUDIO ENGINE ---
let audioCtx;
let oscillators = [];
let mainGainNode;

function initAudio() {
    if (audioCtx) return; // Already initialized
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        // --- Create a simple master gain node ---
        mainGainNode = audioCtx.createGain();
        mainGainNode.connect(audioCtx.destination);
    } catch (e) {
        console.error(`Error creating audio context: ${e.message}`);
    }
}

function playChord(ratioString) {
    if (!audioCtx || !mainGainNode) {
        console.error("Audio context not initialized. Cannot play chord.");
        return;
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
            playChord(ratioString);
        });
        return;
    }

    stopChord(); // Clear previous oscillators

    const ratio = ratioString.split(':').map(Number);
    if (ratio.length !== 4 || ratio.some(isNaN)) {
        console.error(`Invalid ratio format: ${ratioString}`);
        return;
    }

    let effectiveBaseFreq;

    if (lastPlayedFrequencies.length === 0) {
        // First chord, or no previous chord to pivot from
        effectiveBaseFreq = initialBaseFreq;
    } else {
        // Calculate baseFreq based on pivot
        const pivotFreqFromPrevChord = lastPlayedFrequencies[currentPivotVoiceIndex];
        const ratioComponentAtPivot = ratio[currentPivotVoiceIndex];
        const firstRatioComponent = ratio[0];
        
        if (ratioComponentAtPivot === 0) {
            console.warn("Ratio component at pivot is zero, cannot calculate pivot. Using initial base frequency.");
            effectiveBaseFreq = initialBaseFreq;
        } else {
            effectiveBaseFreq = (pivotFreqFromPrevChord * firstRatioComponent) / ratioComponentAtPivot;
        }
    }

    const frequencies = ratio.map(r => effectiveBaseFreq * (r / ratio[0]));

    // Store current chord's data for next pivot calculation
    lastPlayedFrequencies = frequencies;
    lastPlayedRatios = ratio;

    for (const freq of frequencies) {
        const osc = audioCtx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        osc.connect(mainGainNode);
        osc.start();
        oscillators.push(osc);
    }

    mainGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
    mainGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    mainGainNode.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.5); // fade-in
}

function stopChord() {
    if (mainGainNode) {
        mainGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
        mainGainNode.gain.setValueAtTime(mainGainNode.gain.value, audioCtx.currentTime);
        mainGainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5); // fade-out
    }

    const oldOscillators = oscillators;
    oscillators = [];
    setTimeout(() => {
        oldOscillators.forEach(osc => {
            osc.stop();
            osc.disconnect();
        });
    }, 50); // Cleanup after 50ms
}

// Plasma Colormap function
function plasmaColormap(value) {
    // Clamp value between 0 and 1
    value = Math.min(1, Math.max(0, value));

    const colors = [
        { r: 13/255, g: 8/255, b: 135/255 },   // #0d0887
        { r: 75/255, g: 3/255, b: 161/255 },   // #4b03a1
        { r: 133/255, g: 15/255, b: 186/255 },  // #850fba
        { r: 185/255, g: 36/255, b: 177/255 },  // #b924b1
        { r: 229/255, g: 74/255, b: 157/255 },  // #e54a9d
        { r: 254/255, g: 113/255, b: 126/255 }, // #fe717e
        { r: 255/255, g: 156/255, b: 84/255 },  // #ff9c54
        { r: 255/255, g: 199/255, b: 40/255 },  // #ffc728
        { r: 249/255, g: 248/255, b: 10/255 },  // #f9f80a
        { r: 240/255, g: 249/255, b: 33/255 }   // #f0f921
    ];
    const stops = [0, 1/9, 2/9, 3/9, 4/9, 5/9, 6/9, 7/9, 8/9, 1];

    // Find the segment index
    let i = 0;
    for (let j = 0; j < stops.length - 1; j++) {
        if (value >= stops[j] && value <= stops[j + 1]) {
            i = j;
            break;
        }
    }
    // Handle the case where value is exactly 1, it should map to the last color
    if (value === 1) {
        i = stops.length - 2; // This ensures endColor is colors[stops.length - 1]
    }

    const startColor = colors[i];
    const endColor = colors[i + 1];
    const startStop = stops[i];
    const endStop = stops[i + 1];

    let factor = 0;
    if (endStop !== startStop) {
        factor = (value - startStop) / (endStop - startStop);
    }

    const r = startColor.r + factor * (endColor.r - startColor.r);
    const g = startColor.g + factor * (endColor.g - startColor.g);
    const b = startColor.b + factor * (endColor.b - startColor.b);

    return { r: r, g: g, b: b };
}

// Create a circular texture for points
function createCircleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.beginPath();
    context.arc(32, 32, 30, 0, Math.PI * 2, false);
    context.fillStyle = 'white';
    context.fill();
    return new THREE.CanvasTexture(canvas);
}
const circleTexture = createCircleTexture();

// --- HELPER FUNCTIONS ---
function makeTextSprite(message, parameters) {

    if ( parameters === undefined ) parameters = {};
    const fontface = parameters.hasOwnProperty("fontface") ? parameters["fontface"] : "Arial";
    const fontsize = parameters.hasOwnProperty("fontsize") ? parameters["fontsize"] : 40;
    const borderThickness = 0; // No border
    const textColor = parameters.hasOwnProperty("textColor") ? parameters["textColor"] : { r:255, g:255, b:255, a:1.0 };

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = fontsize + "px " + fontface; // Removed "Bold "

    const metrics = context.measureText( message );
    const textWidth = metrics.width;

    canvas.width = textWidth + borderThickness * 2;
    canvas.height = fontsize * 1.4 + borderThickness * 2;

    context.font = fontsize + "px " + fontface; // Removed "Bold "
    context.textAlign = "center";
    context.textBaseline = "middle";

    context.fillStyle = "rgba(" + textColor.r + ", " + textColor.g + ", " + textColor.b + ", 1.0)";
    context.fillText( message, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.Texture(canvas) 
    texture.needsUpdate = true;

    const spriteMaterial = new THREE.SpriteMaterial( { map: texture } );
    const sprite = new THREE.Sprite( spriteMaterial );
    sprite.scale.set(canvas.width / fontsize, canvas.height / fontsize, 1.0); // Adjust scale based on canvas size, more neutral
    return sprite;  
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y);
    ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r);
    ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h);
    ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r);
    ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();   

}

// Function to create a circular point sprite
function makePointSprite(color, opacity) {

    const spriteMaterial = new THREE.SpriteMaterial({
        map: circleTexture,
        color: color,
        transparent: true,
        opacity: opacity,
        alphaTest: 0.1 // Use alphaTest for transparency

    });

    const sprite = new THREE.Sprite(spriteMaterial);
    return sprite;

}

function updatePivotButtonSelection(selectedIndex) {

    if (!pivotButtons) return; // Ensure buttons are initialized

    pivotButtons.forEach(button => {

        if (parseInt(button.dataset.pivotIndex) === selectedIndex) {
            button.classList.add('selected');
        } else {
            button.classList.remove('selected');
        }
    });
    currentPivotVoiceIndex = selectedIndex; // Update the global variable
}

// --- CORE THREE.JS FUNCTIONS ---
// isShiftHeld and currentlyHovered are now declared globally at the top of the file

function onKeyDown(event) {
    if (event.key === 'Shift' && !isShiftHeld) {
        isShiftHeld = true;
        if (controls) controls.enablePan = false;
        if (playButton) playButton.classList.add('play-button-active');
        stopChord(); // Stop any current chord when Shift is pressed
    } else if (['S', 'A', 'T', 'B'].includes(event.key.toUpperCase())) {
        let selectedIndex;
        switch (event.key.toUpperCase()) {
            case 'S': selectedIndex = 3; break;
            case 'A': selectedIndex = 2; break;
            case 'T': selectedIndex = 1; break;
            case 'B': selectedIndex = 0; break;
            default: return; // Should not happen
        }
        updatePivotButtonSelection(selectedIndex);
        event.preventDefault(); // Prevent any default browser action for these keys
    }
}

function onKeyUp(event) {
    if (event.key === 'Shift') {
        isShiftHeld = false;
        if (!isClickPlayModeActive) { // Only enable pan if click play mode is not active
            if (controls) controls.enablePan = true;
            if (playButton) playButton.classList.remove('play-button-active');
        } else {
            // If click play mode is active, the button stays active
        }
        stopChord(); // Stop any current chord when Shift is released
        currentlyHovered = null; // Clear hovered object
    }
}

function onMouseMove(event) {
    if (!isShiftHeld) {
        if (currentlyHovered) {
            stopChord();
            currentlyHovered = null;
        }
        return;
    }

    initAudio();

    const mouse = new THREE.Vector2();
    const canvasBounds = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - canvasBounds.left) / canvasBounds.width) * 2 - 1;
    mouse.y = -((event.clientY - canvasBounds.top) / canvasBounds.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(currentSprites);

    if (intersects.length > 0) {
        const firstHit = intersects[0].object;
        if (currentlyHovered !== firstHit) {
                            if (firstHit.userData.ratio) {
                                currentlyHovered = firstHit;
                                playChord(firstHit.userData.ratio);
                            }        }
    } else {
        if (currentlyHovered) {
            stopChord();
            currentlyHovered = null;
        }
    }
}

function onClick(event) {
    if (!isClickPlayModeActive) {
        // If click play mode is not active, do nothing
        return;
    }

    // If Shift is held, we prefer hover interaction, so click does nothing
    if (isShiftHeld) {
        return;
    }

    initAudio();

    const mouse = new THREE.Vector2();
    const canvasBounds = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - canvasBounds.left) / canvasBounds.width) * 2 - 1;
    mouse.y = -((event.clientY - canvasBounds.top) / canvasBounds.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(currentSprites);

    if (intersects.length > 0) {
        const firstHit = intersects[0].object;
        if (firstHit.userData.ratio) {
            playChord(firstHit.userData.ratio);
        }
    } else {
        stopChord(); // If clicked outside any object, stop current sound
    }
}


function initThreeJS() {
    const container = document.getElementById('container');
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 3, 6);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.screenSpacePanning = false;
    controls.minDistance = 1;
    controls.maxDistance = 30;

    window.addEventListener('keydown', onKeyDown, false);
    window.addEventListener('keyup', onKeyUp, false);
    renderer.domElement.addEventListener('mousemove', onMouseMove, false);
    renderer.domElement.addEventListener('click', onClick, false); // New click listener
    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    if (currentLayoutDisplay === 'labels' || currentLayoutDisplay === 'points') {
        currentSprites.forEach(sprite => {
            const distance = camera.position.distanceTo(sprite.position);
            let currentSpriteSize = 0.5;

            if (sprite.userData.type === 'label') {
                if (sprite.userData.enableSize) {
                    const baseScreenSize = sprite.userData.baseSize * 0.5;
                    const scaledSize = baseScreenSize + (sprite.userData.normalizedComplexity * baseScreenSize * (sprite.userData.scalingFactor - 1));
                    currentSpriteSize = Math.max(baseScreenSize, scaledSize);
                } else {
                    currentSpriteSize = sprite.userData.baseSize * 0.5;
                }
            } else if (sprite.userData.type === 'point') {
                if (sprite.userData.enableSize) {
                    const baseScreenSize = sprite.userData.baseSize * 0.01;
                    const scaledSize = baseScreenSize + (sprite.userData.normalizedComplexity * baseScreenSize * (sprite.userData.scalingFactor - 1));
                    currentSpriteSize = Math.max(baseScreenSize, scaledSize);
                } else {
                    currentSpriteSize = sprite.userData.baseSize * 0.01;
                }
            }
            
            sprite.scale.set(currentSpriteSize * distance, currentSpriteSize * distance, 1);
        });
    }

    renderer.render(scene, camera);
}

// Transformation function for an apex-up regular tetrahedron
function transformToRegularTetrahedron(c1, c2, c3, max_val) {
    const u = c1 / max_val;
    const v = c2 / max_val;
    const w = c3 / max_val;

    const side_length = 3.0;
    const L = side_length;

    const h_apex = L * Math.sqrt(2/3);
    const r_base = L * Math.sqrt(3)/3;
    
    const T_apex = new THREE.Vector3(0, 0, h_apex);
    const T_base1 = new THREE.Vector3(r_base, 0, 0); 
    const T_base2 = new THREE.Vector3(r_base * Math.cos(2*Math.PI/3), r_base * Math.sin(2*Math.PI/3), 0);
    const T_base3 = new THREE.Vector3(r_base * Math.cos(4*Math.PI/3), r_base * Math.sin(4*Math.PI/3), 0);

    const a0 = 1 - u - v - w;
    const a1 = u;
    const a2 = v;
    const a3 = w;

    const x_transformed = a0 * T_apex.x + a1 * T_base1.x + a2 * T_base2.x + a3 * T_base3.x;
    const y_transformed = a0 * T_apex.y + a1 * T_base1.y + a2 * T_base2.y + a3 * T_base3.y;
    const z_transformed = a0 * T_apex.z + a1 * T_base1.z + a2 * T_base2.z + a3 * T_base3.z;
    
    const overall_vertical_offset = -h_apex / 2; 

    return [x_transformed, y_transformed, z_transformed + overall_vertical_offset];
}

// --- TETRAHEDRON DATA GENERATION AND RENDERING ---
async function updateTetrahedron(limit_value, equave_ratio, complexity_method, hide_unison_voices, omit_octaves, base_size, scaling_factor, enable_size, enable_color, layout_display) {
    if (!python_ready) {
        console.warn("Python environment not ready yet. Please wait.");
        return;
    }
    
    while(scene.children.length > 0){ 
        scene.remove(scene.children[0]); 
    }
    currentSprites = [];

    const max_cents_value = 1200 * Math.log2(equave_ratio);

    pyodide.globals.set("py_hide_unison_voices", hide_unison_voices);
    pyodide.globals.set("py_omit_octaves", omit_octaves);

    const points_py_code = `
        from tetrahedron_generator import generate_odd_limit_points
        generate_odd_limit_points(
            limit_value=${limit_value}, 
            equave_ratio=${equave_ratio}, 
            limit_mode="odd", 
            complexity_measure="${complexity_method}", 
            hide_unison_voices=py_hide_unison_voices, 
            omit_octaves=py_omit_octaves
        )
    `;
    const labels_py_code = `
        from theory.calculations import generate_ji_tetra_labels
        generate_ji_tetra_labels(
            limit_value=${limit_value}, 
            equave_ratio=${equave_ratio}, 
            limit_mode="odd", 
            complexity_measure="${complexity_method}", 
            hide_unison_voices=py_hide_unison_voices, 
            omit_octaves=py_omit_octaves
        )
    `;

    const raw_points_data = await pyodide.runPythonAsync(points_py_code);
    const raw_labels_data = await pyodide.runPythonAsync(labels_py_code);

    const positions = [];
    const colors = [];
    const color = new THREE.Color();

    let minComplexity = Infinity;
    let maxComplexity = -Infinity;
    if (raw_points_data.length > 0) {
        raw_points_data.forEach(p => {
            minComplexity = Math.min(minComplexity, p[3]);
            maxComplexity = Math.max(maxComplexity, p[3]);
        });
    }

    const labels_map = new Map();
    raw_labels_data.forEach(label_item => {
        const coords_key = `${label_item[0][0].toFixed(2)},${label_item[0][1].toFixed(2)},${label_item[0][2].toFixed(2)}`;
        labels_map.set(coords_key, label_item[1]);
    });


    const label_conversion_factor = 0.066;
    const point_conversion_factor = 2.5;

    const internal_label_base_size = base_size * label_conversion_factor;
    const internal_point_base_size = base_size * point_conversion_factor;

    raw_points_data.forEach(p => {
        const c1 = p[0];
        const c2 = p[1];
        const c3 = p[2];
        
        const [transformed_x, transformed_y, transformed_z] = transformToRegularTetrahedron(c1, c2, c3, max_cents_value);

        positions.push(transformed_x, transformed_y, transformed_z);

        let normalizedComplexity = (p[3] - minComplexity) / (maxComplexity - minComplexity);
        
        let invertedComplexity = 1 - normalizedComplexity;

        let displayColor = new THREE.Color();
        let spriteTextColor = { r:255, g:255, b:255, a:1.0 };
        let spritePointColor = new THREE.Color(1, 1, 1);
        let spritePointOpacity = 0.7;

        if (enable_color) {
            const colorScalingFactor = scaling_factor / 2;
            let scaledComplexity = invertedComplexity * colorScalingFactor;
            scaledComplexity = Math.min(1, Math.max(0, scaledComplexity));
            
            const plasmaColor = plasmaColormap(scaledComplexity);
            displayColor.setRGB(plasmaColor.r, plasmaColor.g, plasmaColor.b);
            spriteTextColor = { r: plasmaColor.r * 255, g: plasmaColor.g * 255, b: plasmaColor.b * 255, a:1.0 };
            spritePointColor.setRGB(plasmaColor.r, plasmaColor.g, plasmaColor.b);
        } else {
            displayColor.setRGB(1, 1, 1);
            spritePointColor.setRGB(1, 1, 1);
        }
        colors.push(displayColor.r, displayColor.g, displayColor.b);

        const coords_key = `${p[0].toFixed(2)},${p[1].toFixed(2)},${p[2].toFixed(2)}`;
        const label_text = labels_map.get(coords_key);

        if (layout_display === 'labels') {
            if (label_text) {
                const sprite = makeTextSprite(label_text, { textColor: spriteTextColor });
                sprite.position.set(transformed_x + 0.05, transformed_y + 0.05, transformed_z);
                sprite.userData.normalizedComplexity = invertedComplexity;
                sprite.userData.baseSize = internal_label_base_size;
                sprite.userData.scalingFactor = scaling_factor;
                sprite.userData.enableSize = enable_size;
                sprite.userData.type = 'label';
                sprite.userData.ratio = label_text;
                scene.add(sprite);
                currentSprites.push(sprite);
            }
        } else if (layout_display === 'points') {
            const sprite = makePointSprite(spritePointColor, spritePointOpacity);
            sprite.position.set(transformed_x, transformed_y, transformed_z);
            sprite.userData.normalizedComplexity = invertedComplexity;
            sprite.userData.baseSize = internal_point_base_size;
            sprite.userData.scalingFactor = scaling_factor;
            sprite.userData.enableSize = enable_size;
            sprite.userData.type = 'point';
            if (label_text) {
                sprite.userData.ratio = label_text;
            }
            scene.add(sprite);
            currentSprites.push(sprite);
        }
    });
}

// --- MAIN PYODIDE INITIALIZATION ---
async function initPyodide() {
    loadingOverlay.style.display = 'flex';
    pyodide = await loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/",
    });
    console.log("Pyodide loaded.");

    pyodide.setStdout({
        write: (msg) => {
            console.log("Python stdout:", msg);
        }
    });
    pyodide.setStderr({
        write: (msg) => {
            console.error("Python stderr:", msg);
        }
    });

    await pyodide.loadPackage(["numpy", "scipy"]);
    console.log("Numpy and Scipy loaded.");

    pyodide.FS.mkdir("python");
    pyodide.FS.mkdir("python/theory");

    const tetrahedron_generator_py_content = `import math
import numpy as np
import scipy.signal
from itertools import combinations_with_replacement
from fractions import Fraction
from theory.calculations import get_odd_limit, _generate_valid_numbers, calculate_complexity

def cents(x):
    return 1200 * np.log2(x)

def generate_tetrahedron_data(equave_ratio, resolution):
    n_limit = 60
    c_limit = 2_000_000

    f = []
    equave_ratio_float = float(equave_ratio)
    
    for i in range(1, n_limit):
        j_min = i
        j_max = min(math.floor(i * equave_ratio_float) + 1, int(pow(c_limit / i, 1/3)) + 1)
        if j_max < j_min: continue
        for j in range(j_min, j_max):
            k_min = j
            k_max = min(math.floor(j * equave_ratio_float) + 1, int(pow(c_limit / (i * j), 1/2)) + 1)
            if k_max < k_min: continue
            for k in range(k_min, k_max):
                l_min = k
                l_max = min(math.floor(k * equave_ratio_float) + 1, c_limit // (i * j * k) + 1)
                if l_max < l_min: continue
                for l in range(l_min, l_max):
                    if math.gcd(math.gcd(math.gcd(i, j), k), l) == 1:
                        f.append([i, j, k, l])
    
    if not f:
        return None, None, None, None

    f = np.array(f, dtype=np.float64)

    w = 1.0 / np.sqrt(np.prod(f, axis=1))

    c1 = cents(f[:, 1] / f[:, 0])
    c2 = cents(f[:, 2] / f[:, 1])
    c3 = cents(f[:, 3] / f[:, 2])

    max_cents = 1200 * np.log2(equave_ratio_float)
    
    cx = np.round((c1 / max_cents) * (resolution - 1)).astype(int)
    cy = np.round((c2 / max_cents) * (resolution - 1)).astype(int)
    cz = np.round((c3 / max_cents) * (resolution - 1)).astype(int)

    mask = (cx >= 0) & (cx < resolution) & (cy >= 0) & (cy < resolution) & (cz >= 0) & (cz < resolution)
    cx, cy, cz, w = cx[mask], cy[mask], cz[mask], w[mask]

    coords = (cz, cy, cx)

    alpha = 7
    
    k = np.zeros(shape=(resolution, resolution, resolution), dtype=np.float64)
    k_a = np.zeros(shape=(resolution, resolution, resolution), dtype=np.float64)

    np.add.at(k, coords, w)
    np.add.at(k_a, coords, w**alpha)

    std = 2.0
    s_range = round(std * 2)
    x_s, y_s, z_s = np.mgrid[-s_range:s_range+1, -s_range:s_range+1, -s_range:s_range+1]
    s_kernel = np.exp(-((x_s**2 + y_s**2 + z_s**2) / (2 * std**2)))

    prod_k_s = scipy.signal.convolve(k, s_kernel, mode='same')
    prod_k_s_alpha = scipy.signal.convolve(k_a, s_kernel**alpha, mode='same')

    eps = 1e-16
    entropy = (1 / (1 - alpha)) * np.log((eps + prod_k_s_alpha) / (eps + prod_k_s**alpha))
    
    entropy[np.isnan(entropy)] = 0
    entropy = np.nanmax(entropy) - entropy

    c1_grid, c2_grid, c3_grid = np.mgrid[0:max_cents:complex(0, resolution), 0:max_cents:complex(0, resolution), 0:max_cents:complex(0, resolution)]
    
    mask = c1_grid + c2_grid + c3_grid > max_cents
    mask = np.transpose(mask, (2, 1, 0))

    mask |= (k == 0)
    
    entropy[mask] = np.nan

    return c1_grid, c2_grid, c3_grid, entropy

def generate_odd_limit_points(limit_value, equave_ratio, limit_mode="odd", complexity_measure="Tenney", hide_unison_voices=False, omit_octaves=False):
    points = []
    equave_ratio_float = float(equave_ratio)
    
    valid_numbers = _generate_valid_numbers(limit_value, limit_mode)

    if not valid_numbers:
        return []

    sorted_valid_numbers = sorted(list(valid_numbers))
    
    for combo in combinations_with_replacement(sorted_valid_numbers, 4):
        if hide_unison_voices and len(set(combo)) < 4:
            continue

        if omit_octaves:
            has_octave = False
            for i in range(len(combo)):
                for j in range(i + 1, len(combo)):
                    if combo[j] == combo[i] * 2:
                        has_octave = True
                        break
                if has_octave:
                    break
            if has_octave:
                continue

        i, j, k, l = combo
        
        if l / i > equave_ratio_float:
            continue
            
        if math.gcd(math.gcd(math.gcd(i, j), k), l) != 1:
            continue
            
        if limit_mode == "odd":
            if (get_odd_limit(Fraction(j, i)) > limit_value or
                get_odd_limit(Fraction(k, j)) > limit_value or
                get_odd_limit(Fraction(l, k)) > limit_value):
                continue
        
        c1 = cents(j / i)
        c2 = cents(k / j)
        c3 = cents(l / k)
        
        complexity = max(
            calculate_complexity(complexity_measure, Fraction(j, i)),
            calculate_complexity(complexity_measure, Fraction(k, j)),
            calculate_complexity(complexity_measure, Fraction(l, k))
        )
        
        points.append((c1, c2, c3, complexity))
        
    return points
`;
    pyodide.FS.writeFile("python/tetrahedron_generator.py", tetrahedron_generator_py_content, { encoding: "utf8" });

    const calculations_py_content = `import math
import numpy as np
from fractions import Fraction
from functools import reduce
from math import gcd
from itertools import combinations_with_replacement

def cents(x):
    return 1200 * np.log2(x)

def calculate_edo_step(cents, edo):
    step_size = 1200 / edo
    step = round(cents / step_size)
    error = step * step_size - cents
    step_str = f"-{abs(step)}" if step < 0 else str(step)
    return step_str, error

def calculate_12edo_step(cents):
    step_size = 1200 / 12
    step = round(cents / step_size)
    error = step * step_size - cents
    return step, error

def ratio_to_cents(ratio):
    return 1200 * math.log2(ratio)

def generate_iso_series(fundamental, isoharmonic, partials_above, partials_below):
    series = []
    current_ratio = isoharmonic
    for _ in range(partials_below):
        current_ratio = current_ratio - fundamental
        series.insert(0, current_ratio)
    series.append(isoharmonic)
    current_ratio = isoharmonic
    for _ in range(partials_above):
        current_ratio = current_ratio + fundamental
        series.append(current_ratio)
    return series

def find_gcd(list):
    return reduce(gcd, list)

def find_lcd(denominators):
    def lcm(a, b):
        return a * b // gcd(a, b)
    return reduce(lcm, denominators)

def format_series_segment(series):
    fractions = [Fraction(ratio).limit_denominator() for ratio in series]
    denominators = [frac.denominator for frac in fractions]
    lcd = find_lcd(denominators)
    numerators = [int(frac.numerator * (lcd / frac.denominator)) for frac in fractions] # Fixed: use frac.denominator instead of hardcoded 1
    
    if lcd == 1:
        return ':'.join(map(str, numerators))
    else:
        return f"({':'.join(map(str, numerators))})/{lcd}"

def simplify_ratio(ratio):
    frac = Fraction(ratio).limit_denominator()
    return f"{frac.numerator}/{frac.denominator}"

def get_odd_part_of_number(num):
    if num == 0:
        return 0
    while num > 0 and num % 2 == 0:
        num //= 2
    return num

def get_odd_limit(ratio):
    """Calculates the odd limit of a given ratio."""
    try:
        ratio = Fraction(ratio).limit_denominator(10000)
        n, d = ratio.numerator, ratio.denominator
        
        n_odd_part = get_odd_part_of_number(n)
        d_odd_part = get_odd_part_of_number(d)
            
        return max(n_odd_part, d_odd_part)
    except (ValueError, ZeroDivisionError):
        return 1

def get_integer_limit(ratio):
    """Calculates the integer limit of a given ratio."""
    try:
        ratio = Fraction(ratio).limit_denominator(10000)
        return max(ratio.numerator, ratio.denominator)
    except (ValueError, ZeroDivisionError):
        return 1

def get_prime_factorization(n):
    factors = []
    d = 2
    while d * d <= n:
        while (n % d) == 0:
            factors.append(d)
            n //= d
        d += 1
    if n > 1:
       factors.append(n)
    return factors

def tenney_norm(ratio):
    ratio = Fraction(ratio).limit_denominator(10000)
    return math.log2(ratio.numerator * ratio.denominator)

def weil_norm(ratio):
    ratio = Fraction(ratio).limit_denominator(10000)
    return math.log2(max(ratio.numerator, ratio.denominator))

def wilson_norm(ratio):
    ratio = Fraction(ratio).limit_denominator(10000)
    factors_n = get_prime_factorization(ratio.numerator)
    factors_d = get_prime_factorization(ratio.denominator)
    return sum(factors_n) + sum(factors_d)

def gradus_norm(ratio):
    ratio = Fraction(ratio).limit_denominator(10000)
    factors_n = get_prime_factorization(ratio.numerator)
    factors_d = get_prime_factorization(ratio.denominator)
    s = sum(factors_n) + sum(factors_d)
    n = len(factors_n) + len(factors_d)
    return s - n + 1

def calculate_complexity(complexity_measure, ratio):
    if complexity_measure == "Tenney":
        return tenney_norm(ratio)
    elif complexity_measure == "Weil":
        return weil_norm(ratio)
    elif complexity_measure == "Wilson":
        return wilson_norm(ratio)
    elif complexity_measure == "Gradus":
        return gradus_norm(ratio)
    else:
        return 0

def _generate_valid_numbers(limit_value, limit_mode):
    """
    Generates a set of valid numbers based on the limit mode.
    """
    valid_numbers = set()
    if limit_mode == "odd":
        max_num_to_check = max(limit_value * 2, 100)
        for num in range(1, max_num_to_check + 1):
            if get_odd_part_of_number(num) <= limit_value:
                valid_numbers.add(num)
    elif limit_mode == "integer":
        valid_numbers = set(range(1, limit_value + 1))
    return valid_numbers

def generate_ji_tetra_labels(limit_value, equave_ratio, limit_mode="odd", complexity_measure="Tenney", hide_unison_voices=False, omit_octaves=False):
    """
    Generates a list of 4-note JI chords (labels) and their 3D coordinates (c1, c2, c3)
    and complexity for the tetrahedron.
    """
    labels_data = []
    equave_ratio_float = float(equave_ratio)

    valid_numbers = _generate_valid_numbers(limit_value, limit_mode)
            
    if not valid_numbers:
        return []

    sorted_valid_numbers = sorted(list(valid_numbers))
    
    for combo in combinations_with_replacement(sorted_valid_numbers, 4):
        if hide_unison_voices and len(set(combo)) < 4:
            continue

        if omit_octaves:
            has_octave = False
            for i in range(len(combo)):
                for j in range(i + 1, len(combo)):
                    if combo[j] == combo[i] * 2:
                        has_octave = True
                        break
                if has_octave:
                    break
            if has_octave:
                continue

        i, j, k, l = combo
        
        if l / i > equave_ratio_float:
            continue
            
        if math.gcd(math.gcd(math.gcd(i, j), k), l) != 1:
            continue

        if limit_mode == "odd":
            if (get_odd_limit(Fraction(j, i)) > limit_value or
                get_odd_limit(Fraction(k, j)) > limit_value or
                get_odd_limit(Fraction(l, k)) > limit_value):
                continue
            
        c1 = cents(j / i)
        c2 = cents(k / j)
        c3 = cents(l / k)
        
        complexity = max(
            calculate_complexity(complexity_measure, Fraction(j, i)),
            calculate_complexity(complexity_measure, Fraction(k, j)),
            calculate_complexity(complexity_measure, Fraction(l, k))
        )
        
        label = f"{i}:{j}:{k}:{l}"
        
        labels_data.append(((c1, c2, c3), label, complexity))
        
    return labels_data

def get_primes_less_than_or_equal_to(p):
    primes = []
    for num in range(2, p + 1):
        is_prime = True
        for i in range(2, int(num**0.5) + 1):
            if num % i == 0:
                is_prime = False
                break
        if is_prime:
            primes.append(num)
    return primes

def get_max_exponent_for_p_smooth(n, p_limit, primes=None):
    if primes is None:
        primes = get_primes_less_than_or_equal_to(p_limit)
    
    max_exp = 0
    
    temp_n = n
    for p in primes:
        if temp_n == 1:
            break
        if temp_n % p == 0:
            exp = 0
            while temp_n % p == 0:
                exp += 1
                temp_n //= p
            max_exp = max(max_exp, exp)
            
    if temp_n > 1:
        return float('inf')
        
    return max_exp

def generate_ji_triads(limit_value, equave=Fraction(2,1), limit_mode="odd", prime_limit=7, max_exponent=4):
    if limit_value < 1 and limit_mode != "prime":
        return []

    valid_intervals = set([Fraction(1,1)])
    
    max_val_for_n_d = 0
    if limit_mode == "odd" or limit_mode == "integer":
        max_val_for_n_d = limit_value * 3
    elif limit_mode == "prime":
        # For prime limit, we need a different approach to find the max value for n and d
        # A rough estimation could be prime_limit ^ max_exponent
        max_val_for_n_d = prime_limit * max_exponent * 3 # Heuristic

    primes = None
    if limit_mode == "prime":
        primes = get_primes_less_than_or_equal_to(prime_limit)

    for n_val in range(1, max_val_for_n_d + 1):
        for d_val in range(1, max_val_for_n_d + 1):
            if n_val == 0 or d_val == 0: continue
            ratio = Fraction(n_val, d_val)
            
            if limit_mode == "odd":
                if get_odd_limit(ratio) <= limit_value:
                    valid_intervals.add(ratio)
            elif limit_mode == "integer":
                if get_integer_limit(ratio) <= limit_value:
                    valid_intervals.add(ratio)
            elif limit_mode == "prime":
                num_exp = get_max_exponent_for_p_smooth(ratio.numerator, prime_limit, primes)
                den_exp = get_max_exponent_for_p_smooth(ratio.denominator, prime_limit, primes)
                if num_exp <= max_exponent and den_exp <= max_exponent:
                    valid_intervals.add(ratio)

    if limit_mode == "odd":
        if get_odd_limit(equave) <= limit_value:
            valid_intervals.add(equave)
    elif limit_mode == "integer":
        if get_integer_limit(equave) <= limit_value:
            valid_intervals.add(equave)
    elif limit_mode == "prime":
        num_exp = get_max_exponent_for_p_smooth(equave.numerator, prime_limit, primes)
        den_exp = get_max_exponent_for_p_smooth(equave.denominator, prime_limit, primes)
        if num_exp <= max_exponent and den_exp <= max_exponent:
            valid_intervals.add(equave)

    sorted_intervals = sorted(list(valid_intervals))

    triads = []
    triad_labels = set()

    for i in range(len(sorted_intervals)):
        r1 = sorted_intervals[i]
        for j in range(i, len(sorted_intervals)):
            r2 = sorted_intervals[j]
            
            r3 = r2 / r1
            
            cx_ratio = None
            cy_ratio = None

            if limit_mode == "odd":
                if get_odd_limit(r3) <= limit_value:
                    cx_ratio = r1
                    cy_ratio = r3
            elif limit_mode == "integer":
                if get_integer_limit(r3) <= limit_value:
                    cx_ratio = r1
                    cy_ratio = r3
            elif limit_mode == "prime":
                num_exp = get_max_exponent_for_p_smooth(r3.numerator, prime_limit, primes)
                den_exp = get_max_exponent_for_p_smooth(r3.denominator, prime_limit, primes)
                if num_exp <= max_exponent and den_exp <= max_exponent:
                    cx_ratio = r1
                    cy_ratio = r3

            if cx_ratio is None or cy_ratio is None: continue

            if cx_ratio < 1 or cy_ratio < 1: continue

            cx = 1200 * math.log2(cx_ratio)
            cy = 1200 * math.log2(cy_ratio)

            if cx + cy > 1200 * math.log2(equave) + 1e-9: continue

            common_denom = r1.denominator * r2.denominator
            a = common_denom
            b = r1.numerator * r2.denominator
            c = r2.numerator * r1.denominator
            
            common_divisor = gcd(gcd(a,b),c)
            sa, sb, sc = a//common_divisor, b//common_divisor, c//common_divisor
            
            sorted_triad = sorted([sa, sb, sc])
            label = f"{sorted_triad[0]}:{sorted_triad[1]}:{sorted_triad[2]}"

            if label not in triad_labels:
                triads.append(((cx, cy), label))
                triad_labels.add(label)

    return triads
`;
    pyodide.FS.writeFile("python/theory/calculations.py", calculations_py_content, { encoding: "utf8" });
    pyodide.FS.writeFile("python/theory/__init__.py", "", { encoding: "utf8" }); // Create __init__.py

    // Add current directory to Python path
    pyodide.runPython("import sys; sys.path.append('./python')");
    await pyodide.loadPackage("micropip"); // Install micropip first
    console.log("Micropip loaded.");
    // The 'fractions' module is part of Python's standard library and does not need micropip.install.
    // It's included with Pyodide by default.

    python_ready = true;
    loadingOverlay.style.display = 'none';

    initThreeJS(); // Calls the *single* definition of initThreeJS
    animate();
    
    const default_limit_value = parseFloat(document.getElementById('limitValue').value);
    const default_equave_ratio = parseFloat(document.getElementById('equaveRatio').value); // Default to octave
    const default_complexity_method = "Tenney"; // Default complexity method
    const default_hide_unison_voices = false;
    const default_omit_octaves = false;
    const default_base_size = parseFloat(document.getElementById('baseSize').value);
    const default_scaling_factor = parseFloat(document.getElementById('scalingFactor').value);
    const default_enable_size = document.getElementById('enableSize').checked;
    const default_enable_color = document.getElementById('enableColor').checked;
    const default_layout_display = document.getElementById('layoutDisplay').value;
    currentLayoutDisplay = default_layout_display; // Set global variable

    playButton = document.getElementById('playButton'); // Get reference to the new play button
    pivotButtons = document.querySelectorAll('.pivot-button'); // Initialize global pivotButtons

    // Set initial selection based on default currentPivotVoiceIndex (Bass, index 0)
    updatePivotButtonSelection(currentPivotVoiceIndex);

    pivotButtons.forEach(button => {
        button.addEventListener('click', () => {
            const selectedIndex = parseInt(button.dataset.pivotIndex);
            updatePivotButtonSelection(selectedIndex);
        });
    });

    // Add event listener for the play button
    await updateTetrahedron(
        default_limit_value, 
        default_equave_ratio, 
        default_complexity_method, 
        default_hide_unison_voices, 
        default_omit_octaves,
        default_base_size, // Changed from point_size
        default_scaling_factor,
        default_enable_size,
        default_enable_color,
        default_layout_display
    );

    // Add event listener for the play button
    playButton.addEventListener('click', () => {
        isClickPlayModeActive = !isClickPlayModeActive; // Toggle the state
        if (isClickPlayModeActive) {
            playButton.classList.add('play-button-active');
            if (controls) controls.enabled = false; // Disable OrbitControls to allow clicking on objects
        } else {
            playButton.classList.remove('play-button-active');
            if (controls) controls.enabled = true; // Re-enable OrbitControls
            // Only re-enable pan if Shift is not held down
            if (!isShiftHeld && controls) {
                controls.enablePan = true;
            }
            stopChord(); // Stop any playing chord
            currentlyHovered = null;
        }
    });

    // Add event listener for the update button
    document.getElementById('updateButton').addEventListener('click', async () => {
        const limitValue = parseFloat(document.getElementById('limitValue').value);
        const equaveRatio = parseFloat(document.getElementById('equaveRatio').value);
        const complexityMethod = document.getElementById('complexityMethod').value;
        const hideUnisonVoices = document.getElementById('hideUnisonVoices').checked;
        const omitOctaves = document.getElementById('omitOctaves').checked; // Corrected from parseFloat(document.getElementById('omitOctaves').value);
        const baseSize = parseFloat(document.getElementById('baseSize').value);
        const scalingFactor = parseFloat(document.getElementById('scalingFactor').value);
        const enableSize = document.getElementById('enableSize').checked;
        const enableColor = document.getElementById('enableColor').checked;
        const layoutDisplay = document.getElementById('layoutDisplay').value;
        currentLayoutDisplay = layoutDisplay; // Set global variable

        if (!isNaN(limitValue) && !isNaN(equaveRatio) && !isNaN(baseSize) && !isNaN(scalingFactor)) {
            await updateTetrahedron(
                limitValue, 
                equaveRatio, 
                complexityMethod, 
                hideUnisonVoices, 
                omitOctaves,
                baseSize, 
                scalingFactor,
                enableSize,
                enableColor,
                layoutDisplay
            );
        } else {
            console.error("Invalid input for limit value, equave ratio, base size, or scaling factor.");
        }
    });

    // Add keydown event listener for 'Enter' key to trigger update
    document.addEventListener('keydown', (event) => {
        // Check if the event target is an input field to avoid triggering on every enter
        const tagName = event.target.tagName;
        if (event.key === 'Enter' && tagName !== 'INPUT' && tagName !== 'TEXTAREA') {
            event.preventDefault(); // Prevent default action (e.g., submitting a form)
            document.getElementById('updateButton').click(); // Programmatically click the update button
        }
    });
}

// Initial call to start the application
initPyodide();

// --- Settings Menu Collapse/Expand ---
const settingsHeader = document.getElementById('settings-header');
const settingsContent = document.getElementById('settings-content');
const toggleIcon = settingsHeader.querySelector('.toggle-icon');

settingsHeader.addEventListener('click', () => {
    const isCollapsed = settingsHeader.classList.toggle('collapsed');
    if (isCollapsed) {
        settingsContent.style.display = 'none';
        toggleIcon.textContent = ' '; // Removing "▶" because its an ugly emoji on phone
    } else {
        settingsContent.style.display = 'grid'; // Or 'block', depending on its default display
        toggleIcon.textContent = '▼'; // Down arrow when expanded
    }
});

// Initially set to collapsed state
settingsHeader.classList.add('collapsed');
settingsContent.style.display = 'none';
toggleIcon.textContent = ' '; // Removing "▶" here too (because its an ugly emoji on phone)

// Add event listener for layout display change
document.getElementById('layoutDisplay').addEventListener('change', async () => {
    const limitValue = parseFloat(document.getElementById('limitValue').value);
    const equaveRatio = parseFloat(document.getElementById('equaveRatio').value);
    const complexityMethod = document.getElementById('complexityMethod').value;
    const hideUnisonVoices = document.getElementById('hideUnisonVoices').checked;
    const omitOctaves = document.getElementById('omitOctaves').checked;
    const baseSize = parseFloat(document.getElementById('baseSize').value);
    const scalingFactor = parseFloat(document.getElementById('scalingFactor').value);
    const enableSize = document.getElementById('enableSize').checked;
    const enableColor = document.getElementById('enableColor').checked;
    const layoutDisplay = document.getElementById('layoutDisplay').value;
    currentLayoutDisplay = layoutDisplay; // Update global variable

    if (!isNaN(limitValue) && !isNaN(equaveRatio) && !isNaN(baseSize) && !isNaN(scalingFactor)) {
        await updateTetrahedron(
            limitValue, 
            equaveRatio, 
            complexityMethod, 
            hideUnisonVoices, 
            omitOctaves,
            baseSize, 
            scalingFactor,
            enableSize,
            enableColor,
            layoutDisplay
        );
    } else {
        console.error("Invalid input for limit value, equave ratio, base size, or scaling factor.");
    }
});
