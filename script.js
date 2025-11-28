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
const rotationSpeed = 0.01;
let enableSlide = true;
let slideDuration = 0.25;
let currentPeriodicWave = null; // For custom waveforms
let compensationGainNode;

// Notation state
let enableNotation = true;
let notationType = 'ratio';
let notationDisplay;


const keyState = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false
};

// --- NOTATION FUNCTIONS ---
function toFraction(decimal, tolerance = 0.001) {
    if (decimal === 0) return "0/1";
    let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
    let b = decimal;
    do {
        let a = Math.floor(b);
        let aux = h1; h1 = a * h1 + h2; h2 = aux;
        aux = k1; k1 = a * k1 + k2; k2 = aux;
        b = 1 / (b - a);
    } while (Math.abs(decimal - h1 / k1) > decimal * tolerance && k1 < 1000);
    return `${h1}/${k1}`;
}

function updateNotationDisplay(ratioString, frequencies, effectiveBaseFreq) {
    if (!enableNotation || !notationDisplay) return;

    let output = '';
    if (notationType === 'ratio') {
        const baseRatio = effectiveBaseFreq / initialBaseFreq;
        const fractionString = toFraction(baseRatio);
        output = `${fractionString}<br>${ratioString}`;
    } else if (notationType === 'cents') {
        const cents = frequencies.map(freq => 1200 * Math.log2(freq / initialBaseFreq));
        // Display in descending order as per user example
        output = cents.reverse().map(c => Math.round(c)).join('<br>');
    }

    notationDisplay.innerHTML = output;
    notationDisplay.style.display = 'block';
}


// --- AUDIO ENGINE ---
let audioCtx;
let voices = []; // Array of { osc: OscillatorNode, gain: GainNode }
let mainGainNode;

function initAudio() {
    if (audioCtx) return; // Already initialized
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        mainGainNode = audioCtx.createGain();
        mainGainNode.connect(audioCtx.destination);
        compensationGainNode = audioCtx.createGain();
        compensationGainNode.connect(mainGainNode);
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
        audioCtx.resume().then(() => playChord(ratioString));
        return;
    }

    const ratio = ratioString.split(':').map(Number);
    if (ratio.length !== 4 || ratio.some(isNaN)) {
        console.error(`Invalid ratio format: ${ratioString}`);
        return;
    }

    let effectiveBaseFreq;
    if (lastPlayedFrequencies.length === 0) {
        effectiveBaseFreq = initialBaseFreq;
    } else {
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

    if (enableSlide && voices.length > 0) {
        const slideEndTime = audioCtx.currentTime + slideDuration;
        frequencies.forEach((freq, index) => {
            if (voices[index]) {
                const voice = voices[index];
                voice.osc.frequency.cancelScheduledValues(audioCtx.currentTime);
                // Set the starting point of the ramp to the current frequency
                voice.osc.frequency.setValueAtTime(voice.osc.frequency.value, audioCtx.currentTime);
                if (index === currentPivotVoiceIndex) {
                    voice.osc.frequency.linearRampToValueAtTime(freq, slideEndTime);
                } else {
                    voice.osc.frequency.linearRampToValueAtTime(freq, slideEndTime);
                }
            }
        });
    } else {
        stopChord(true); // Immediate stop
        voices = [];
        for (const freq of frequencies) {
            const osc = audioCtx.createOscillator();
            if (currentPeriodicWave) {
                osc.setPeriodicWave(currentPeriodicWave);
            } else {
                osc.type = 'sawtooth'; // Fallback
            }
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

            const gainNode = audioCtx.createGain();
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.5);

            osc.connect(gainNode);
            gainNode.connect(compensationGainNode);
            osc.start();
            voices.push({ osc, gain: gainNode });
        }
    }

    lastPlayedFrequencies = frequencies;
    lastPlayedRatios = ratio;

    updateNotationDisplay(ratioString, frequencies, effectiveBaseFreq);
}

function stopChord(immediate = false) {
    const fadeOutTime = immediate ? 0.01 : 0.5;
    const stopDelay = immediate ? 50 : 500;

    voices.forEach(voice => {
        voice.gain.gain.cancelScheduledValues(audioCtx.currentTime);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, audioCtx.currentTime);
        voice.gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + fadeOutTime);
    });

    if (notationDisplay) {
        notationDisplay.style.display = 'none';
    }

    const oldVoices = voices;
    voices = [];
    setTimeout(() => {
        oldVoices.forEach(voice => {
            voice.osc.stop();
            voice.osc.disconnect();
            voice.gain.disconnect();
        });
    }, stopDelay);
}

// --- WAVEFORM DRAWING AND WAVETABLE LOGIC ---
const numHarmonics = 64;
const sineCoeffs = new Float32Array(numHarmonics);
const triangleCoeffs = new Float32Array(numHarmonics);
const sawtoothCoeffs = new Float32Array(numHarmonics);
const squareCoeffs = new Float32Array(numHarmonics);

sineCoeffs[1] = 1;

for (let i = 1; i < numHarmonics; i++) {
    const n = i;
    // Sawtooth: 1/n
    sawtoothCoeffs[n] = 1 / n;
    if (n % 2 !== 0) {
        // Square: 1/n for odd harmonics
        squareCoeffs[n] = 1 / n;
        // Triangle: 1/n^2 for odd harmonics, with alternating sign
        triangleCoeffs[n] = (1 / (n * n)) * ((n - 1) % 4 === 0 ? 1 : -1);
    }
}

const waveCoeffs = [sineCoeffs, triangleCoeffs, sawtoothCoeffs, squareCoeffs];
const realCoeffs = new Float32Array(numHarmonics).fill(0); // All our waves are sine-based

// Gain compensation values to normalize perceived loudness.
// Sine, Triangle, Sawtooth, Square
const loudnessCompensation = [1.0, 1.0, 0.6, 0.75]; 

function updateWaveform(sliderValue) {
    if (!audioCtx) initAudio();

    // Handle the edge case for a pure square wave at the slider's maximum
    if (sliderValue >= 3) {
        const pureSquareCoeffs = waveCoeffs[3];
        if (compensationGainNode) {
            compensationGainNode.gain.setTargetAtTime(loudnessCompensation[3], audioCtx.currentTime, 0.01);
        }
        currentPeriodicWave = audioCtx.createPeriodicWave(realCoeffs, pureSquareCoeffs, { disableNormalization: false });
        drawWaveform(pureSquareCoeffs);
        return;
    }

    const floor = Math.floor(sliderValue);
    const ceil = Math.ceil(sliderValue);
    const mix = sliderValue - floor;

    const fromCoeffs = waveCoeffs[floor];
    const toCoeffs = waveCoeffs[ceil];

    const interpolatedImag = new Float32Array(numHarmonics);
    for (let i = 1; i < numHarmonics; i++) {
        const from = fromCoeffs[i] || 0;
        const to = toCoeffs[i] || 0;
        interpolatedImag[i] = from + (to - from) * mix;
    }

    // Interpolate gain compensation
    const fromGain = loudnessCompensation[floor];
    const toGain = loudnessCompensation[ceil];
    const interpolatedGain = fromGain + (toGain - fromGain) * mix;

    if (compensationGainNode) {
        compensationGainNode.gain.setTargetAtTime(interpolatedGain, audioCtx.currentTime, 0.01);
    }

    currentPeriodicWave = audioCtx.createPeriodicWave(realCoeffs, interpolatedImag, { disableNormalization: false });
    
    drawWaveform(interpolatedImag);
}

function drawWaveform(imag) {
    const canvas = document.getElementById('waveformCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = '#007bff';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const yCenter = height / 2;
    const amplitude = height * 0.4;

    let maxVal = 0;
    const wave = new Float32Array(width);
    for (let i = 0; i < width; i++) {
        const time = i / width;
        let y = 0;
        for (let n = 1; n < imag.length; n++) {
            y += imag[n] * Math.sin(2 * Math.PI * n * time);
        }
        wave[i] = y;
        if (Math.abs(y) > maxVal) {
            maxVal = Math.abs(y);
        }
    }

    // Normalize and draw
    ctx.moveTo(0, yCenter);
    for (let i = 0; i < width; i++) {
        const normalizedY = (wave[i] / maxVal) * amplitude;
        ctx.lineTo(i, yCenter - normalizedY);
    }
    ctx.stroke();
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
    const fontface = parameters.hasOwnProperty("fontface") ? parameters["fontface"] : "monospace";
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
    sprite.userData.textColor = textColor; // Store for SVG export
    sprite.userData.aspect = canvas.width / canvas.height;
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
        initAudio();
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

    if (keyState.hasOwnProperty(event.key)) {
        keyState[event.key] = true;
        event.preventDefault();
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

    if (keyState.hasOwnProperty(event.key)) {
        keyState[event.key] = false;
        event.preventDefault();
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
            }
        }
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

    if (keyState.ArrowUp) {
        scene.rotation.x -= rotationSpeed;
    }
    if (keyState.ArrowDown) {
        scene.rotation.x += rotationSpeed;
    }
    if (keyState.ArrowLeft) {
        scene.rotation.y -= rotationSpeed;
    }
    if (keyState.ArrowRight) {
        scene.rotation.y += rotationSpeed;
    }

    if (currentLayoutDisplay === 'labels' || currentLayoutDisplay === 'points') {
        const spriteWorldPosition = new THREE.Vector3();
        currentSprites.forEach(sprite => {
            sprite.getWorldPosition(spriteWorldPosition);
            const distance = camera.position.distanceTo(spriteWorldPosition);
            let currentSpriteSize;

            if (sprite.userData.type === 'label') {
                if (sprite.userData.enableSize) {
                    const baseScreenSize = sprite.userData.baseSize * 0.5;
                    const scaledSize = baseScreenSize + (sprite.userData.normalizedComplexity * baseScreenSize * (sprite.userData.scalingFactor - 1));
                    currentSpriteSize = Math.max(baseScreenSize, scaledSize);
                } else {
                    currentSpriteSize = sprite.userData.baseSize * 0.5;
                }
                const finalSize = currentSpriteSize * distance;
                sprite.scale.set(finalSize * sprite.userData.aspect, finalSize, 1);
            } else if (sprite.userData.type === 'point') {
                if (sprite.userData.enableSize) {
                    const baseScreenSize = sprite.userData.baseSize * 0.01;
                    const scaledSize = baseScreenSize + (sprite.userData.normalizedComplexity * baseScreenSize * (sprite.userData.scalingFactor - 1));
                    currentSpriteSize = Math.max(baseScreenSize, scaledSize);
                } else {
                    currentSpriteSize = sprite.userData.baseSize * 0.01;
                }
                const finalSize = currentSpriteSize * distance;
                sprite.scale.set(finalSize, finalSize, 1);
            }
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
async function updateTetrahedron(limit_type, limit_value, max_exponent, virtual_fundamental_filter, equave_ratio, complexity_method, hide_unison_voices, omit_octaves, base_size, scaling_factor, enable_size, enable_color, layout_display) {
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

    const py_limit_value = typeof limit_value === 'string' && limit_value.includes('.') ? `"${limit_value}"` : limit_value;
    const py_virtual_fundamental_filter = virtual_fundamental_filter ? JSON.stringify(virtual_fundamental_filter) : 'None';

    const points_py_code = `
        from tetrahedron_generator import generate_points
        generate_points(
            limit_value=${py_limit_value}, 
            equave_ratio=${equave_ratio}, 
            limit_mode="${limit_type.toLowerCase()}", 
            max_exponent=${max_exponent},
            complexity_measure="${complexity_method}", 
            hide_unison_voices=py_hide_unison_voices, 
            omit_octaves=py_omit_octaves,
            virtual_fundamental_filter=${py_virtual_fundamental_filter}
        )
    `;
    const labels_py_code = `
        from theory.calculations import generate_ji_tetra_labels
        generate_ji_tetra_labels(
            limit_value=${py_limit_value}, 
            equave_ratio=${equave_ratio}, 
            limit_mode="${limit_type.toLowerCase()}", 
            max_exponent=${max_exponent},
            complexity_measure="${complexity_method}", 
            hide_unison_voices=py_hide_unison_voices, 
            omit_octaves=py_omit_octaves,
            virtual_fundamental_filter=${py_virtual_fundamental_filter}
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

// --- SVG EXPORT ---
function exportToSVG() {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, 'svg');
    const width = window.innerWidth;
    const height = window.innerHeight;
    svg.setAttribute('xmlns', svgNS);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    
    const style = document.createElementNS(svgNS, 'style');
    style.textContent = `
        svg {
            background-color: ${scene.background.getStyle()};
        }
        text {
            font-family: monospace;
            text-anchor: middle;
            dominant-baseline: middle;
        }
    `;
    svg.appendChild(style);

    const spritesToExport = [...currentSprites];

    const cameraWorldPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraWorldPosition);
    
    spritesToExport.sort((a, b) => {
        const aPos = new THREE.Vector3().setFromMatrixPosition(a.matrixWorld);
        const bPos = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
        return aPos.distanceTo(cameraWorldPosition) - bPos.distanceTo(cameraWorldPosition);
    }).reverse();

    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();
    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);

    spritesToExport.forEach(sprite => {
        const pos = new THREE.Vector3().setFromMatrixPosition(sprite.matrixWorld);
        
        if (!frustum.containsPoint(pos)) {
            return;
        }

        const projectedPos = pos.clone().project(camera);
        const x = (projectedPos.x * 0.5 + 0.5) * width;
        const y = (-projectedPos.y * 0.5 + 0.5) * height;

        const svgExportBaseSize = sprite.userData.baseSize * 2.5;

        let currentSpriteSize;
        if (sprite.userData.type === 'label') {
            if (sprite.userData.enableSize) {
                const baseScreenSize = svgExportBaseSize * 0.5;
                const scaledSize = baseScreenSize + (sprite.userData.normalizedComplexity * baseScreenSize * (sprite.userData.scalingFactor - 1));
                currentSpriteSize = Math.max(baseScreenSize, scaledSize);
            } else {
                currentSpriteSize = svgExportBaseSize * 0.5;
            }

            const text = document.createElementNS(svgNS, 'text');
            text.setAttribute('x', x);
            text.setAttribute('y', y);
            
            const fontSize = currentSpriteSize * 30; // Heuristic value
            text.setAttribute('font-size', `${fontSize}px`);

            const color = sprite.userData.textColor;
            if (color) {
                text.setAttribute('fill', `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`);
            } else {
                text.setAttribute('fill', 'white');
            }
            
            text.textContent = sprite.userData.ratio;
            svg.appendChild(text);

        } else if (sprite.userData.type === 'point') {
            if (sprite.userData.enableSize) {
                const baseScreenSize = svgExportBaseSize * 0.01;
                const scaledSize = baseScreenSize + (sprite.userData.normalizedComplexity * baseScreenSize * (sprite.userData.scalingFactor - 1));
                currentSpriteSize = Math.max(baseScreenSize, scaledSize);
            } else {
                currentSpriteSize = svgExportBaseSize * 0.01;
            }

            const circle = document.createElementNS(svgNS, 'circle');
            circle.setAttribute('cx', x);
            circle.setAttribute('cy', y);
            
            const radius = currentSpriteSize * 100; // Heuristic value
            circle.setAttribute('r', radius);
            
            const color = sprite.material.color;
            circle.setAttribute('fill', color.getStyle());
            circle.setAttribute('fill-opacity', sprite.material.opacity);
            svg.appendChild(circle);
        }
    });

    return new XMLSerializer().serializeToString(svg);
}

function downloadSVG(svgString, filename) {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
from itertools import combinations_with_replacement
from fractions import Fraction
from theory.calculations import get_odd_limit, get_integer_limit, check_prime_limit, parse_primes, _generate_valid_numbers, calculate_complexity, cents, gcd, get_virtual_fundamental_denominator

def generate_points(limit_value, equave_ratio, limit_mode="odd", max_exponent=3, complexity_measure="Tenney", hide_unison_voices=False, omit_octaves=False, virtual_fundamental_filter=None):
    points = []
    equave_ratio_float = float(equave_ratio)
    
    valid_numbers = _generate_valid_numbers(limit_value, limit_mode, max_exponent, equave_ratio_float)

    if not valid_numbers: return []

    sorted_valid_numbers = sorted(list(valid_numbers))
    
    primes = []
    if limit_mode == "prime":
        primes = parse_primes(limit_value)

    for combo in combinations_with_replacement(sorted_valid_numbers, 4):
        if hide_unison_voices and len(set(combo)) < 4: continue
        
        if omit_octaves:
            has_octave = False
            for i in range(len(combo)):
                for j in range(i + 1, len(combo)):
                    if combo[i] == 0: continue
                    ratio = combo[j] / combo[i]
                    if ratio > 1 and math.isclose(math.log2(ratio), round(math.log2(ratio))):
                        has_octave = True
                        break
                if has_octave:
                    break
            if has_octave:
                continue

        i, j, k, l = combo
        
        if i == 0: continue
        if l / i > equave_ratio_float: continue
        if gcd(gcd(gcd(i, j), k), l) != 1: continue

        if virtual_fundamental_filter:
            vf_denom = get_virtual_fundamental_denominator(combo)
            if vf_denom is None or vf_denom not in virtual_fundamental_filter:
                continue
            
        valid_combo = True
        intervals = [Fraction(j, i), Fraction(k, j), Fraction(l, k)]
        if limit_mode == "odd":
            limit_val_int = int(limit_value)
            for interval in intervals:
                if get_odd_limit(interval) > limit_val_int:
                    valid_combo = False
                    break
        elif limit_mode == "integer":
            limit_val_int = int(limit_value)
            for interval in intervals:
                if get_integer_limit(interval) > limit_val_int:
                    valid_combo = False
                    break
        elif limit_mode == "prime":
            for interval in intervals:
                if not check_prime_limit(interval, primes, int(max_exponent)):
                    valid_combo = False
                    break
        
        if not valid_combo: continue
        
        c1 = cents(j / i)
        c2 = cents(k / j)
        c3 = cents(l / k)
        
        complexity = max(calculate_complexity(complexity_measure, f) for f in intervals)
        
        points.append((c1, c2, c3, complexity))
        
    return points
`;
    pyodide.FS.writeFile("python/tetrahedron_generator.py", tetrahedron_generator_py_content, { encoding: "utf8" });

    const calculations_py_content = `import math
from fractions import Fraction
from functools import reduce
from math import gcd
from itertools import combinations_with_replacement

def cents(x):
    return 1200 * math.log2(float(x)) if x > 0 else 0

def lcm(a, b):
    return abs(a * b) // gcd(a, b) if a != 0 and b != 0 else 0

def lcm_list(numbers):
    return reduce(lcm, numbers) if numbers else 0

def get_virtual_fundamental_denominator(chord):
    if not chord or chord[0] == 0:
        return None
    ratios = [Fraction(note, chord[0]).limit_denominator() for note in chord]
    denominators = [r.denominator for r in ratios]
    return lcm_list(denominators)

def get_odd_part_of_number(num):
    if num == 0: return 0
    while num > 0 and num % 2 == 0: num //= 2
    return num

def get_odd_limit(ratio):
    try:
        ratio = Fraction(ratio).limit_denominator(10000)
        n, d = ratio.numerator, ratio.denominator
        return max(get_odd_part_of_number(n), get_odd_part_of_number(d))
    except (ValueError, ZeroDivisionError): return 1

def get_integer_limit(ratio):
    try:
        ratio = Fraction(ratio).limit_denominator(10000)
        return max(ratio.numerator, ratio.denominator)
    except (ValueError, ZeroDivisionError): return 1

def get_prime_factors(n):
    factors = {}
    d = 2
    n = int(n)
    while d * d <= n:
        while (n % d) == 0:
            factors[d] = factors.get(d, 0) + 1
            n //= d
        d += 1
    if n > 1:
        factors[n] = factors.get(n, 0) + 1
    return factors

def check_prime_limit(ratio, primes, max_exponent):
    ratio = Fraction(ratio).limit_denominator(10000)
    num_factors = get_prime_factors(ratio.numerator)
    den_factors = get_prime_factors(ratio.denominator)
    for p, exp in num_factors.items():
        if p not in primes or exp > max_exponent: return False
    for p, exp in den_factors.items():
        if p not in primes or exp > max_exponent: return False
    return True

def parse_primes(limit_value_str):
    limit_value_str = str(limit_value_str)
    if '.' in limit_value_str:
        return [int(p) for p in limit_value_str.split('.') if p.isdigit()]
    else:
        limit = int(limit_value_str)
        primes = []
        for num in range(2, limit + 1):
            is_prime = all(num % i != 0 for i in range(2, int(num**0.5) + 1))
            if is_prime: primes.append(num)
        return primes

def tenney_norm(ratio):
    ratio = Fraction(ratio).limit_denominator(10000)
    return math.log2(ratio.numerator * ratio.denominator)

def weil_norm(ratio):
    ratio = Fraction(ratio).limit_denominator(10000)
    return math.log2(max(ratio.numerator, ratio.denominator))

def wilson_norm(ratio):
    ratio = Fraction(ratio).limit_denominator(10000)
    factors_n = get_prime_factors(ratio.numerator)
    factors_d = get_prime_factors(ratio.denominator)
    return sum(factors_n) + sum(factors_d)

def gradus_norm(ratio):
    ratio = Fraction(ratio).limit_denominator(10000)
    factors_n = get_prime_factors(ratio.numerator)
    factors_d = get_prime_factors(ratio.denominator)
    s = sum(factors_n) + sum(factors_d)
    n = len(factors_n) + len(factors_d)
    return s - n + 1

def benedetti_norm(ratio):
    ratio = Fraction(ratio).limit_denominator(10000)
    return ratio.numerator * ratio.denominator

def arithmetic_norm(ratio):
    ratio = Fraction(ratio).limit_denominator(10000)
    return ratio.numerator + ratio.denominator

def calculate_complexity(complexity_measure, ratio):
    norms = {
        "Tenney": tenney_norm, "Weil": weil_norm, "Wilson": wilson_norm,
        "Gradus": gradus_norm, "Benedetti": benedetti_norm, "Arithmetic": arithmetic_norm
    }
    return norms.get(complexity_measure, lambda r: 0)(ratio)

def _generate_valid_numbers(limit_value, limit_mode, max_exponent=3, equave_ratio=2.0):
    valid_numbers = set()
    if limit_mode == "odd":
        limit_val = int(limit_value)
        max_num_to_check = max(limit_val * int(equave_ratio) * 2, 200)
        for num in range(1, max_num_to_check + 1):
            if get_odd_part_of_number(num) <= limit_val:
                valid_numbers.add(num)
    elif limit_mode == "integer":
        limit_val = int(limit_value)
        for num in range(1, limit_val + 1):
            valid_numbers.add(num)
    elif limit_mode == "prime":
        primes = parse_primes(limit_value)
        if not primes: return {1}
        bound = int(equave_ratio) * max(primes) * int(max_exponent) * 2
        valid_numbers = {1}
        q = [1]
        visited = {1}
        while q:
            curr = q.pop(0)
            for p in primes:
                next_num = curr * p
                if next_num > bound: continue
                factors = get_prime_factors(next_num)
                is_valid = True
                for factor, exp in factors.items():
                    if factor not in primes or exp > int(max_exponent):
                        is_valid = False
                        break
                if is_valid and next_num not in visited:
                    valid_numbers.add(next_num)
                    visited.add(next_num)
                    q.append(next_num)
    return valid_numbers if valid_numbers else {1}

def generate_ji_tetra_labels(limit_value, equave_ratio, limit_mode="odd", max_exponent=3, complexity_measure="Tenney", hide_unison_voices=False, omit_octaves=False, virtual_fundamental_filter=None):
    labels_data = []
    equave_ratio_float = float(equave_ratio)
    valid_numbers = _generate_valid_numbers(limit_value, limit_mode, max_exponent, equave_ratio_float)
    if not valid_numbers: return []
    sorted_valid_numbers = sorted(list(valid_numbers))
    primes = parse_primes(limit_value) if limit_mode == "prime" else []

    for combo in combinations_with_replacement(sorted_valid_numbers, 4):
        if hide_unison_voices and len(set(combo)) < 4: continue
        if omit_octaves:
            has_octave = False
            for i in range(len(combo)):
                for j in range(i + 1, len(combo)):
                    if combo[i] == 0: continue
                    ratio = combo[j] / combo[i]
                    if ratio > 1 and math.isclose(math.log2(ratio), round(math.log2(ratio))):
                        has_octave = True; break
                if has_octave: break
            if has_octave: continue

        i, j, k, l = combo
        if i == 0: continue
        if (l / i) > equave_ratio_float: continue
        if gcd(gcd(gcd(i, j), k), l) != 1: continue

        if virtual_fundamental_filter:
            vf_denom = get_virtual_fundamental_denominator(combo)
            if vf_denom is None or vf_denom not in virtual_fundamental_filter:
                continue

        valid_combo = True
        intervals = [Fraction(j, i), Fraction(k, j), Fraction(l, k)]
        if limit_mode == "odd":
            limit_val_int = int(limit_value)
            if any(get_odd_limit(interval) > limit_val_int for interval in intervals): valid_combo = False
        elif limit_mode == "integer":
            limit_val_int = int(limit_value)
            if any(get_integer_limit(interval) > limit_val_int for interval in intervals): valid_combo = False
        elif limit_mode == "prime":
            if any(not check_prime_limit(interval, primes, int(max_exponent)) for interval in intervals): valid_combo = False
        
        if not valid_combo: continue
            
        c1 = cents(j / i)
        c2 = cents(k / j)
        c3 = cents(l / k)
        
        complexity = max(calculate_complexity(complexity_measure, f) for f in intervals)
        label = f"{i}:{j}:{k}:{l}"
        labels_data.append(((c1, c2, c3), label, complexity))
        
    return labels_data
`;
    pyodide.FS.writeFile("python/theory/calculations.py", calculations_py_content, { encoding: "utf8" });
    pyodide.FS.writeFile("python/theory/__init__.py", "", { encoding: "utf8" });

    pyodide.runPython("import sys; sys.path.append('./python')");
    await pyodide.loadPackage("micropip");
    console.log("Micropip loaded.");

    python_ready = true;
    loadingOverlay.style.display = 'none';

    initThreeJS();
    animate();
    
    const limitType = document.getElementById('limitType').value;
    const limitValueInput = document.getElementById('limitValue').value;
    let limitValue = limitValueInput;
    let virtualFundamentalFilter = null;

    if (limitValueInput.includes('/')) {
        const parts = limitValueInput.split('/');
        limitValue = parts[0].trim();
        const filterStr = parts[1].trim();
        
        virtualFundamentalFilter = [];
        if (filterStr.includes('...')) {
            const rangeParts = filterStr.split('...');
            const start = parseInt(rangeParts[0]);
            const end = parseInt(rangeParts[1]);
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = start; i <= end; i++) {
                    virtualFundamentalFilter.push(i);
                }
            }
        } else {
            virtualFundamentalFilter = filterStr.split('.').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
        }
    }

    const maxExponent = document.getElementById('maxExponent').value;
    const equaveRatio = parseFloat(document.getElementById('equaveRatio').value);
    const complexityMethod = document.getElementById('complexityMethod').value;
    const hideUnisonVoices = document.getElementById('hideUnisonVoices').checked;
    const omitOctaves = document.getElementById('omitOctaves').checked;
    const baseSize = parseFloat(document.getElementById('baseSize').value);
    const scalingFactor = parseFloat(document.getElementById('scalingFactor').value);
    const enableSize = document.getElementById('enableSize').checked;
    const enableColor = document.getElementById('enableColor').checked;
    const layoutDisplay = document.getElementById('layoutDisplay').value;
    currentLayoutDisplay = layoutDisplay;

    playButton = document.getElementById('playButton');
    pivotButtons = document.querySelectorAll('.pivot-button');
    const enableSlideCheckbox = document.getElementById('enableSlide');
    const slideDurationInput = document.getElementById('slideDuration');
    const timbreSlider = document.getElementById('timbreSlider');
    const limitTypeSelect = document.getElementById('limitType');
    const primeLimitOptions = document.getElementById('prime-limit-options');

    limitTypeSelect.addEventListener('change', (event) => {
        primeLimitOptions.style.display = event.target.value === 'Prime' ? 'flex' : 'none';
    });

    notationDisplay = document.getElementById('notation-display');
    const enableNotationCheckbox = document.getElementById('enableNotation');
    const notationTypeSelect = document.getElementById('notationType');

    enableNotationCheckbox.addEventListener('change', (event) => {
        enableNotation = event.target.checked;
        notationTypeSelect.style.display = enableNotation ? 'inline-block' : 'none';
        if (!enableNotation) {
            notationDisplay.style.display = 'none';
        }
    });

    notationTypeSelect.addEventListener('change', (event) => {
        notationType = event.target.value;
    });

    enableSlideCheckbox.addEventListener('change', (event) => {
        enableSlide = event.target.checked;
        slideDurationInput.style.display = enableSlide ? 'inline-block' : 'none';
    });

    slideDurationInput.addEventListener('change', (event) => {
        slideDuration = parseFloat(event.target.value);
    });

    timbreSlider.addEventListener('input', (event) => {
        updateWaveform(parseFloat(event.target.value));
    });

    updateWaveform(parseFloat(timbreSlider.value));
    updatePivotButtonSelection(currentPivotVoiceIndex);

    pivotButtons.forEach(button => {
        button.addEventListener('click', () => {
            const selectedIndex = parseInt(button.dataset.pivotIndex);
            updatePivotButtonSelection(selectedIndex);
        });
    });

    await updateTetrahedron(
        limitType, limitValue, maxExponent, virtualFundamentalFilter, equaveRatio, complexityMethod, 
        hideUnisonVoices, omitOctaves, baseSize, scalingFactor, 
        enableSize, enableColor, layoutDisplay
    );

    playButton.addEventListener('click', () => {
        isClickPlayModeActive = !isClickPlayModeActive;
        playButton.classList.toggle('play-button-active', isClickPlayModeActive);
        if (controls) controls.enabled = !isClickPlayModeActive;
        if (!isClickPlayModeActive) {
            if (!isShiftHeld && controls) controls.enablePan = true;
            stopChord();
            currentlyHovered = null;
        }
    });

    document.getElementById('updateButton').addEventListener('click', async () => {
        const newLimitType = document.getElementById('limitType').value;
        const newLimitValueInput = document.getElementById('limitValue').value;
        let newLimitValue = newLimitValueInput;
        let newVirtualFundamentalFilter = null;

        if (newLimitValueInput.includes('/')) {
            const parts = newLimitValueInput.split('/');
            newLimitValue = parts[0].trim();
            const filterStr = parts[1].trim();
            
            newVirtualFundamentalFilter = [];
            if (filterStr.includes('...')) {
                const rangeParts = filterStr.split('...');
                const start = parseInt(rangeParts[0]);
                const end = parseInt(rangeParts[1]);
                if (!isNaN(start) && !isNaN(end)) {
                    for (let i = start; i <= end; i++) {
                        newVirtualFundamentalFilter.push(i);
                    }
                }
            } else {
                newVirtualFundamentalFilter = filterStr.split('.').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
            }
        }

        const newMaxExponent = document.getElementById('maxExponent').value;
        const newEquaveRatio = parseFloat(document.getElementById('equaveRatio').value);
        const newComplexityMethod = document.getElementById('complexityMethod').value;
        const newHideUnisonVoices = document.getElementById('hideUnisonVoices').checked;
        const newOmitOctaves = document.getElementById('omitOctaves').checked;
        const newBaseSize = parseFloat(document.getElementById('baseSize').value);
        const newScalingFactor = parseFloat(document.getElementById('scalingFactor').value);
        const newEnableSize = document.getElementById('enableSize').checked;
        const newEnableColor = document.getElementById('enableColor').checked;
        const newLayoutDisplay = document.getElementById('layoutDisplay').value;
        currentLayoutDisplay = newLayoutDisplay;

        await updateTetrahedron(
            newLimitType, newLimitValue, newMaxExponent, newVirtualFundamentalFilter, newEquaveRatio, newComplexityMethod, 
            newHideUnisonVoices, newOmitOctaves, newBaseSize, newScalingFactor, 
            newEnableSize, newEnableColor, newLayoutDisplay
        );
    });

    document.addEventListener('keydown', (event) => {
        const tagName = event.target.tagName;
        if (event.key === 'Enter' && tagName !== 'INPUT' && tagName !== 'TEXTAREA') {
            event.preventDefault();
            document.getElementById('updateButton').click();
        }
    });

    document.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toUpperCase() === 'E') {
            event.preventDefault();
            const svgData = exportToSVG();
            downloadSVG(svgData, 'tetrads-export.svg');
        }
    });
}

// Initial call to start the application
initPyodide();

// --- Settings Menu Collapse/Expand ---
const settingsHeader = document.getElementById('settings-header');
const settingsContent = document.getElementById('settings-content');
const toggleIcon = settingsHeader.querySelector('.toggle-icon');
const infoLink = document.getElementById('info-link');

infoLink.addEventListener('click', (event) => {
    event.stopPropagation();
});

settingsHeader.addEventListener('click', () => {
    const isCollapsed = settingsHeader.classList.toggle('collapsed');
    settingsContent.style.display = isCollapsed ? 'none' : 'grid';
    toggleIcon.textContent = isCollapsed ? '' : '▼';
});

settingsHeader.classList.add('collapsed');
settingsContent.style.display = 'none';
toggleIcon.textContent = '';

document.getElementById('layoutDisplay').addEventListener('change', () => {
    document.getElementById('updateButton').click();
});