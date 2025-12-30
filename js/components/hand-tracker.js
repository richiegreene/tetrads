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

// State variables for two-hand gestures
let lastTwoHandDistance = null;
let lastHandsCenter = null;

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
    lastTwoHandDistance = null; // Reset two-hand state
    lastHandsCenter = null;     // Reset two-hand state

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
    console.log('detectHandsContinuously: isHandTrackingActive:', isHandTrackingActive, 'handPoseDetector:', handPoseDetector ? 'Loaded' : 'Not Loaded', 'video:', video ? 'Available' : 'Not Available'); // Added log
    
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

        const currentCameraDistance = camera.position.distanceTo(controls.target);
        let newCameraDistance = currentCameraDistance - deltaDistance * zoomSensitivity * 50; // Inverted sign to match intuitive zoom: hands apart -> zoom out (increase distance)

        newCameraDistance = Math.max(controls.minDistance, Math.min(controls.maxDistance, newCameraDistance));
        const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
        camera.position.copy(direction.multiplyScalar(newCameraDistance).add(controls.target));
        controls.update();
    }
    lastTwoHandDistance = currentTwoHandDistance;

    // --- Two-Hand Rotation ---
    const currentHandsCenter = new THREE.Vector3().addVectors(leftWrist, rightWrist).multiplyScalar(0.5);

    if (lastHandsCenter !== null) {
        const deltaX = currentHandsCenter.x - lastHandsCenter.x;
        const deltaY = currentHandsCenter.x - lastHandsCenter.y; // Corrected to use currentHandsCenter.y - lastHandsCenter.y

        const thetaDelta = -deltaX * rotationSensitivity * 20; 
        const phiDelta = -deltaY * rotationSensitivity * 20; 

        const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);

        spherical.phi += phiDelta; 
        spherical.theta += thetaDelta; 

        spherical.phi = Math.max(0.001, Math.min(Math.PI - 0.001, spherical.phi));

        offset.setFromSpherical(spherical);
        camera.position.copy(controls.target).add(offset);
        controls.update();
    }
    lastHandsCenter = currentHandsCenter;
}

function processHandGestures(hands) {
    if (!controls || isShiftHeld) {
        return; 
    }

    let leftHand = null;
    let rightHand = null;

    hands.forEach(hand => {
        if (hand.handedness && hand.handedness.length > 0 && hand.handedness[0] && hand.handedness[0].label) {
            const handednessLabel = hand.handedness[0].label;
            // Adjust handedness because flipHorizontal is true in estimateHands
            // MediaPipe's 'Right' is the user's visible 'Left' and vice versa.
            const lowerCaseLabel = handednessLabel.toLowerCase();
            if (lowerCaseLabel.includes('right')) {
                leftHand = hand;
            } else if (lowerCaseLabel.includes('left')) {
                rightHand = hand;
            }
        }
    });

    if (leftHand && rightHand) {
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
