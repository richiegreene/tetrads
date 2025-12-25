
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
export const rotationSpeed = 0.01;
export let enableSlide = true;
export let slideDuration = 0.25;
export let currentPeriodicWave = null; // For custom waveforms
export let compensationGainNode;

// Playback state
export let playbackMode = 'browser'; // Default to browser audio

// Notation state
export let enableNotation = true;
export let notationType = 'heji';
export let notationDisplay;

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
export function setCurrentPeriodicWave(val) { currentPeriodicWave = val; }
export function setCompensationGainNode(val) { compensationGainNode = val; }
export function setPlaybackMode(val) { playbackMode = val; } // New setter
export function setEnableNotation(val) { enableNotation = val; }
export function setNotationType(val) { notationType = val; }
export function setNotationDisplay(val) { notationDisplay = val; }

// Helper for keyState
export function setKeyState(key, value) {
    if (keyState.hasOwnProperty(key)) {
        keyState[key] = value;
    }
}
