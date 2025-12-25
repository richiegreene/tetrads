
let midiAccess = null;
let midiOutput = null; // Currently selected MIDI output device
let midiOutputSelect = null; // HTML select element for MIDI output devices
let midiDeviceSelectorDiv = null; // HTML div containing the selector

let mpeChannels = new Set(); // Keep track of active MPE channels (2-16)

const MPE_PITCH_BEND_RANGE = 48; // Common MPE pitch bend range in semitones
const MIDI_CHANNEL_START = 2;
const MIDI_CHANNEL_END = 16;
const MAX_MPE_CHANNELS = MIDI_CHANNEL_END - MIDI_CHANNEL_START + 1;

// Stores the mapping from a unique note identifier (e.g., frequency or chord ratio)
// to its assigned MIDI channel and actual MIDI note number.
const activeMpeNotes = new Map(); // Map<noteId, { channel: number, midiNote: number, lastPitchBend: number }>

// --- MIDI Utilities ---
function frequencyToMidi(frequency) {
    return 69 + 12 * Math.log2(frequency / 440.0);
}

function centDeviationToPitchBend(centsDeviation) {
    // Pitch bend range is +/- 8192 for full range (+/- MPE_PITCH_BEND_RANGE semitones)
    // 1 semitone = 100 cents
    // So, MPE_PITCH_BEND_RANGE semitones = MPE_PITCH_BEND_RANGE * 100 cents
    // Pitch Bend Value (PBV) = centsDeviation / (MPE_PITCH_BEND_RANGE * 100) * 8191 (for positive) or -8192 (for negative)
    // MIDI Pitch Bend Range is 0 to 16383, with 8192 being center.
    
    // Scale centsDeviation to +/- 1 range relative to MPE_PITCH_BEND_RANGE semitones
    const normalizedBend = centsDeviation / (MPE_PITCH_BEND_RANGE * 100);

    // Map to MIDI pitch bend value (0-16383)
    // Center (0 cents) is 8192
    // Max positive bend is 16383
    // Max negative bend is 0
    let pbValue = Math.round(8192 + (8191 * normalizedBend));

    // Clamp values to ensure they are within MIDI range
    pbValue = Math.max(0, Math.min(16383, pbValue));
    return pbValue;
}

// --- MPE Channel Management ---
function getAvailableMpeChannel() {
    for (let channel = MIDI_CHANNEL_START; channel <= MIDI_CHANNEL_END; channel++) {
        if (!mpeChannels.has(channel)) {
            mpeChannels.add(channel);
            return channel;
        }
    }
    return null; // No available channels
}

function releaseMpeChannel(channel) {
    mpeChannels.delete(channel);
}

// --- MIDI Device Selection UI ---
function updateMidiOutputDevices() {
    console.log("Updating MIDI output devices...");
    midiOutputSelect.innerHTML = ''; // Clear existing options
    const outputs = midiAccess.outputs.values();
    let hasDevices = false;
    let currentMidiOutputs = [];

    for (let output of outputs) {
        hasDevices = true;
        currentMidiOutputs.push({id: output.id, name: output.name});
        const option = document.createElement('option');
        option.value = output.id;
        option.textContent = output.name;
        midiOutputSelect.appendChild(option);
        console.log(`Found MIDI Output Device: ${output.name} (ID: ${output.id})`);
    }

    if (hasDevices) {
        midiDeviceSelectorDiv.style.display = 'flex';
        // Select the first device found by default, or the previously selected one if it still exists
        midiOutput = midiAccess.outputs.get(midiOutputSelect.value);
        if (midiOutput) {
            console.log(`Selected MIDI output: ${midiOutput.name} (ID: ${midiOutput.id})`);
        } else {
            console.warn("MIDI output device selected in dropdown is no longer available.");
            midiOutput = null; // Ensure it's null if not found
        }
    } else {
        midiDeviceSelectorDiv.style.display = 'none';
        midiOutput = null;
        const option = document.createElement('option');
        option.textContent = 'No devices found';
        midiOutputSelect.appendChild(option);
        console.warn("No MIDI output devices found.");
    }
    console.log("Finished updating MIDI output devices. Current midiOutput:", midiOutput);
}

// --- Web MIDI API Functions ---
export async function initMidiOutput() {
    console.log("Initializing MIDI output...");
    if (!navigator.requestMIDIAccess) {
        console.warn("Web MIDI API is not supported in this browser.");
        return;
    }

    try {
        midiAccess = await navigator.requestMIDIAccess({ sysex: false });
        console.log("MIDI access granted.");

        midiOutputSelect = document.getElementById('midiOutputSelect');
        midiDeviceSelectorDiv = document.getElementById('midi-device-selector');
        
        // Ensure the div exists, if not, create a fallback/warning
        if (!midiOutputSelect || !midiDeviceSelectorDiv) {
            console.error("MIDI output selector UI elements not found in DOM.");
            return;
        }

        midiAccess.onstatechange = (event) => {
            console.log(`MIDI device state change: ${event.port.name} state: ${event.port.state}, type: ${event.port.type}`);
            if (event.port.type === 'output') {
                updateMidiOutputDevices();
            }
        };

        midiOutputSelect.addEventListener('change', (event) => {
            midiOutput = midiAccess.outputs.get(event.target.value);
            console.log(`MIDI output changed to: ${midiOutput ? midiOutput.name : 'None selected'}`);
        });

        updateMidiOutputDevices(); // Initial population of devices

    } catch (err) {
        console.error(`Failed to get MIDI access: ${err}`);
        if (midiDeviceSelectorDiv) {
            midiDeviceSelectorDiv.style.display = 'none'; // Hide if MIDI access fails
        }
    }
    console.log("MIDI output initialization complete. Current midiOutput:", midiOutput);
}

export function sendMpeNoteOn(noteId, frequency, velocity = 100) {
    console.log(`Attempting to send MPE Note On for noteId: ${noteId}, freq: ${frequency}. Current midiOutput:`, midiOutput);
    if (!midiOutput) {
        console.warn("No MIDI output selected or available. Cannot send Note On.");
        return;
    }

    let { channel, midiNote, lastPitchBend } = activeMpeNotes.get(noteId) || {};

    if (!channel) {
        channel = getAvailableMpeChannel();
        if (!channel) {
            console.warn("No free MPE channels to send note.");
            return;
        }
        console.log(`Assigned MPE channel ${channel} to noteId: ${noteId}`);
    }

    midiNote = Math.round(frequencyToMidi(frequency));
    const centsDeviation = (frequencyToMidi(frequency) - midiNote) * 100; // Cents deviation from the nearest MIDI note
    lastPitchBend = centDeviationToPitchBend(centsDeviation);

    // MPE Pitch Bend Sensitivity RPN message (Controller 101, 100, Data Entry MSB 0, LSB MPE_PITCH_BEND_RANGE)
    // This is typically sent once per channel (or when PB range changes)
    midiOutput.send([0xB0 | channel, 0x65, 0x00]); // RPN MSB (Pitch Bend Range)
    midiOutput.send([0xB0 | channel, 0x64, 0x00]); // RPN LSB (Pitch Bend Range)
    midiOutput.send([0xB0 | channel, 0x06, MPE_PITCH_BEND_RANGE]); // Data Entry MSB (Pitch Bend Range in semitones)
    midiOutput.send([0xB0 | channel, 0x26, 0x00]); // Data Entry LSB (usually 0)
    console.log(`Sent RPN for PB Range on channel ${channel}: ${MPE_PITCH_BEND_RANGE} semitones.`);


    midiOutput.send([0xE0 | channel, lastPitchBend & 0x7F, (lastPitchBend >> 7) & 0x7F]); // Pitch Bend
    midiOutput.send([0x90 | channel, midiNote, velocity]); // Note On

    activeMpeNotes.set(noteId, { channel, midiNote, lastPitchBend });
    console.log(`MPE Note On: noteId=${noteId}, freq=${frequency}, MIDI Note=${midiNote}, PB=${lastPitchBend}, channel=${channel}, velocity=${velocity}`);
}

export function sendMpeNoteOff(noteId, velocity = 64) {
    console.log(`Attempting to send MPE Note Off for noteId: ${noteId}. Current midiOutput:`, midiOutput);
    if (!midiOutput) {
        console.warn("No MIDI output selected or available. Cannot send Note Off.");
        return;
    }

    const noteInfo = activeMpeNotes.get(noteId);
    if (noteInfo) {
        const { channel, midiNote } = noteInfo;
        midiOutput.send([0x80 | channel, midiNote, velocity]); // Note Off
        releaseMpeChannel(channel);
        activeMpeNotes.delete(noteId);
        console.log(`MPE Note Off: noteId=${noteId}, MIDI Note=${midiNote}, channel=${channel}, velocity=${velocity}`);
    } else {
        console.warn(`Note info not found for noteId: ${noteId}. Cannot send Note Off.`);
    }
}

export function sendMpePitchBendUpdate(noteId, frequency) {
    console.log(`Attempting to send MPE Pitch Bend Update for noteId: ${noteId}, freq: ${frequency}. Current midiOutput:`, midiOutput);
    if (!midiOutput) {
        console.warn("No MIDI output selected or available. Cannot send Pitch Bend Update.");
        return;
    }

    const noteInfo = activeMpeNotes.get(noteId);
    if (noteInfo) {
        const { channel, midiNote } = noteInfo;
        const centsDeviation = (frequencyToMidi(frequency) - midiNote) * 100;
        const newPitchBend = centDeviationToPitchBend(centsDeviation);

        if (newPitchBend !== noteInfo.lastPitchBend) {
            midiOutput.send([0xE0 | channel, newPitchBend & 0x7F, (newPitchBend >> 7) & 0x7F]); // Pitch Bend
            noteInfo.lastPitchBend = newPitchBend;
            activeMpeNotes.set(noteId, noteInfo); // Update stored value
            console.log(`MPE Pitch Bend Update: noteId=${noteId}, freq=${frequency}, MIDI Note=${midiNote}, PB=${newPitchBend}, channel=${channel}`);
        } else {
            console.log(`Pitch bend value unchanged for noteId: ${noteId}, PB: ${newPitchBend}. No update sent.`);
        }
    } else {
        console.warn(`Note info not found for noteId: ${noteId}. Cannot send Pitch Bend Update.`);
    }
}

export function releaseAllMpeNotes() {
    console.log("Attempting to release all MPE notes. Current midiOutput:", midiOutput);
    if (!midiOutput) {
        console.warn("No MIDI output selected or available. Cannot release all MPE notes.");
        return;
    }

    activeMpeNotes.forEach((noteInfo, noteId) => {
        const { channel, midiNote } = noteInfo;
        midiOutput.send([0x80 | channel, midiNote, 0]); // Note Off with velocity 0
        releaseMpeChannel(channel);
        console.log(`MPE Note Off (all): noteId=${noteId}, MIDI Note=${midiNote}, channel=${channel}`);
    });
    activeMpeNotes.clear();
    mpeChannels.clear(); // Clear all assigned channels
    console.log("All MPE notes released.");
}

export function isMpeNoteActive(noteId) {
    return activeMpeNotes.has(noteId);
}
