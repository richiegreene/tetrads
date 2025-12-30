import { setEnableHandTracking, camera, scene, controls, isShiftHeld, setIsShiftHeld, setCurrentlyHovered, handTrackingMode } from '../globals.js';
import { playChord, stopChord, initAudio } from './audio-engine.js';
import * as THREE from 'https://unpkg.com/three@0.126.0/build/three.module.js';

// MediaPipe's HAND_CONNECTIONS, define it here or import if available globally
// These are standard connections for MediaPipe Hands model
const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],         // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8],         // Index finger
    [0, 9], [9, 10], [10, 11], [11, 12],    // Middle finger
    [0, 13], [13, 14], [14, 15], [15, 16],  // Ring finger
    [0, 17], [17, 18], [18, 19], [19, 20],  // Pinky finger
    [5, 9], [9, 13], [13, 17],              // Palm connections
];

let handPoseDetector = null;
let video = null;
let animationFrameId = null;
let isHandTrackingActive = false;

// 2D Canvas for drawing hands
let handCanvas = null;
let handCanvasCtx = null;

// Parameters for controlling camera movement with hand tracking
const rotationSensitivity = 0.005;
const zoomSensitivity = 0.02;
const panSensitivity = 0.005;

// State variables for smooth camera control
let lastHandPosition = null;
let lastLeftHandPinchDistance = null;
let lastRightHandIndexTip = null; // For right hand orbit/pan

// Scale factor for hand landmarks from MediaPipe to our scene
const worldScale = 2;

export async function initHandTracker() {
    if (!handPoseDetector) {
        console.log('Loading hand pose detection model...');
        const model = handPoseDetection.SupportedModels.MediaPipeHands;
        const detectorConfig = {
            runtime: 'mediapipe',
            solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240',
            modelType: 'full' // 'lite', 'full', 'heavy'
        };
        handPoseDetector = await handPoseDetection.createDetector(model, detectorConfig);
        console.log('Hand pose detection model loaded.');
    }
}

export async function startHandTracking() {
    if (isHandTrackingActive) return;

    video = document.getElementById('webcam-feed');
    if (!video) {
        console.error('Webcam feed video element not found.');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        video.play();
        isHandTrackingActive = true;
        console.log('Webcam stream started.');

        if (controls) {
            controls.enabled = false; // Disable OrbitControls when hand tracking is active
        }
        
        // Initialize 2D hand tracking canvas
        handCanvas = document.getElementById('handTrackingCanvas');
        if (handCanvas) {
            handCanvasCtx = handCanvas.getContext('2d');
            resizeHandCanvas();
            window.addEventListener('resize', resizeHandCanvas);
        }

        video.onloadedmetadata = () => {
            detectHandsContinuously();
        };

    } catch (err) {
        console.error('Error accessing camera:', err);
        alert('Could not access camera for hand tracking. Please ensure it is connected and permissions are granted.');
        setEnableHandTracking(false); // Uncheck the UI checkbox
        isHandTrackingActive = false;
    }
}

export function stopHandTracking() {
    if (!isHandTrackingActive) return;

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        console.log('Webcam stream stopped.');
    }
    isHandTrackingActive = false;
    
    // Clear hand landmark data and reset state variables
    lastHandPosition = null;
    lastLeftHandPinchDistance = null;
    lastRightHandIndexTip = null;

    console.log('Hand tracking stopped.');

    if (controls) {
        controls.enabled = true; // Re-enable OrbitControls when hand tracking is stopped
    }
    // Remove 2D canvas resize listener
    window.removeEventListener('resize', resizeHandCanvas);
    if (handCanvasCtx) {
        handCanvasCtx.clearRect(0, 0, handCanvas.width, handCanvas.height); // Clear the canvas
    }
}

async function detectHandsContinuously() {
    if (!isHandTrackingActive || !handPoseDetector || !video) {
        return;
    }

    const hands = await handPoseDetector.estimateHands(video, {
        flipHorizontal: true // Assuming the video feed is mirrored
    });
    
    console.log('Detected hands:', hands);
    
    // Process hand landmarks for Three.js controls
    if (controls) { // Controls are disabled globally if hand tracking is active, but we can manually control them
        processHandGestures(hands);
    }

    // Always check for pinch to play, regardless of camera control
    if (hands.length > 0) {
        processPinchToPlay(hands);
    }

    drawHandsOnCanvas(hands); // Update virtual hands visualization (2D canvas)

    animationFrameId = requestAnimationFrame(detectHandsContinuously);
}

// Function to draw 2D hand representation on canvas
function drawHandsOnCanvas(hands) {
    if (!handCanvasCtx || handTrackingMode === 'hideHands') {
        return;
    }

    handCanvasCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);

    if (!hands || hands.length === 0) {
        return;
    }

    hands.forEach(hand => {
        const landmarks = hand.keypoints; // Use 2D keypoints for 2D drawing
        const handedness = hand.handedness[0].label;

        const isLeftHand = handedness === 'Left';
        const drawColor = isLeftHand ? 'cyan' : 'lightgreen'; // Cyan for Left, Green for Right

        handCanvasCtx.strokeStyle = drawColor;
        handCanvasCtx.fillStyle = drawColor;
        handCanvasCtx.lineWidth = 2;

        // Draw connections
        HAND_CONNECTIONS.forEach(([startIdx, endIdx]) => {
            const start = landmarks[startIdx];
            const end = landmarks[endIdx];

            handCanvasCtx.beginPath();
            handCanvasCtx.moveTo(start.x * handCanvas.width, start.y * handCanvas.height);
            handCanvasCtx.lineTo(end.x * handCanvas.width, end.y * handCanvas.height);
            handCanvasCtx.stroke();
        });

        // Draw landmarks
        landmarks.forEach(landmark => {
            handCanvasCtx.beginPath();
            handCanvasCtx.arc(landmark.x * handCanvas.width, landmark.y * handCanvas.height, 5, 0, 2 * Math.PI); // Radius 5px
            handCanvasCtx.fill();
        });
    });
}

function processHandGestures(hands) {
    if (!controls) return;

    // Reset hand position states if no hands detected
    const foundLeftHand = hands.some(hand => hand.handedness[0].label === 'Left');
    const foundRightHand = hands.some(hand => hand.handedness[0].label === 'Right');

    if (!foundLeftHand) {
        lastLeftHandPinchDistance = null;
    }
    if (!foundRightHand) {
        lastRightHandIndexTip = null;
    }

    hands.forEach(hand => {
        const landmarks = hand.keypoints3D;
        const handedness = hand.handedness[0].label;
        const isLeftHand = handedness === 'Left';

        if (isLeftHand) {
            // LEFT HAND: Pinch for Zoom
            const thumbTip = landmarks.find(lm => lm.name === 'thumb_tip');
            const indexTip = landmarks.find(lm => lm.name === 'index_finger_tip');

            if (thumbTip && indexTip) {
                const dx = thumbTip.x - indexTip.x;
                const dy = thumbTip.y - indexTip.y;
                const dz = thumbTip.z - indexTip.z;
                const pinchDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);

                if (lastLeftHandPinchDistance !== null) {
                    const deltaPinch = pinchDistance - lastLeftHandPinchDistance;
                    
                    // A smaller pinch distance means zoom in, larger means zoom out
                    // Adjust camera distance from target
                    const currentDistance = camera.position.distanceTo(controls.target);
                    let newDistance = currentDistance - deltaPinch * 100; // Multiplier for sensitivity
                    
                    // Clamp distance to min/max
                    newDistance = Math.max(controls.minDistance, Math.min(controls.maxDistance, newDistance));

                    // Apply new distance
                    const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
                    camera.position.copy(direction.multiplyScalar(newDistance).add(controls.target));

                    controls.update(); // Update controls after manual camera manipulation
                }
                lastLeftHandPinchDistance = pinchDistance;
            } else {
                lastLeftHandPinchDistance = null;
            }
        } else { // Right Hand
            // RIGHT HAND: Point and Drag for Orbit/Pan (only if not pinching to play)
            if (!isShiftHeld) { // isShiftHeld is set by processPinchToPlay for right hand pinch
                const indexTip = landmarks.find(lm => lm.name === 'index_finger_tip');
                if (indexTip) {
                    // Use a smoothed value for lastRightHandIndexTip to prevent jitter
                    const currentRightIndexTip = new THREE.Vector3(indexTip.x, indexTip.y, indexTip.z);

                    if (lastRightHandIndexTip) {
                        const deltaX = currentRightIndexTip.x - lastRightHandIndexTip.x;
                        const deltaY = currentRightIndexTip.y - lastRightHandIndexTip.y;
                        
                        // ORBIT: Rotate around the controls.target
                        // Rotate horizontally (around Y axis of scene)
                        const phiDelta = -deltaX * rotationSensitivity * 5; // Horizontal movement for yaw
                        // Rotate vertically (around X axis of camera)
                        const thetaDelta = -deltaY * rotationSensitivity * 5; // Vertical movement for pitch

                        // Get current spherical coordinates relative to target
                        const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
                        const spherical = new THREE.Spherical().setFromVector3(offset);

                        // Apply deltas to spherical coordinates
                        spherical.phi += thetaDelta; // Vertical angle
                        spherical.theta += phiDelta; // Horizontal angle

                        // Clamp vertical angle to prevent flipping
                        spherical.phi = Math.max(0.001, Math.min(Math.PI - 0.001, spherical.phi)); // Avoid gimbal lock

                        // Convert back to Cartesian and update camera position
                        offset.setFromSpherical(spherical);
                        camera.position.copy(controls.target).add(offset);
                        
                        // PAN: Translate controls.target and camera in screen space
                        // For a simple single hand pan, we can interpret hand movement directly
                        const panSpeed = panSensitivity * 0.5; // Adjust sensitivity
                        const panLeft = -deltaX * panSpeed;
                        const panUp = deltaY * panSpeed; // Y movement for vertical pan

                        // Get the camera's local X and Y directions for panning
                        const panX = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
                        const panY = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
                        
                        // Apply pan movement to target and camera position
                        controls.target.addScaledVector(panX, panLeft);
                        controls.object.position.addScaledVector(panX, panLeft);

                        controls.target.addScaledVector(panY, panUp);
                        controls.object.position.addScaledVector(panY, panUp);
                        
                        controls.update(); // Update controls after manual camera/target manipulation
                    }
                    lastRightHandIndexTip = currentRightIndexTip;
                } else {
                    lastRightHandIndexTip = null;
                }
            } else {
                // If right hand is pinching, clear previous state to avoid jump when released
                lastRightHandIndexTip = null;
            }
        }
    });
}

function processPinchToPlay(hands) {
    // This function will prioritize the user's explicit request to
    // "retain the right hand thumb index pinch to function as the shift button, playing where the users hand pinches"
    // This implies that if a right hand pinch is detected, it overrides other right hand gestures for camera control
    // and instead triggers the play functionality.

    const rightHand = hands.find(hand => hand.handedness[0].label === 'Right');

    if (!rightHand) {
        // If no right hand, ensure shift is released and sound is stopped
        if (isShiftHeld) {
            setIsShiftHeld(false);
            const playButtonElement = document.getElementById('playButton');
            if (!isClickPlayModeActive) {
                if (controls) controls.enablePan = true;
                if (playButtonElement) playButtonElement.classList.remove('play-button-active');
            }
            stopChord();
            setCurrentlyHovered(null);
        }
        return;
    }

    const indexTip = rightHand.keypoints3D.find(lm => lm.name === 'index_finger_tip');
    const thumbTip = rightHand.keypoints3D.find(lm => lm.name === 'thumb_tip');

    if (indexTip && thumbTip) {
        const dx = thumbTip.x - indexTip.x;
        const dy = thumbTip.y - indexTip.y;
        const dz = thumbTip.z - indexTip.z;
        const pinchDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        const pinchThreshold = 0.05; // This value will need tuning

        if (pinchDistance < pinchThreshold) {
            if (!isShiftHeld) { // Simulate shift being held for pinch
                initAudio();
                setIsShiftHeld(true);
                // When pinch is active, disable other right hand camera controls
                lastRightHandIndexTip = null; 
                if (controls) controls.enablePan = false;
                const playButtonElement = document.getElementById('playButton');
                if (playButtonElement) playButtonElement.classList.add('play-button-active');
                stopChord();
            }

            // Perform raycasting at the pinch location
            const pinchScreenPos = convertWorldToScreen(indexTip); // Use index finger as pinch point

            if (pinchScreenPos) {
                const mouse = new THREE.Vector2(pinchScreenPos.x, pinchScreenPos.y);
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
        } else {
            // Pinch released
            if (isShiftHeld) {
                setIsShiftHeld(false);
                const playButtonElement = document.getElementById('playButton');
                if (!isClickPlayModeActive) {
                    if (controls) controls.enablePan = true;
                    if (playButtonElement) playButtonElement.classList.remove('play-button-active');
                }
                stopChord();
                setCurrentlyHovered(null);
            }
        }
    } else {
        // No index or thumb tip detected on right hand, ensure shift is released
        if (isShiftHeld) {
            setIsShiftHeld(false);
            const playButtonElement = document.getElementById('playButton');
            if (!isClickPlayModeActive) {
                if (controls) controls.enablePan = true;
                if (playButtonElement) playButtonElement.classList.remove('play-button-active');
            }
            stopChord();
            setCurrentlyHovered(null);
        }
    }
}

// Helper to convert 3D world coordinates to 2D screen coordinates
function convertWorldToScreen(landmark) {
    const vector = new THREE.Vector3(landmark.x, landmark.y, landmark.z);
    vector.project(camera);

    // raycaster.setFromCamera expects normalized device coordinates (-1 to 1)
    return { x: vector.x, y: vector.y };
}

// Function to resize the hand tracking canvas
function resizeHandCanvas() {
    if (handCanvas) {
        handCanvas.width = window.innerWidth;
        handCanvas.height = window.innerHeight;
    }
}
