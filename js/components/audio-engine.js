
import { 
    initialBaseFreq, currentPivotVoiceIndex, enableSlide, slideDuration,
    currentPeriodicWave, compensationGainNode,
    lastPlayedFrequencies, lastPlayedRatios, // Import as variables
    setCompensationGainNode, setCurrentPeriodicWave, setLastPlayedFrequencies, setLastPlayedRatios
} from '../globals.js';
import { updateNotationDisplay } from '../notation/notation-display.js';
import { notationDisplay, enableNotation } from '../globals.js';

let audioCtx;
let voices = []; // Array of { osc: OscillatorNode, gain: GainNode }
let mainGainNode;

export function initAudio() {
    if (audioCtx) return; // Already initialized
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        mainGainNode = audioCtx.createGain();
        mainGainNode.connect(audioCtx.destination);
        setCompensationGainNode(audioCtx.createGain());
        compensationGainNode.connect(mainGainNode);
    } catch (e) {
        console.error(`Error creating audio context: ${e.message}`);
    }
}

export function playChord(ratioString) {
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
        // Need to import lastPlayedFrequencies if it's not a setter
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
                voice.osc.frequency.linearRampToValueAtTime(freq, slideEndTime);
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

    setLastPlayedFrequencies(frequencies);
    setLastPlayedRatios(ratio);

    updateNotationDisplay(ratioString, frequencies, effectiveBaseFreq);
}

export function stopChord(immediate = false) {
    const fadeOutTime = immediate ? 0.01 : 0.5;
    const stopDelay = immediate ? 50 : 500;

    voices.forEach(voice => {
        voice.gain.gain.cancelScheduledValues(audioCtx.currentTime);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, audioCtx.currentTime);
        voice.gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + fadeOutTime);
    });

    if (notationDisplay && !enableNotation) { // Only hide if notation is disabled
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

export function updateWaveform(sliderValue) {
    if (!audioCtx) initAudio();

    // Handle the edge case for a pure square wave at the slider's maximum
    if (sliderValue >= 3) {
        const pureSquareCoeffs = waveCoeffs[3];
        if (compensationGainNode) {
            compensationGainNode.gain.setTargetAtTime(loudnessCompensation[3], audioCtx.currentTime, 0.01);
        }
        setCurrentPeriodicWave(audioCtx.createPeriodicWave(realCoeffs, pureSquareCoeffs, { disableNormalization: false }));
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

    setCurrentPeriodicWave(audioCtx.createPeriodicWave(realCoeffs, interpolatedImag, { disableNormalization: false }));
    
    drawWaveform(interpolatedImag);
}

export function drawWaveform(imag) {
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
