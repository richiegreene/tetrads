
import * as THREE from 'https://unpkg.com/three@0.126.0/build/three.module.js';

export let scene, camera, renderer, controls;
export let pyodide;
export let python_ready = false;
export let currentSprites = []; // To store sprites for dynamic scaling
export let currentLayoutDisplay = 'points'; // Global variable to store current display mode
export let isShiftHeld = false; // To track if Shift key is currently held down
export let isClickPlayModeActive = false; // To track if play mode is active via button click
export let currentlyHovered = null; // To track the object the mouse is over
export let currentLayoutMode = 0; // 0: Plasma, 1: Viridis, 2: Greyscale Black, 3: Greyscale White
export let playButton; // Declare playButton globally
export let pivotButtons; // Declare pivotButtons globally
export let currentPivotVoiceIndex = 0; // 0: Bass, 1: Tenor, 2: Alto, 3: Soprano (default Bass)
export let lastPlayedFrequencies = [];
export let lastPlayedRatios = [];
export let latestUpdateToken = null; // Used to cancel stale updateTetrahedron runs
export const initialBaseFreq = 130.8128; // The fixed base frequency for the very first chord
export let rotationSpeed = 0.01;
export function setRotationSpeed(val) { rotationSpeed = val; }
export let enableSlide = true;
export let slideDuration = 0.25;

export let mpePressure = 64; // Current MPE pressure value (0-127)
export let mpePressureRampSpeed = 1; // How quickly pressure changes per interval
export let mpePressureIntervalTime = 50; // Milliseconds between pressure updates
export let mpePressureIntervalId = null; // To store the interval ID for clearing

// Playback state
export let playbackMode = 'browser'; // Default to browser audio
/* ---- perpetual rotation ----
   Caps Lock used to latch the turn, read through getModifierState — which
   browsers no longer report reliably, so the shape would simply stop turning
   with nothing on screen to say why. A button says it instead: it is visibly
   on or off, and the arrows steer it while it runs. */
export let autoRotate = false;
export let autoRotateDir = 'ArrowLeft'; // the turntable: about Y, leftward

// Notation state
export let enableNotation = true;
export let notationType = 'heji';
export let notationDisplay;
/* Sagittal's own two readings, which only mean anything while notationType is
   'sagittal': how finely the comma is spelled, and whether the symbol carries
   the whole alteration (revo) or stands beside a conventional sharp or flat
   (evo). Same pair Xenachord's Play drawer offers, and named the same. */
export let sagittalPrecision = 'medium';
export let sagittalEvo = false;

export const keyState = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false
};

// Functions to set values
export function setScene(val) { scene = val; }
export function setCamera(val) { camera = val; }
export function setRenderer(val) { renderer = val; }
export function setControls(val) { controls = val; }
export function setPyodide(val) { pyodide = val; }
export function setPythonReady(val) { python_ready = val; }
export function setCurrentSprites(val) { currentSprites = val; }
export function setCurrentLayoutDisplay(val) { currentLayoutDisplay = val; }
export function setIsShiftHeld(val) { isShiftHeld = val; }
export function setIsClickPlayModeActive(val) { isClickPlayModeActive = val; }
export function setCurrentlyHovered(val) { currentlyHovered = val; }
export function setCurrentLayoutMode(val) { currentLayoutMode = val; }
export function setPlayButton(val) { playButton = val; }
export function setPivotButtons(val) { pivotButtons = val; }
export function setCurrentPivotVoiceIndex(val) { currentPivotVoiceIndex = val; }
export function setLastPlayedFrequencies(val) { lastPlayedFrequencies = val; }
export function setLastPlayedRatios(val) { lastPlayedRatios = val; }
export function setLatestUpdateToken(val) { latestUpdateToken = val; }
export function setEnableSlide(val) { enableSlide = val; }
export function setSlideDuration(val) { slideDuration = val; }
export function setMpePressure(val) { mpePressure = val; }
export function setMpePressureRampSpeed(val) { mpePressureRampSpeed = val; }
export function setMpePressureIntervalTime(val) { mpePressureIntervalTime = val; }
export function setMpePressureIntervalId(val) { mpePressureIntervalId = val; }
export function setPlaybackMode(val) { playbackMode = val; } // New setter
export function setEnableNotation(val) { enableNotation = val; }
export function setNotationType(val) { notationType = val; }
export function setNotationDisplay(val) { notationDisplay = val; }
export function setSagittalPrecision(val) { sagittalPrecision = val; }
export function setSagittalEvo(val) { sagittalEvo = val; }
export function setAutoRotate(val) { autoRotate = val; }
export function setAutoRotateDir(val) { autoRotateDir = val; }

// Helper for keyState
export function setKeyState(key, value) {
    if (keyState.hasOwnProperty(key)) {
        keyState[key] = value;
    }
}
