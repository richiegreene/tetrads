
import { 
    initialBaseFreq, currentPivotVoiceIndex, enableSlide, slideDuration,
    currentPeriodicWave, compensationGainNode,
    lastPlayedFrequencies, lastPlayedRatios, playbackMode, // Import playbackMode
    setCompensationGainNode, setCurrentPeriodicWave, setLastPlayedFrequencies, setLastPlayedRatios
} from '../globals.js';
import { updateNotationDisplay } from '../notation/notation-display.js';
import { notationDisplay, enableNotation } from '../globals.js';
import { sendMpeNoteOn, sendMpeNoteOff, sendMpePitchBendUpdate, releaseAllMpeNotes, isMpeNoteActive } from '../midi/midi-output.js'; // Import MIDI functions

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
    // --- Determine Frequencies ---
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

    // --- Handle Browser Audio Playback ---
    if (playbackMode === 'browser' || playbackMode === 'both') {
        if (!audioCtx || !mainGainNode) {
            console.error("Audio context not initialized. Cannot play browser audio.");
            // Don't return here, as we might still want to send MIDI
        } else if (audioCtx.state === 'suspended') {
            audioCtx.resume().then(() => playChord(ratioString));
            // return; // Removed this return, as it would prevent MIDI from being sent if audio is suspended
        }

        if (enableSlide && voices.length > 0) {
            const slideEndTime = audioCtx.currentTime + slideDuration;
            frequencies.forEach((freq, index) => {
                if (voices[index]) {
                    const voice = voices[index];
                    voice.osc.frequency.cancelScheduledValues(audioCtx.currentTime);
                    voice.osc.frequency.setValueAtTime(voice.osc.frequency.value, audioCtx.currentTime);
                    voice.osc.frequency.linearRampToValueAtTime(freq, slideEndTime);
                }
            });
        } else {
            stopChord(true); // Immediate stop previous browser audio
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
    } else {
        // If not in browser mode, stop any existing browser audio
        if (voices.length > 0) {
            stopChord(true); 
        }
    }

    // --- Handle MPE MIDI Playback ---
    if (playbackMode === 'mpe-midi' || playbackMode === 'both') {
        const currentChordIndices = new Set(frequencies.map((_, index) => index));
        
        // Get all currently active MPE note indices (from previous chord)
        const previousActiveIndices = new Set();
        // Assuming a fixed max of 4 voices/notes in a chord, iterate through possible indices
        // This is a pragmatic approach as `activeMpeNotes` map is not directly iterable from here
        // without knowing its internal keys, and isMpeNoteActive is the only public API.
        for (let i = 0; i < 4; i++) { 
            if (isMpeNoteActive(i)) {
                previousActiveIndices.add(i);
            }
        }

        // Turn off notes that were active but are no longer in the current chord
        previousActiveIndices.forEach(prevIndex => {
            if (!currentChordIndices.has(prevIndex)) {
                sendMpeNoteOff(prevIndex);
            }
        });

        // Process notes for the CURRENT chord
        frequencies.forEach((freq, index) => {
            if (previousActiveIndices.has(index)) {
                // If this index was active, update its pitch bend
                sendMpePitchBendUpdate(index, freq);
            } else {
                // If this index is new or was not active, send Note On
                sendMpeNoteOn(index, freq);
            }
        });

        // If enableSlide is false, it means we don't want to sustain previous notes across different chords
        // so any remaining notes from 'lastPlayedRatios' that were not explicitly turned off above
        // (because they are not in the current chord, or were not processed)
        // should also be turned off. This acts as a reset.
        // This part needs to ensure all remaining active notes are released if slide is off
        // It's already handled by releaseAllMpeNotes below, but this is a specific case.
        if (!enableSlide) {
            releaseAllMpeNotes(); 
        }

    } else {
        releaseAllMpeNotes(); // Ensure MIDI notes are off if switching away from MIDI mode
    }

    setLastPlayedFrequencies(frequencies);
    setLastPlayedRatios(ratio);

    updateNotationDisplay(ratioString, frequencies, effectiveBaseFreq);
}

export function stopChord(immediate = false) {
    // --- Stop Browser Audio ---
    if (playbackMode === 'browser' || playbackMode === 'both') {
        const fadeOutTime = immediate ? 0.01 : 0.5;
        const stopDelay = immediate ? 50 : 500;

        voices.forEach(voice => {
            voice.gain.gain.cancelScheduledValues(audioCtx.currentTime);
            voice.gain.gain.setValueAtTime(voice.gain.gain.value, audioCtx.currentTime);
            voice.gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + fadeOutTime);
        });

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

    // --- Stop MPE MIDI ---
    if (playbackMode === 'mpe-midi' || playbackMode === 'both') {
        releaseAllMpeNotes();
    }

    if (notationDisplay && !enableNotation) {
        notationDisplay.style.display = 'none';
    }
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
