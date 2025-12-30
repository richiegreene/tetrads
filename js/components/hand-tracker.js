import * as globals from '../globals.js';
import { setEnableHandTracking, setIsShiftHeld, setCurrentlyHovered } from '../globals.js';
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
// Increased for more responsive control - feel like physically grabbing/manipulating the object
const rotationSensitivity = 0.05;   // 10x increase from 0.005
const zoomSensitivity = 0.15;       // 7.5x increase from 0.02
const panSensitivity = 0.05;        // 10x increase from 0.005

// State variables for smooth camera control
let lastHandPosition = null;
let lastLeftHandPinchDistance = null;
let lastRightHandIndexTip = null; // For right hand orbit/pan

// State variables for two-hand gestures
let lastTwoHandDistance = null;
let lastHandsCenter = null;

// Scale factor for hand landmarks from MediaPipe to our scene
const worldScale = 2;

export async function initHandTracker() {
    if (!handPoseDetector) {
        try {
            console.log('Loading hand pose detection model...');
            console.log('handPoseDetection available:', !!window.handPoseDetection);
            const model = window.handPoseDetection.SupportedModels.MediaPipeHands;
            const detectorConfig = {
                runtime: 'mediapipe',
                solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240',
                modelType: 'full' // 'lite', 'full', 'heavy'
            };
            handPoseDetector = await window.handPoseDetection.createDetector(model, detectorConfig);
            console.log('Hand pose detection model loaded successfully.');
        } catch (error) {
            console.error('ERROR loading hand pose detector:', error);
            throw error;
        }
    }
}

export async function startHandTracking() {
    console.log('=== START HAND TRACKING ===');
    if (isHandTrackingActive) {
        console.log('Hand tracking already active, returning');
        return;
    }

    video = document.getElementById('webcam-feed');
    if (!video) {
        console.error('Webcam feed video element not found.');
        return;
    }

    try {
        console.log('Requesting camera access...');
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        video.play();
        isHandTrackingActive = true;
        console.log('Webcam stream started.');

        if (globals.controls) {
            console.log('Disabling OrbitControls inputs');
            // Don't disable the entire controls, just disable inputs
            globals.controls.enableRotate = false;
            globals.controls.enableZoom = false;
            globals.controls.enablePan = false;
        } else {
            console.log('WARNING: controls is null/undefined');
        }
        
        // Initialize 2D hand tracking canvas
        handCanvas = document.getElementById('handTrackingCanvas');
        if (handCanvas) {
            handCanvasCtx = handCanvas.getContext('2d');
            resizeHandCanvas();
            window.addEventListener('resize', resizeHandCanvas);
            console.log('Hand tracking canvas initialized');
        } else {
            console.error('handTrackingCanvas element not found');
        }
        
        video.onloadedmetadata = () => {
            console.log('Video metadata loaded, starting hand detection loop');
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
    lastTwoHandDistance = null; // Reset two-hand state
    lastHandsCenter = null;     // Reset two-hand state

    console.log('Hand tracking stopped.');

    if (globals.controls) {
        globals.controls.enableRotate = true;
        globals.controls.enableZoom = true;
        globals.controls.enablePan = true;
    }
    // Remove 2D canvas resize listener
    window.removeEventListener('resize', resizeHandCanvas);
    if (handCanvasCtx) {
        handCanvasCtx.clearRect(0, 0, handCanvas.width, handCanvas.height); // Clear the canvas
    }
}

let lastLogTime = 0;

async function detectHandsContinuously() {
    if (!isHandTrackingActive || !handPoseDetector || !video) {
        return;
    }

    try {
        const hands = await handPoseDetector.estimateHands(video, {
            flipHorizontal: true
        });
        
        // Log every 30 frames (~500ms at 60fps)
        const now = Date.now();
        if (now - lastLogTime > 500) {
            lastLogTime = now;
            console.warn('[HANDS] Detected:', hands.length, 'hands | controls:', !!globals.controls, 'isShiftHeld:', globals.isShiftHeld);
        }
        
        // Process hand landmarks for Three.js controls
        if (globals.controls && hands.length > 0) {
            console.warn('[GESTURE] Processing gestures');
            processHandGestures(hands);
        }

        // Always check for pinch to play
        if (hands.length > 0) {
            console.warn('[PINCH] Checking pinch');
            processPinchToPlay(hands);
        }

        drawHandsOnCanvas(hands);
    } catch (error) {
        console.error('[ERROR] detectHandsContinuously:', error);
    }

    animationFrameId = requestAnimationFrame(detectHandsContinuously);
}

// Function to draw 2D hand representation on canvas
function drawHandsOnCanvas(hands) {
    if (!handCanvasCtx || handTrackingMode === 'hideHands') {
        return;
    }

    // console.log('drawHandsOnCanvas: width=', handCanvas.width, 'height=', handCanvas.height, 'ctx=', handCanvasCtx); // Debug log
    handCanvasCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
    
    // TEMPORARILY REMOVED: Static drawing for debugging

    if (!hands || hands.length === 0) {
        return;
    }

    hands.forEach(hand => {
        const landmarks = hand.keypoints; // Use 2D keypoints for 2D drawing
        const handedness = hand.handedness[0].label;

        const isLeftHand = handedness === 'Left';
        const drawColor = 'gray'; // Uniform gray for both hands

        handCanvasCtx.strokeStyle = drawColor;
        handCanvasCtx.fillStyle = drawColor;
        handCanvasCtx.lineWidth = 4; // Increased line thickness

        // Draw connections
        HAND_CONNECTIONS.forEach(([startIdx, endIdx]) => {
            const start = landmarks[startIdx];
            const end = landmarks[endIdx];

            handCanvasCtx.beginPath();
            handCanvasCtx.moveTo(start.x, start.y); // Use raw pixel coordinates
            handCanvasCtx.lineTo(end.x, end.y); // Use raw pixel coordinates
            handCanvasCtx.stroke();
        });

        // Draw landmarks
        landmarks.forEach(landmark => {
            // console.log('Landmark for drawing:', landmark.x, landmark.y); // Simplified log
            handCanvasCtx.beginPath();
            handCanvasCtx.arc(landmark.x, landmark.y, 8, 0, 2 * Math.PI); // Use raw pixel coordinates, increased radius
            handCanvasCtx.fill();
        });
    });
}

// Helper to get a specific 3D landmark position
function getHandLandmarkPosition(hand, landmarkName) {
    const landmark = hand.keypoints3D.find(lm => lm.name === landmarkName);
    if (landmark) {
        // Return a new Vector3 to ensure it's a distinct object and can be manipulated
        return new THREE.Vector3(landmark.x, landmark.y, landmark.z);
    }
    return null;
}

function handleTwoHandGestures(leftHand, rightHand) {
    const leftWrist = getHandLandmarkPosition(leftHand, 'wrist');
    const rightWrist = getHandLandmarkPosition(rightHand, 'wrist');

    if (!leftWrist || !rightWrist) {
        lastTwoHandDistance = null;
        lastHandsCenter = null;
        return;
    }

    // --- Two-Hand Zoom (Scaling) ---
    const currentTwoHandDistance = leftWrist.distanceTo(rightWrist);

    if (lastTwoHandDistance !== null) {
        const deltaDistance = currentTwoHandDistance - lastTwoHandDistance;
        console.log('Two-hand zoom: deltaDistance=', deltaDistance, 'lastDistance=', lastTwoHandDistance, 'currentDistance=', currentTwoHandDistance);

        const currentCameraDistance = globals.camera.position.distanceTo(globals.controls.target);
        let newCameraDistance = currentCameraDistance - deltaDistance * zoomSensitivity * 200;  // Increased from 50 to 200

        newCameraDistance = Math.max(globals.controls.minDistance, Math.min(globals.controls.maxDistance, newCameraDistance));
        const direction = new THREE.Vector3().subVectors(globals.camera.position, globals.controls.target).normalize();
        globals.camera.position.copy(direction.multiplyScalar(newCameraDistance).add(globals.controls.target));
        globals.controls.update();
    }
    lastTwoHandDistance = currentTwoHandDistance;

    // --- Two-Hand Rotation ---
    const currentHandsCenter = new THREE.Vector3().addVectors(leftWrist, rightWrist).multiplyScalar(0.5);

    if (lastHandsCenter !== null) {
        const deltaX = currentHandsCenter.x - lastHandsCenter.x;
        const deltaY = currentHandsCenter.y - lastHandsCenter.y;
        
        console.log('Two-hand rotation: deltaX=', deltaX, 'deltaY=', deltaY, 'leftWrist=', leftWrist, 'rightWrist=', rightWrist);

        const thetaDelta = -deltaX * rotationSensitivity * 100;  // Increased from 20 to 100
        const phiDelta = -deltaY * rotationSensitivity * 100;    // Increased from 20 to 100 

        const offset = new THREE.Vector3().subVectors(globals.camera.position, globals.controls.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);

        spherical.phi += phiDelta; 
        spherical.theta += thetaDelta; 

        spherical.phi = Math.max(0.001, Math.min(Math.PI - 0.001, spherical.phi));

        offset.setFromSpherical(spherical);
        globals.camera.position.copy(globals.controls.target).add(offset);
        globals.controls.update();
    }
    lastHandsCenter = currentHandsCenter;
}

function processHandGestures(hands) {
    if (!globals.controls || globals.isShiftHeld) {
        return; 
    }

    console.warn('[GESTURE] Processing hand gestures with', hands.length, 'hands');

    let leftHand = null;
    let rightHand = null;

    hands.forEach((hand, idx) => {
        console.warn('[GESTURE] Hand', idx, '- handedness:', hand.handedness, 'keypoints3D:', hand.keypoints3D ? hand.keypoints3D.length : 'none');
        
        // MediaPipe returns handedness as a string directly ('Right' or 'Left')
        let handednessLabel = null;
        if (typeof hand.handedness === 'string') {
            handednessLabel = hand.handedness;
        } else if (Array.isArray(hand.handedness) && hand.handedness.length > 0) {
            // Fallback: if it's an array with objects
            if (hand.handedness[0].label) {
                handednessLabel = hand.handedness[0].label;
            } else if (typeof hand.handedness[0] === 'string') {
                handednessLabel = hand.handedness[0];
            }
        }
        
        if (handednessLabel) {
            const lowerCaseLabel = handednessLabel.toLowerCase();
            console.warn('[GESTURE] Hand', idx, '- label:', handednessLabel, 'lowercase:', lowerCaseLabel);
            // With flipHorizontal: true, MediaPipe 'Right' = user's right hand
            if (lowerCaseLabel === 'right') {
                rightHand = hand;
                console.warn('[GESTURE] Assigned hand', idx, 'to rightHand');
            } else if (lowerCaseLabel === 'left') {
                leftHand = hand;
                console.warn('[GESTURE] Assigned hand', idx, 'to leftHand');
            }
        }
    });

    console.warn('[GESTURE] leftHand:', !!leftHand, 'rightHand:', !!rightHand);

    if (leftHand && rightHand) {
        console.warn('[GESTURE] Executing two-hand gestures');
        handleTwoHandGestures(leftHand, rightHand);
    } else {
        lastTwoHandDistance = null;
        lastHandsCenter = null;
    }
}


function processPinchToPlay(hands) {
    // This function will prioritize the user's explicit request to
    // "retain the right hand thumb index pinch to function as the shift button, playing where the users hand pinches"
    // This implies that if a right hand pinch is detected, it overrides other right hand gestures for camera control
    // and instead triggers the play functionality.

    console.warn('[PINCH] Starting pinch detection with', hands.length, 'hands');

    // Find the right hand
    // MediaPipe returns handedness as a string ('Right' or 'Left')
    let rightHand = null;
    hands.forEach((hand, idx) => {
        console.warn('[PINCH] Hand', idx, '- handedness:', hand.handedness);
        
        // MediaPipe returns handedness as a string directly
        let handednessLabel = null;
        if (typeof hand.handedness === 'string') {
            handednessLabel = hand.handedness;
        } else if (Array.isArray(hand.handedness) && hand.handedness.length > 0) {
            // Fallback: if it's an array with objects
            if (hand.handedness[0].label) {
                handednessLabel = hand.handedness[0].label;
            } else if (typeof hand.handedness[0] === 'string') {
                handednessLabel = hand.handedness[0];
            }
        }
        
        if (handednessLabel) {
            const lowerCaseLabel = handednessLabel.toLowerCase();
            console.warn('[PINCH] Hand', idx, '- label:', handednessLabel);
            // With flipHorizontal: true, MediaPipe 'Right' = user's right hand
            if (lowerCaseLabel === 'right') {
                rightHand = hand;
                console.warn('[PINCH] Found user right hand at index', idx);
            }
        }
    });
    
    console.log('DEBUG processPinchToPlay: rightHand found=', !!rightHand, 'hands.length=', hands.length);

    if (!rightHand) {
        // If no right hand, ensure shift is released and sound is stopped
        if (globals.isShiftHeld) {
            console.log('DEBUG: Releasing pinch (no right hand detected)');
            setIsShiftHeld(false);
            const playButtonElement = document.getElementById('playButton');
            if (!globals.isClickPlayModeActive) {
                if (globals.controls) globals.controls.enablePan = true;
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
        console.warn('[PINCH] Distance:', pinchDistance.toFixed(4), 'Threshold:', pinchThreshold);

        if (pinchDistance < pinchThreshold) {
            if (!globals.isShiftHeld) { // Simulate shift being held for pinch
                initAudio();
                setIsShiftHeld(true);
                // When pinch is active, disable other right hand camera controls
                lastRightHandIndexTip = null; 
                if (globals.controls) globals.controls.enablePan = false;
                const playButtonElement = document.getElementById('playButton');
                if (playButtonElement) playButtonElement.classList.add('play-button-active');
                stopChord();
            }

            // Perform raycasting at the pinch location
            const pinchScreenPos = convertWorldToScreen(indexTip); // Use index finger as pinch point
            console.log('DEBUG: pinchScreenPos=', pinchScreenPos, 'currentSprites.length=', globals.currentSprites.length);

            if (pinchScreenPos) {
                const mouse = new THREE.Vector2(pinchScreenPos.x, pinchScreenPos.y);
                const raycaster = new THREE.Raycaster();
                raycaster.setFromCamera(mouse, globals.camera);
                const intersects = raycaster.intersectObjects(globals.currentSprites);
                console.log('DEBUG: Raycast intersects=', intersects.length);

                if (intersects.length > 0) {
                    const firstHit = intersects[0].object;
                    if (globals.currentlyHovered !== firstHit) {
                        if (firstHit.userData.ratio) {
                            console.log('DEBUG: Playing note at ratio=', firstHit.userData.ratio);
                            setCurrentlyHovered(firstHit);
                            playChord(firstHit.userData.ratio);
                        }
                    }
                } else {
                    if (globals.currentlyHovered) {
                        console.log('DEBUG: No intersects, stopping chord');
                        stopChord();
                        setCurrentlyHovered(null);
                    }
                }
            } else {
                console.log('DEBUG: pinchScreenPos is null');
            }
        } else {
            // Pinch released
            if (globals.isShiftHeld) {
                setIsShiftHeld(false);
                const playButtonElement = document.getElementById('playButton');
                if (!globals.isClickPlayModeActive) {
                    if (globals.controls) globals.controls.enablePan = true;
                    if (playButtonElement) playButtonElement.classList.remove('play-button-active');
                }
                stopChord();
                setCurrentlyHovered(null);
            }
        }
    } else {
        // No index or thumb tip detected on right hand, ensure shift is released
        if (globals.isShiftHeld) {
            setIsShiftHeld(false);
            const playButtonElement = document.getElementById('playButton');
            if (!globals.isClickPlayModeActive) {
                if (globals.controls) globals.controls.enablePan = true;
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
    vector.project(globals.camera);

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
