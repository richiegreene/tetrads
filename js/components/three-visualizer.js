import * as THREE from 'https://unpkg.com/three@0.126.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.126.0/examples/jsm/controls/OrbitControls.js';

import { 
    scene, camera, renderer, controls,
    currentSprites, currentLayoutDisplay, rotationSpeed,
    keyState, isShiftHeld, isClickPlayModeActive, currentlyHovered,
    playButton, pivotButtons, currentPivotVoiceIndex,
    setScene, setCamera, setRenderer, setControls,
    setCurrentSprites, setIsShiftHeld, setIsClickPlayModeActive, setCurrentlyHovered,
    setCurrentPivotVoiceIndex, setKeyState
} from '../globals.js';

import { initAudio, stopChord, playChord } from '../components/audio-engine.js';

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

export function makeTextSprite(message, parameters) {
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

// Function to create a circular point sprite
export function makePointSprite(color, opacity) {
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

export function updatePivotButtonSelection(selectedIndex) {
    // Assuming pivotButtons is accessible globally or passed in
    const pivotButtonsElements = document.querySelectorAll('.pivot-button'); // Re-query or pass as arg
    if (!pivotButtonsElements) return; // Ensure buttons are initialized

    pivotButtonsElements.forEach(button => {
        if (parseInt(button.dataset.pivotIndex) === selectedIndex) {
            button.classList.add('selected');
        } else {
            button.classList.remove('selected');
        }
    });
    setCurrentPivotVoiceIndex(selectedIndex); 
}

// Transformation function for an apex-up regular tetrahedron
export function transformToRegularTetrahedron(c1, c2, c3, max_val) {
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

// --- Event Handlers for Three.js Interactions ---
function onKeyDown(event) {
    if (event.key === 'Shift' && !isShiftHeld) {
        initAudio();
        setIsShiftHeld(true);
        if (controls) controls.enablePan = false;
        const playButtonElement = document.getElementById('playButton'); 
        if (playButtonElement) playButtonElement.classList.add('play-button-active');
        stopChord(); 
    } else if (['S', 'A', 'T', 'B'].includes(event.key.toUpperCase())) {
        let selectedIndex;
        switch (event.key.toUpperCase()) {
            case 'S': selectedIndex = 3; break;
            case 'A': selectedIndex = 2; break;
            case 'T': selectedIndex = 1; break;
            case 'B': selectedIndex = 0; break;
            default: return;
        }
        updatePivotButtonSelection(selectedIndex);
        event.preventDefault(); 
    }

    if (keyState.hasOwnProperty(event.key)) {
        setKeyState(event.key, true);
        event.preventDefault();
    }
}

function onKeyUp(event) {
    if (event.key === 'Shift') {
        setIsShiftHeld(false);
        const playButtonElement = document.getElementById('playButton'); 
        if (!isClickPlayModeActive) { 
            if (controls) controls.enablePan = true;
            if (playButtonElement) playButtonElement.classList.remove('play-button-active');
        } else {
        }
        stopChord(); 
        setCurrentlyHovered(null); 
    }

    if (keyState.hasOwnProperty(event.key)) {
        setKeyState(event.key, false);
        event.preventDefault();
    }
}

function onMouseMove(event) {
    if (!isShiftHeld) {
        if (currentlyHovered) {
            stopChord();
            setCurrentlyHovered(null);
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
                setCurrentlyHovered(firstHit);
                playChord(firstHit.userData.ratio);
            }
        }
    } else {
        if (currentlyHovered) {
            stopChord();
            setCurrentlyHovered(null);
        }
    }
}

function onClick(event) {
    if (!isClickPlayModeActive) {
        return;
    }

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
        stopChord(); 
    }
}


export function initThreeJS() {
    const container = document.getElementById('container');
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    setScene(new THREE.Scene());
    scene.background = new THREE.Color(0x000000);

    setCamera(new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000));
    camera.position.set(0, 3, 6);
    camera.lookAt(0, 0, 0);

    setRenderer(new THREE.WebGLRenderer({ antialias: true }));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    setControls(new OrbitControls(camera, renderer.domElement));
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.screenSpacePanning = false;
    controls.minDistance = 1;
    controls.maxDistance = 30;

    window.addEventListener('keydown', onKeyDown, false);
    window.addEventListener('keyup', onKeyUp, false);
    renderer.domElement.addEventListener('mousemove', onMouseMove, false);
    renderer.domElement.addEventListener('click', onClick, false); 
    window.addEventListener('resize', onWindowResize, false);
}

export function onWindowResize() {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

export function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();

    if (keyState.ArrowUp) {
        if (scene) scene.rotation.x -= rotationSpeed;
    }
    if (keyState.ArrowDown) {
        if (scene) scene.rotation.x += rotationSpeed;
    }
    if (keyState.ArrowLeft) {
        if (scene) scene.rotation.y -= rotationSpeed;
    }
    if (keyState.ArrowRight) {
        if (scene) scene.rotation.y += rotationSpeed;
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

    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}