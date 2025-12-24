import * as THREE from 'https://unpkg.com/three@0.126.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.126.0/examples/jsm/controls/OrbitControls.js';

import * as C from './lib/constants.js'; // HEJI constants
import { state as hejiState } from './lib/state.js'; // HEJI state
import * as U from './lib/utils.js'; // HEJI utilities

let scene, camera, renderer, controls;
let pyodide;
let loadingOverlay = document.getElementById('loading-overlay');
let python_ready = false;
let currentSprites = []; // To store sprites for dynamic scaling
let currentLayoutDisplay = 'points'; // Global variable to store current display mode
let isShiftHeld = false; // To track if Shift key is currently held down
let isClickPlayModeActive = false; // To track if play mode is active via button click
let currentlyHovered = null; // To track the object the mouse is over
let currentLayoutMode = 0; // 0: Plasma, 1: Viridis, 2: Greyscale Black, 3: Greyscale White
let playButton; // Declare playButton globally
let pivotButtons; // Declare pivotButtons globally
let currentPivotVoiceIndex = 0; // 0: Bass, 1: Tenor, 2: Alto, 3: Soprano (default Bass)
let lastPlayedFrequencies = [];
let lastPlayedRatios = [];
let latestUpdateToken = null; // Used to cancel stale updateTetrahedron runs
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

// Initialize hejiState.precision
hejiState.precision = 0; // Default precision, adjust if needed

const keyState = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false
};

// --- HEJI NOTATION FUNCTIONS ---
// Helper functions for _getPC (minimal UI interaction, mainly fixed defaults for Tetrads context)
function getRefOctave() { return 9; } // Default to C4 (index 9) for octave
function getRefNote() { return 1; } // Default to C (index 1) for note
function getRefAccidental() { return 1; } // Default to natural (index 1) for accidental

// Minimal mock for parsing MIDI note output if needed for `_getPC`
function parseMidiNoteOutput(midiNoteString) {
    let letter = '';
    let accidentalCode = '';
    const primaryPart = midiNoteString.split(' | ')[0];
    const accidentalMatch = primaryPart.match(/^\*(\w{2})/);
    if (accidentalMatch) {
        accidentalCode = accidentalMatch[1];
        letter = primaryPart.substring(3);
    } else {
        letter = primaryPart;
    }
    let heji2Accidental = '';
    switch (accidentalCode) {
        case 'nt': heji2Accidental = 'j'; break;
        case 'st': heji2Accidental = 'z'; break;
        case 'ft': heji2Accidental = 'a'; break;
        default: heji2Accidental = ''; break;
    }
    return { letter: letter, accidental: heji2Accidental };
}

// --- NOTATION FUNCTIONS ---
function parseMidiNoteOutput(midiNoteString) {
    let letter = '';
    let accidentalCode = '';
    const primaryPart = midiNoteString.split(' | ')[0];
    const accidentalMatch = primaryPart.match(/^\*(\w{2})/);
    if (accidentalMatch) {
        accidentalCode = accidentalMatch[1];
        letter = primaryPart.substring(3);
    } else {
        letter = primaryPart;
    }
    let heji2Accidental = '';
    switch (accidentalCode) {
        case 'nt': heji2Accidental = 'j'; break;
        case 'st': heji2Accidental = 'z'; break;
        case 'ft': heji2Accidental = 'a'; break;
        default: heji2Accidental = ''; break;
    }
    return { letter: letter, accidental: heji2Accidental };
}

// Ported and adapted getPC function from Notation Dev
function _getPC(monzo) {
    hejiState.displaySum = monzo;

	var inverseSum = U.diffArray(hejiState.displaySum, C.refOctave[getRefOctave()]);
    inverseSum = U.diffArray(inverseSum, C.refNote[getRefNote()]);
    inverseSum = U.diffArray(inverseSum, C.refAccidental[getRefAccidental()]);

	var referenceSum = U.diffArray(C.refOctave[getRefOctave()], C.refNote[getRefNote()]);
    referenceSum = U.diffArray(referenceSum, C.refAccidental[getRefAccidental()]);

	var refArray = U.productArray(referenceSum, C.tonalIdentity);

    let tonalArray = U.productArray(inverseSum, C.tonalIdentity);
	
	var refArraySum = U.sum(refArray);
	var tonalArraySum = U.sum(tonalArray);
	var refpc = U.mod((refArraySum + 4),7); 
	var pc = U.mod((tonalArraySum + 4),7);
	var outputDiatonic = C.diatonicOutput[pc];
	var ref12;
	if (refpc == 0){
		ref12 = 5;
	} else if (refpc == 1){
		ref12 = 0;
	} else if (refpc == 2){
		ref12 = 7;
	} else if (refpc == 3){
		ref12 = 2;
	} else if (refpc == 4){
		ref12 = 9;
	} else if (refpc == 5){
		ref12 = 4;
	} else if (refpc == 6){
		ref12 = 11;
	}

    // These need to be mocked or initialized if hejiState.jiCents and hejiState.cents_toRef are used.
    // For now, setting to 0 or default to prevent errors, as they are not driven by Tetrads UI.
    hejiState.ref12acc = 0;
    hejiState.jiCents = 0; 
    hejiState.cents_toRef = 0;
    hejiState.diat_to_refTempered = (C.diatonicTempered[pc] - C.diatonicTempered[refpc] + (100 * hejiState.ref12acc) + 1200.0) % 1200.0;
    hejiState.cents_from_diatonic_tempered = ((((hejiState.cents_toRef % 1200.0) + 1200.0) % 1200.0) - hejiState.diat_to_refTempered + 1200.0) % 1200.0;

	var refNat = 7 * hejiState.ref12acc;
	var note = U.mod(((((ref12 * 100) + hejiState.jiCents ) / 100).toFixed(0) - hejiState.ref12acc),12);
	// We don't have midi notes in Tetrads, so mock this or use a default.
    var refMidiNoteOutput = C.refMidiNote[note] || "*ntC"; 

	var natural = "";
	var pythag = "";
	var septimal = "";
	var undecimal = "";
	var tridecimal = "";
	var seventeen = "";
	var nineteen = "";
	var twentyThree = "";
	var twentyNine = "";
	var thirtyOne = "";
	var thirtySeven = "";
	var fortyOne = "";
	var fortyThree = "";
	var fortySeven = "";
	var fiftyThree = "";
	var fiftyNine = "";
	var sixtyOne = "";
	var sixtySeven = "";
	var seventyOne = "";
	var seventyThree = "";
	var seventyNine = "";
	var eightyThree = "";
	var eightyNine = "";
	var chromatic = tonalArraySum + 25;
	// display natural on diatonic pitch classes 
	if ((hejiState.displaySum[1] - refNat + refpc - 4 == -4 || hejiState.displaySum[1] - refNat + refpc - 4 == -3 || hejiState.displaySum[1] - refNat + refpc - 4 == -2 || hejiState.displaySum[1] - refNat + refpc - 4 == -1 || hejiState.displaySum[1] - refNat + refpc - 4 == 0 || hejiState.displaySum[1] - refNat + refpc - 4 == 1 || hejiState.displaySum[1] - refNat + refpc - 4 == 2) && hejiState.displaySum[2] == 0 && hejiState.displaySum[3] == 0 && hejiState.displaySum[4] == 0 && hejiState.displaySum[5] == 0 && hejiState.displaySum[6] == 0 && hejiState.displaySum[7] == 0 && hejiState.displaySum[8] == 0 && hejiState.displaySum[9] == 0 && hejiState.displaySum[10] == 0 && hejiState.displaySum[11] == 0 && hejiState.displaySum[12] == 0 && hejiState.displaySum[13] == 0 && hejiState.displaySum[14] == 0 && hejiState.displaySum[15] == 0 && hejiState.displaySum[16] == 0 && hejiState.displaySum[17] == 0 && hejiState.displaySum[18] == 0 && hejiState.displaySum[19] == 0 && hejiState.displaySum[20] == 0 && hejiState.displaySum[21] == 0 && hejiState.displaySum[22] == 0 && hejiState.displaySum[23] == 0){
		natural = "n"; 
	} else {
		natural = "";
	}
	// rest of the combinations
	if (hejiState.displaySum[2] == -4){
		if (chromatic>=0 && chromatic <= 6){
			pythag = C.fiveUpUpUpUp[0];
		} else if (chromatic >= 7 && chromatic <= 13){
			pythag = C.fiveUpUpUpUp[1];
		} else if (chromatic >= 14 && chromatic <= 20){
			pythag = C.fiveUpUpUpUp[2];
		} else if (chromatic >= 21 && chromatic <= 27){
			pythag = C.fiveUpUpUpUp[3];
		} else if (chromatic >= 28 && chromatic <= 34){
			pythag = C.fiveUpUpUpUp[4];
		} else if (chromatic >= 35 && chromatic <= 41){
			pythag = C.fiveUpUpUpUp[5];
		} else if (chromatic >= 42 && chromatic <= 48){
			pythag = C.fiveUpUpUpUp[6];
		}
	} else if (hejiState.displaySum[2] == -3){
		if (chromatic>=0 && chromatic <= 6){
			pythag = C.fiveUpUpUp[0];
		} else if (chromatic >= 7 && chromatic <= 13){
			pythag = C.fiveUpUpUp[1];
		} else if (chromatic >= 14 && chromatic <= 20){
			pythag = C.fiveUpUpUp[2];
		} else if (chromatic >= 21 && chromatic <= 27){
			pythag = C.fiveUpUpUp[3];
		} else if (chromatic >= 28 && chromatic <= 34){
			pythag = C.fiveUpUpUp[4];
		} else if (chromatic >= 35 && chromatic <= 41){
			pythag = C.fiveUpUpUp[5];
		} else if (chromatic >= 42 && chromatic <= 48){
			pythag = C.fiveUpUpUp[6];
		}
	} else if (hejiState.displaySum[2] == -2){
		if (chromatic>=0 && chromatic <= 6){
			pythag = C.fiveUpUp[0];
		} else if (chromatic >= 7 && chromatic <= 13){
			pythag = C.fiveUpUp[1];
		} else if (chromatic >= 14 && chromatic <= 20){
			pythag = C.fiveUpUp[2];
		} else if (chromatic >= 21 && chromatic <= 27){
			pythag = C.fiveUpUp[3];
		} else if (chromatic >= 28 && chromatic <= 34){
			pythag = C.fiveUpUp[4];
		} else if (chromatic >= 35 && chromatic <= 41){
			pythag = C.fiveUpUp[5];
		} else if (chromatic >= 42 && chromatic <= 48){
			pythag = C.fiveUpUp[6];
		}
	} else if (hejiState.displaySum[2] == -1){
		if (chromatic>=0 && chromatic <= 6){
			pythag = C.fiveUp[0];
		} else if (chromatic >= 7 && chromatic <= 13){
			pythag = C.fiveUp[1];
		} else if (chromatic >= 14 && chromatic <= 20){
			pythag = C.fiveUp[2];
		} else if (chromatic >= 21 && chromatic <= 27){
			pythag = C.fiveUp[3];
		} else if (chromatic >= 28 && chromatic <= 34){
			pythag = C.fiveUp[4];
		} else if (chromatic >= 35 && chromatic <= 41){
			pythag = C.fiveUp[5];
		} else if (chromatic >= 42 && chromatic <= 48){
			pythag = C.fiveUp[6];
		}
	} else if (hejiState.displaySum[2] == 0){
		if (chromatic >= 0 && chromatic <= 6){
			pythag = C.pythagOutput[0];
		} else if (chromatic >= 7 && chromatic <= 13){
			pythag = C.pythagOutput[1];
		} else if (chromatic >= 14 && chromatic <= 20){
			pythag = C.pythagOutput[2];
		} else if (chromatic >= 21 && chromatic <= 27){
			pythag = C.pythagOutput[3];
		} else if (chromatic >= 28 && chromatic <= 34){
			pythag = C.pythagOutput[4];
		} else if (chromatic >= 35 && chromatic <= 41){
			pythag = C.pythagOutput[5];
		} else if (chromatic >= 42 && chromatic <= 48){
			pythag = C.pythagOutput[6];
		}
	} else if (hejiState.displaySum[2] == 1){
		if (chromatic>=0 && chromatic <= 6){
			pythag = C.fiveDown[0];
		} else if (chromatic >= 7 && chromatic <= 13){
			pythag = C.fiveDown[1];
		} else if (chromatic >= 14 && chromatic <= 20){
			pythag = C.fiveDown[2];
		} else if (chromatic >= 21 && chromatic <= 27){
			pythag = C.fiveDown[3];
		} else if (chromatic >= 28 && chromatic <= 34){
			pythag = C.fiveDown[4];
		} else if (chromatic >= 35 && chromatic <= 41){
			pythag = C.fiveDown[5];
		} else if (chromatic >= 42 && chromatic <= 48){
			pythag = C.fiveDown[6];
		}
	} else if (hejiState.displaySum[2] == 2){
		if (chromatic>=0 && chromatic <= 6){
			pythag = C.fiveDownDown[0];
		} else if (chromatic >= 7 && chromatic <= 13){
			pythag = C.fiveDownDown[1];
		} else if (chromatic >= 14 && chromatic <= 20){
			pythag = C.fiveDownDown[2];
		} else if (chromatic >= 21 && chromatic <= 27){
			pythag = C.fiveDownDown[3];
		} else if (chromatic >= 28 && chromatic <= 34){
			pythag = C.fiveDownDown[4];
		} else if (chromatic >= 35 && chromatic <= 41){
			pythag = C.fiveDownDown[5];
		} else if (chromatic >= 42 && chromatic <= 48){
			pythag = C.fiveDownDown[6];
		}
	} else if (hejiState.displaySum[2] == 3){
		if (chromatic>=0 && chromatic <= 6){
			pythag = C.fiveDownDownDown[0];
		} else if (chromatic >= 7 && chromatic <= 13){
			pythag = C.fiveDownDownDown[1];
		} else if (chromatic >= 14 && chromatic <= 20){
			pythag = C.fiveDownDownDown[2];
		} else if (chromatic >= 21 && chromatic <= 27){
			pythag = C.fiveDownDownDown[3];
		} else if (chromatic >= 28 && chromatic <= 34){
			pythag = C.fiveDownDownDown[4];
		} else if (chromatic >= 35 && chromatic <= 41){
			pythag = C.fiveDownDownDown[5];
		} else if (chromatic >= 42 && chromatic <= 48){
			pythag = C.fiveDownDownDown[6];
		}
	} else if (hejiState.displaySum[2] == 4){
		if (chromatic>=0 && chromatic <= 6){
			pythag = C.fiveDownDownDownDown[0];
		} else if (chromatic >= 7 && chromatic <= 13){
			pythag = C.fiveDownDownDownDown[1];
		} else if (chromatic >= 14 && chromatic <= 20){
			pythag = C.fiveDownDownDownDown[2];
		} else if (chromatic >= 21 && chromatic <= 27){
			pythag = C.fiveDownDownDownDown[3];
		} else if (chromatic >= 28 && chromatic <= 34){
			pythag = C.fiveDownDownDownDown[4];
		} else if (chromatic >= 35 && chromatic <= 41){
			pythag = C.fiveDownDownDownDown[5];
		} else if (chromatic >= 42 && chromatic <= 48){
			pythag = C.fiveDownDownDownDown[6];
		}
	}
	if (hejiState.displaySum[3] == -3){
		septimal = C.septimalSymbols[6];
	} else if (hejiState.displaySum[3] == -2){
		septimal = C.septimalSymbols[5];
	} else if (hejiState.displaySum[3] == -1){
		septimal = C.septimalSymbols[4];
	} else if (hejiState.displaySum[3] == 0){
		septimal = C.septimalSymbols[3];
	} else if (hejiState.displaySum[3] == 1){
		septimal = C.septimalSymbols[2];
	} else if (hejiState.displaySum[3] == 2){
		septimal = C.septimalSymbols[1];
	} else if (hejiState.displaySum[3] == 3){
		septimal = C.septimalSymbols[0];
	} 
	if (hejiState.displaySum[4] == 3){
		undecimal = C.undecimalSymbols[6];
	} else if (hejiState.displaySum[4] == 2){
		undecimal = C.undecimalSymbols[5];
	} else if (hejiState.displaySum[4] == 1){
		undecimal = C.undecimalSymbols[4];
	} else if (hejiState.displaySum[4] == 0){
		undecimal = C.undecimalSymbols[3];
	} else if (hejiState.displaySum[4] == -1){
		undecimal = C.undecimalSymbols[2];
	} else if (hejiState.displaySum[4] == -2){
		undecimal = C.undecimalSymbols[1];
	} else if (hejiState.displaySum[4] == -3){
		undecimal = C.undecimalSymbols[0];
	} 
	if (hejiState.displaySum[5] == -3){
		tridecimal = C.tridecimalSymbols[6];
	} else if (hejiState.displaySum[5] == -2){
		tridecimal = C.tridecimalSymbols[5];
	} else if (hejiState.displaySum[5] == -1){
		tridecimal = C.tridecimalSymbols[4];
	} else if (hejiState.displaySum[5] == 0){
		tridecimal = C.tridecimalSymbols[3];
	} else if (hejiState.displaySum[5] == 1){
		tridecimal = C.tridecimalSymbols[2];
	} else if (hejiState.displaySum[5] == 2){
		tridecimal = C.tridecimalSymbols[1];
	} else if (hejiState.displaySum[5] == 3){
		tridecimal = C.tridecimalSymbols[0];
	} 
	if (hejiState.displaySum[6] == -3){
		seventeen = C.seventeenSymbols[6];
	} else if (hejiState.displaySum[6] == -2){
		seventeen = C.seventeenSymbols[5];
	} else if (hejiState.displaySum[6] == -1){
		seventeen = C.seventeenSymbols[4];
	} else if (hejiState.displaySum[6] == 0){
		seventeen = C.seventeenSymbols[3];
	} else if (hejiState.displaySum[6] == 1){
		seventeen = C.seventeenSymbols[2];
	} else if (hejiState.displaySum[6] == 2){
		seventeen = C.seventeenSymbols[1];
	} else if (hejiState.displaySum[6] == 3){
		seventeen = C.seventeenSymbols[0];
	}
	if (hejiState.displaySum[7] == -3){
		nineteen = C.nineteenSymbols[0];
	} else if (hejiState.displaySum[7] == -2){
		nineteen = C.nineteenSymbols[1];
	} else if (hejiState.displaySum[7] == -1){
		nineteen = C.nineteenSymbols[2];
	} else if (hejiState.displaySum[7] == 0){
		nineteen = C.nineteenSymbols[3];
	} else if (hejiState.displaySum[7] == 1){
		nineteen = C.nineteenSymbols[4];
	} else if (hejiState.displaySum[7] == 2){
		nineteen = C.nineteenSymbols[5];
	} else if (hejiState.displaySum[7] == 3){
		nineteen = C.nineteenSymbols[6];
	}
	if (hejiState.displaySum[8] == -3){
		twentyThree = C.twentyThreeSymbols[0];
	} else if (hejiState.displaySum[8] == -2){
		twentyThree = C.twentyThreeSymbols[1];
	} else if (hejiState.displaySum[8] == -1){
		twentyThree = C.twentyThreeSymbols[2];
	} else if (hejiState.displaySum[8] == 0){
		twentyThree = C.twentyThreeSymbols[3];
	} else if (hejiState.displaySum[8] == 1){
		twentyThree = C.twentyThreeSymbols[4];
	} else if (hejiState.displaySum[8] == 2){
		twentyThree = C.twentyThreeSymbols[5];
	} else if (hejiState.displaySum[8] == 3){
		twentyThree = C.twentyThreeSymbols[6];
	}
	if (hejiState.displaySum[9] == 3){
		twentyNine = C.twentyNineSymbols[6];
	} else if (hejiState.displaySum[9] == 2){
		twentyNine = C.twentyNineSymbols[5];
	} else if (hejiState.displaySum[9] == 1){
		twentyNine = C.twentyNineSymbols[4];
	} else if (hejiState.displaySum[9] == 0){
		twentyNine = C.twentyNineSymbols[3];
	} else if (hejiState.displaySum[9] == -1){
		twentyNine = C.twentyNineSymbols[2];
	} else if (hejiState.displaySum[9] == -2){
		twentyNine = C.twentyNineSymbols[1];
	} else if (hejiState.displaySum[9] == -3){
		twentyNine = C.twentyNineSymbols[0];
	}
	if (hejiState.displaySum[10] == -3){
		thirtyOne = C.thirtyOneSymbols[6];
	} else if (hejiState.displaySum[10] == -2){
		thirtyOne = C.thirtyOneSymbols[5];
	} else if (hejiState.displaySum[10] == -1){
		thirtyOne = C.thirtyOneSymbols[4];
	} else if (hejiState.displaySum[10] == 0){
		thirtyOne = C.thirtyOneSymbols[3];
	} else if (hejiState.displaySum[10] == 1){
		thirtyOne = C.thirtyOneSymbols[2];
	} else if (hejiState.displaySum[10] == 2){
		thirtyOne = C.thirtyOneSymbols[1];
	} else if (hejiState.displaySum[10] == 3){
		thirtyOne = C.thirtyOneSymbols[0];
	}
	if (hejiState.displaySum[11] == 3){
		thirtySeven = C.thirtySevenSymbols[6];
	} else if (hejiState.displaySum[11] == 2){
		thirtySeven = C.thirtySevenSymbols[5];
	} else if (hejiState.displaySum[11] == 1){
		thirtySeven = C.thirtySevenSymbols[4];
	} else if (hejiState.displaySum[11] == 0){
		thirtySeven = C.thirtySevenSymbols[3];
	} else if (hejiState.displaySum[11] == -1){
		thirtySeven = C.thirtySevenSymbols[2];
	} else if (hejiState.displaySum[11] == -2){
		thirtySeven = C.thirtySevenSymbols[1];
	} else if (hejiState.displaySum[11] == -3){
		thirtySeven = C.thirtySevenSymbols[0];
	}
	if (hejiState.displaySum[12] == 3){
		fortyOne = C.fortyOneSymbols[6];
	} else if (hejiState.displaySum[12] == 2){
		fortyOne = C.fortyOneSymbols[5];
	} else if (hejiState.displaySum[12] == 1){
		fortyOne = C.fortyOneSymbols[4];
	} else if (hejiState.displaySum[12] == 0){
		fortyOne = C.fortyOneSymbols[3];
	} else if (hejiState.displaySum[12] == -1){
		fortyOne = C.fortyOneSymbols[2];
	} else if (hejiState.displaySum[12] == -2){
		fortyOne = C.fortyOneSymbols[1];
	} else if (hejiState.displaySum[12] == -3){
		fortyOne = C.fortyOneSymbols[0];
	}
	if (hejiState.displaySum[13] == 3){
		fortyThree = C.fortyThreeSymbols[6];
	} else if (hejiState.displaySum[13] == 2){
		fortyThree = C.fortyThreeSymbols[5];
	} else if (hejiState.displaySum[13] == 1){
		fortyThree = C.fortyThreeSymbols[4];
	} else if (hejiState.displaySum[13] == 0){
		fortyThree = C.fortyThreeSymbols[3];
	} else if (hejiState.displaySum[13] == -1){
		fortyThree = C.fortyThreeSymbols[2];
	} else if (hejiState.displaySum[13] == -2){
		fortyThree = C.fortyThreeSymbols[1];
	} else if (hejiState.displaySum[13] == -3){
		fortyThree = C.fortyThreeSymbols[0];
	}
	if (hejiState.displaySum[14] == 3){
		fortySeven = C.fortySevenSymbols[6];
	} else if (hejiState.displaySum[14] == 2){
		fortySeven = C.fortySevenSymbols[5];
	} else if (hejiState.displaySum[14] == 1){
		fortySeven = C.fortySevenSymbols[4];
	} else if (hejiState.displaySum[14] == 0){
		fortySeven = C.fortySevenSymbols[3];
	} else if (hejiState.displaySum[14] == -1){
		fortySeven = C.fortySevenSymbols[2];
	} else if (hejiState.displaySum[14] == -2){
		fortySeven = C.fortySevenSymbols[1];
	} else if (hejiState.displaySum[14] == -3){
		fortySeven = C.fortySevenSymbols[0];
	}
	if (hejiState.displaySum[15] == 3){
		fiftyThree = C.fiftyThreeSymbols[6];
	} else if (hejiState.displaySum[15] == 2){
		fiftyThree = C.fiftyThreeSymbols[5];
	} else if (hejiState.displaySum[15] == 1){
		fiftyThree = C.fiftyThreeSymbols[4];
	} else if (hejiState.displaySum[15] == 0){
		fiftyThree = C.fiftyThreeSymbols[3];
	} else if (hejiState.displaySum[15] == -1){
		fiftyThree = C.fiftyThreeSymbols[2];
	} else if (hejiState.displaySum[15] == -2){
		fiftyThree = C.fiftyThreeSymbols[1];
	} else if (hejiState.displaySum[15] == -3){
		fiftyThree = C.fiftyThreeSymbols[0];
	}
	if (hejiState.displaySum[16] == 3){
		fiftyNine = C.fiftyNineSymbols[6];
	} else if (hejiState.displaySum[16] == 2){
		fiftyNine = C.fiftyNineSymbols[5];
	} else if (hejiState.displaySum[16] == 1){
		fiftyNine = C.fiftyNineSymbols[4];
	} else if (hejiState.displaySum[16] == 0){
		fiftyNine = C.fiftyNineSymbols[3];
	} else if (hejiState.displaySum[16] == -1){
		fiftyNine = C.fiftyNineSymbols[2];
	} else if (hejiState.displaySum[16] == -2){
		fiftyNine = C.fiftyNineSymbols[1];
	} else if (hejiState.displaySum[16] == -3){
		fiftyNine = C.fiftyNineSymbols[0];
	}
	if (hejiState.displaySum[17] == 3){
		sixtyOne = C.sixtyOneSymbols[6];
	} else if (hejiState.displaySum[17] == 2){
		sixtyOne = C.sixtyOneSymbols[5];
	} else if (hejiState.displaySum[17] == 1){
		sixtyOne = C.sixtyOneSymbols[4];
	} else if (hejiState.displaySum[17] == 0){
		sixtyOne = C.sixtyOneSymbols[3];
	} else if (hejiState.displaySum[17] == -1){
		sixtyOne = C.sixtyOneSymbols[2];
	} else if (hejiState.displaySum[17] == -2){
		sixtyOne = C.sixtyOneSymbols[1];
	} else if (hejiState.displaySum[17] == -3){
		sixtyOne = C.sixtyOneSymbols[0];
	}
	if (hejiState.displaySum[18] == 3){
		sixtySeven = C.sixtySeventhSymbols[6];
	} else if (hejiState.displaySum[18] == 2){
		sixtySeven = C.sixtySeventhSymbols[5];
	} else if (hejiState.displaySum[18] == 1){
		sixtySeven = C.sixtySeventhSymbols[4];
	} else if (hejiState.displaySum[18] == 0){
		sixtySeven = C.sixtySeventhSymbols[3];
	} else if (hejiState.displaySum[18] == -1){
		sixtySeven = C.sixtySeventhSymbols[2];
	} else if (hejiState.displaySum[18] == -2){
		sixtySeven = C.sixtySeventhSymbols[1];
	} else if (hejiState.displaySum[18] == -3){
		sixtySeven = C.sixtySeventhSymbols[0];
	}
	if (hejiState.displaySum[19] == 3){
		seventyOne = C.seventyOneSymbols[6];
	} else if (hejiState.displaySum[19] == 2){
		seventyOne = C.seventyOneSymbols[5];
	} else if (hejiState.displaySum[19] == 1){
		seventyOne = C.seventyOneSymbols[4];
	} else if (hejiState.displaySum[19] == 0){
		seventyOne = C.seventyOneSymbols[3];
	} else if (hejiState.displaySum[19] == -1){
		seventyOne = C.seventyOneSymbols[2];
	} else if (hejiState.displaySum[19] == -2){
		seventyOne = C.seventyOneSymbols[1];
	} else if (hejiState.displaySum[19] == -3){
		seventyOne = C.seventyOneSymbols[0];
	}
	if (hejiState.displaySum[20] == 3){
		seventyThree = C.seventyThreeSymbols[6];
	} else if (hejiState.displaySum[20] == 2){
		seventyThree = C.seventyThreeSymbols[5];
	} else if (hejiState.displaySum[20] == 1){
		seventyThree = C.seventyThreeSymbols[4];
	} else if (hejiState.displaySum[20] == 0){
		seventyThree = C.seventyThreeSymbols[3];
	} else if (hejiState.displaySum[20] == -1){
		seventyThree = C.seventyThreeSymbols[2];
	} else if (hejiState.displaySum[20] == -2){
		seventyThree = C.seventyThreeSymbols[1];
	} else if (hejiState.displaySum[20] == -3){
		seventyThree = C.seventyThreeSymbols[0];
	}
	if (hejiState.displaySum[21] == 3){
		seventyNine = C.seventyNineSymbols[6];
	} else if (hejiState.displaySum[21] == 2){
		seventyNine = C.seventyNineSymbols[5];
	} else if (hejiState.displaySum[21] == 1){
		seventyNine = C.seventyNineSymbols[4];
	} else if (hejiState.displaySum[21] == 0){
		seventyNine = C.seventyNineSymbols[3];
	} else if (hejiState.displaySum[21] == -1){
		seventyNine = C.seventyNineSymbols[2];
	} else if (hejiState.displaySum[21] == -2){
		seventyNine = C.seventyNineSymbols[1];
	} else if (hejiState.displaySum[21] == -3){
		seventyNine = C.seventyNineSymbols[0];
	}
	if (hejiState.displaySum[22] == 3){
		eightyThree = C.eightyThreeSymbols[6];
	} else if (hejiState.displaySum[22] == 2){
		eightyThree = C.eightyThreeSymbols[5];
	} else if (hejiState.displaySum[22] == 1){
		eightyThree = C.eightyThreeSymbols[4];
	} else if (hejiState.displaySum[22] == 0){
		eightyThree = C.eightyThreeSymbols[3];
	} else if (hejiState.displaySum[22] == -1){
		eightyThree = C.eightyThreeSymbols[2];
	} else if (hejiState.displaySum[22] == -2){
		eightyThree = C.eightyThreeSymbols[1];
	} else if (hejiState.displaySum[22] == -3){
		eightyThree = C.eightyThreeSymbols[0];
	}
	if (hejiState.displaySum[23] == 3){
		eightyNine = C.eightyNineSymbols[6];
	} else if (hejiState.displaySum[23] == 2){
		eightyNine = C.eightyNineSymbols[5];
	} else if (hejiState.displaySum[23] == 1){
		eightyNine = C.eightyNineSymbols[4];
	} else if (hejiState.displaySum[23] == 0){
		eightyNine = C.eightyNineSymbols[3];
	} else if (hejiState.displaySum[23] == -1){
		eightyNine = C.eightyNineSymbols[2];
	} else if (hejiState.displaySum[23] == -2){
		eightyNine = C.eightyNineSymbols[1];
	} else if (hejiState.displaySum[23] == -3){
		eightyNine = C.eightyNineSymbols[0];
	}
	var heji2String = fortySeven + fortyThree + fortyOne + thirtySeven + thirtyOne + twentyNine + twentyThree + nineteen + seventeen + tridecimal + undecimal + septimal + pythag + natural;
	var hejiExtensionsPath = eightyNine + eightyThree + seventyNine + seventyThree + seventyOne + sixtySeven + sixtyOne + fiftyNine + fiftyThree;

	// Apply the 'n' to ' ' replacement only to the part displayed with HEJI2 font, if 'natural' contributed 'n'
	let displayedHeji2String = heji2String;
	if (natural === "n") { // Check if 'natural' specifically contributed an 'n'
		displayedHeji2String = displayedHeji2String.replace(/n/g, ' '); // Replace all 'n' with ' ' in this specific context
	}
    
    // For Tetrads, we don't need jQuery based styling changes or column indexing
    // Instead, just return the constructed HTML strings and diatonic note
    const notationString = '<span class="heji-extensions">' + hejiExtensionsPath + '</span>' + '<span class="heji2">' + displayedHeji2String + '</span>';
    
    return { notationHtml: notationString, diatonicNote: outputDiatonic };
}

function updateNotationDisplay(ratioString, frequencies, effectiveBaseFreq) {
    if (!enableNotation || !notationDisplay) return;

    let output = '';
    if (notationType === 'ratio') {
        const baseRatio = effectiveBaseFreq / initialBaseFreq;
        const fractionString = toFraction(baseRatio);
        output = `<span class="notation-ratio-base">${fractionString}</span><br><span class="notation-ratio-chord">${ratioString}</span>`;
        notationDisplay.className = 'notation-display notation-ratio'; // Add class for styling
    } else if (notationType === 'cents') {
        const cents = frequencies.map(freq => 1200 * Math.log2(freq / initialBaseFreq));
        // Display in descending order as per user example
        output = cents.reverse().map(c => Math.round(c)).join('<br>');
        notationDisplay.className = 'notation-display notation-cents'; // Add class for styling
    } else if (notationType === 'heji') {
        const ratioParts = ratioString.split(':').map(Number);
        if (ratioParts.length !== 4 || ratioParts.some(isNaN)) {
            console.error(`Invalid ratio format for HEJI: ${ratioString}`);
            output = 'n/a';
        } else {
            const referenceValue = ratioParts[0]; // The fundamental for these ratios

            if (currentPivotVoiceIndex >= 0 && currentPivotVoiceIndex < ratioParts.length) {
                const numerator = ratioParts[currentPivotVoiceIndex];
                const denominator = referenceValue; // Relative to the fundamental of the chord

                if (denominator === 0) { // Avoid division by zero
                    output = 'n/a (denom is zero)';
                } else {
                    const reduced = U.reduce(numerator, denominator);
                    const numMonzo = U.getArray(reduced[0]);
                    const denMonzo = U.getArray(reduced[1]);
                    const intervalMonzo = U.diffArray(numMonzo, denMonzo);
                    
                    const hejiOutput = _getPC(intervalMonzo);
                    output = `<span class="notation-dev-notename">${hejiOutput.diatonicNote}</span>` + hejiOutput.notationHtml;
                }
            } else {
                output = 'n/a (invalid pivot index)';
            }
        }
        notationDisplay.className = 'notation-display notation-heji'; // Add class for styling
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

function greyscaleColormap(value) {
    // Clamp value between 0 and 1
    value = Math.min(1, Math.max(0, value));

    // High complexity (blue in plasma, value=0) -> #AAAAAA
    // Low complexity (yellow in plasma, value=1) -> #000000
    const startColor = { r: 170/255, g: 170/255, b: 170/255 }; // #AAAAAA
    const endColor = { r: 0, g: 0, b: 0 }; // #000000

    const r = startColor.r + value * (endColor.r - startColor.r);
    const g = startColor.g + value * (endColor.g - startColor.g);
    const b = startColor.b + value * (endColor.b - startColor.b);

    return { r, g, b };
}

function greyscaleBlackColormap(value) {
    value = Math.min(1, Math.max(0, value));
    const startColor = { r: 51/255, g: 51/255, b: 51/255 }; // #333333
    const endColor = { r: 1, g: 1, b: 1 }; // #FFFFFF
    const r = startColor.r + value * (endColor.r - startColor.r);
    const g = startColor.g + value * (endColor.g - startColor.g);
    const b = startColor.b + value * (endColor.b - startColor.b);
    return { r, g, b };
}

const viridis_data = [
    [68,1,84],[68,2,85],[68,3,86],[68,4,87],[69,5,88],[69,6,89],[69,7,90],[69,8,91],[70,9,92],[70,10,93],[70,11,94],[70,12,95],[71,13,96],[71,14,97],[71,15,98],[71,16,99],[72,17,100],[72,18,101],[72,19,102],[72,20,103],[73,21,104],[73,22,105],[73,23,106],[73,24,107],[74,25,108],[74,26,109],[74,27,110],[74,28,111],[75,29,112],[75,30,113],[75,31,114],[75,32,115],[75,33,116],[76,34,117],[76,35,118],[76,36,119],[76,37,120],[76,38,121],[77,39,122],[77,40,123],[77,41,124],[77,42,125],[77,43,126],[77,44,127],[77,45,128],[78,46,129],[78,47,130],[78,48,131],[78,49,132],[78,50,133],[78,51,134],[78,52,135],[78,53,136],[78,54,137],[78,55,138],[78,56,139],[78,57,140],[78,58,141],[78,59,142],[77,60,143],[77,61,144],[77,62,145],[76,63,146],[76,64,146],[75,65,147],[75,66,148],[74,67,148],[74,68,149],[73,69,150],[73,70,150],[72,71,151],[71,72,152],[71,73,152],[70,74,153],[69,75,153],[69,76,154],[68,77,154],[67,78,155],[66,79,155],[66,80,156],[65,81,156],[64,82,156],[63,83,157],[62,84,157],[61,85,157],[60,86,157],[59,87,158],[58,88,158],[57,89,158],[56,90,158],[55,91,158],[54,92,158],[53,93,158],[52,94,158],[51,95,158],[50,96,158],[49,97,158],[48,98,158],[47,99,158],[46,100,158],[45,101,158],[44,102,157],[43,103,157],[42,104,157],[41,105,156],[40,106,156],[39,107,155],[38,108,154],[37,109,154],[36,110,153],[35,111,152],[34,112,151],[33,113,151],[32,114,150],[31,115,149],[31,116,148],[30,117,147],[29,118,146],[29,119,145],[28,120,144],[28,121,143],[27,122,142],[27,123,141],[26,124,140],[26,125,139],[26,126,138],[25,127,137],[25,128,136],[25,129,135],[25,130,134],[25,131,133],[25,132,132],[25,133,131],[25,134,130],[25,135,129],[26,136,128],[26,137,127],[27,138,126],[27,139,125],[28,140,124],[29,141,123],[30,142,122],[31,143,121],[32,144,120],[33,145,119],[34,146,118],[35,147,117],[36,148,116],[37,149,115],[38,150,114],[39,151,113],[40,152,112],[41,153,111],[42,154,110],[43,155,109],[44,156,108],[45,157,107],[46,158,106],[48,159,105],[49,160,104],[50,161,103],[52,162,102],[53,163,101],[55,164,100],[56,165,99],[58,166,98],[59,167,97],[61,168,96],[63,169,95],[64,170,94],[66,171,93],[68,172,92],[70,173,91],[72,174,90],[73,175,89],[75,176,88],[77,177,87],[79,178,86],[81,179,85],[83,180,84],[85,181,83],[87,182,82],[89,183,81],[91,184,80],[93,185,79],[95,186,78],[97,187,77],[99,188,76],[101,189,75],[103,190,74],[105,191,73],[107,192,72],[110,193,71],[112,194,70],[114,195,69],[116,196,68],[118,197,67],[120,198,66],[122,199,65],[124,200,64],[127,201,63],[129,202,62],[131,203,61],[133,204,60],[135,205,59],[137,206,58],[140,207,57],[142,208,56],[144,209,55],[146,210,54],[148,211,53],[151,212,52],[153,213,51],[155,214,50],[157,215,49],[160,216,48],[162,217,47],[164,218,46],[167,219,45],[169,220,44],[171,221,43],[174,222,42],[176,223,41],[178,224,40],[181,225,39],[183,226,38],[185,227,37],[188,228,36],[190,229,35],[192,230,34],[195,231,33],[197,232,32],[200,233,31],[202,234,30],[204,235,29],[207,236,28],[209,237,27],[212,238,26],[214,239,25],[217,240,24],[219,241,23],[222,242,23],[224,243,22],[227,244,21],[229,245,20],[232,246,19],[234,247,18],[237,248,17],[239,249,16],[242,250,15],[244,251,14],[247,252,13],[250,253,12],[252,254,11],[255,255,10]
].map(c => ({ r: c[0] / 255, g: c[1] / 255, b: c[2] / 255 }));

function viridisColormap(value) {
    value = Math.min(1, Math.max(0, value));
    const index = Math.floor(value * (viridis_data.length - 1));
    return viridis_data[index];
}

async function cycleLayoutMode() {
    currentLayoutMode = (currentLayoutMode + 1) % 4;

    switch (currentLayoutMode) {
        case 0: // Plasma
        case 1: // Viridis
        case 2: // Greyscale Black
            scene.background = new THREE.Color(0x000000);
            break;
        case 3: // Greyscale White
            scene.background = new THREE.Color(0xffffff);
            break;
    }

    // We need to re-run updateTetrahedron to apply new colors
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
    
    await updateTetrahedron(
        limitType, limitValue, maxExponent, virtualFundamentalFilter, equaveRatio, complexityMethod, 
        hideUnisonVoices, omitOctaves, baseSize, scalingFactor, 
        enableSize, enableColor, layoutDisplay
    );
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
    
    // Cancellation token to prevent out-of-order updates from mutating the scene
    const updateToken = Symbol('update');
    latestUpdateToken = updateToken;

    // Keep a reference to existing scene children so the previous display remains
    const previousChildren = scene.children.slice();

    // Build new content in a temporary group; don't remove the old scene children until new content is ready
    const newGroup = new THREE.Group();
    const tempSprites = [];

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
        labels_map.set(coords_key, {label: label_item[1], complexity: label_item[2]});
    });


    const label_conversion_factor = 0.066;
    const point_conversion_factor = 2.5;

    const internal_label_base_size = base_size * label_conversion_factor;
    const internal_point_base_size = base_size * point_conversion_factor;

    for (const p of raw_points_data) {
        // Abort if a newer update started
        if (latestUpdateToken !== updateToken) return;
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
        if (currentLayoutMode === 3) { // Greyscale White
            spritePointOpacity = 0.9;
        }

        if (enable_color) {
            const colorScalingFactor = scaling_factor / 2;
            let scaledComplexity = invertedComplexity * colorScalingFactor;
            scaledComplexity = Math.min(1, Math.max(0, scaledComplexity));
            
            let mappedColor;
            switch (currentLayoutMode) {
                case 0: // Plasma
                    mappedColor = plasmaColormap(scaledComplexity);
                    break;
                case 1: // Viridis
                    mappedColor = viridisColormap(scaledComplexity);
                    break;
                case 2: // Greyscale Black
                    mappedColor = greyscaleBlackColormap(scaledComplexity);
                    break;
                case 3: // Greyscale White
                    mappedColor = greyscaleColormap(scaledComplexity);
                    break;
            }
            displayColor.setRGB(mappedColor.r, mappedColor.g, mappedColor.b);
            spriteTextColor = { r: mappedColor.r * 255, g: mappedColor.g * 255, b: mappedColor.b * 255, a:1.0 };
            spritePointColor.setRGB(mappedColor.r, mappedColor.g, mappedColor.b);
        } else {
            if (currentLayoutMode === 3) { // Greyscale White
                displayColor.setRGB(0, 0, 0);
                spriteTextColor = { r: 0, g: 0, b: 0, a: 1.0 };
                spritePointColor.setRGB(0, 0, 0);
            } else {
                displayColor.setRGB(1, 1, 1);
                spriteTextColor = { r: 255, g: 255, b: 255, a: 1.0 };
                spritePointColor.setRGB(1, 1, 1);
            }
        }
        colors.push(displayColor.r, displayColor.g, displayColor.b);

        const coords_key = `${p[0].toFixed(2)},${p[1].toFixed(2)},${p[2].toFixed(2)}`;
        const label_data = labels_map.get(coords_key);
        const label_text = label_data ? label_data.label : undefined;
        const complexity = label_data ? label_data.complexity : undefined;

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
                sprite.userData.complexity = complexity;
                    newGroup.add(sprite);
                    tempSprites.push(sprite);
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
                sprite.userData.complexity = complexity;
            }
                // Check again before adding in case update was cancelled mid-loop
                if (latestUpdateToken !== updateToken) return;
                newGroup.add(sprite);
                tempSprites.push(sprite);
        }
        }

        // If a newer update started while we were generating, abort without modifying scene
        if (latestUpdateToken !== updateToken) return;

        // Add the newly built group to the scene, then remove previous children (swap)
        scene.add(newGroup);
        previousChildren.forEach(child => scene.remove(child));

        // Publish new sprites as the current active sprites
        currentSprites = tempSprites;
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

function downloadCSV(csvString, filename) {
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
}

function simplifyFraction(n, d) {
    const commonDivisor = gcd(n, d);
    return `${n / commonDivisor}/${d / commonDivisor}`;
}

function exportToCSV() {
    if (currentSprites.length === 0) {
        console.warn("No data to export.");
        return;
    }

    const complexityMethodSelect = document.getElementById('complexityMethod');
    const complexityMethod = complexityMethodSelect.options[complexityMethodSelect.selectedIndex].text;

    let data = [];
    const processedRatios = new Set();

    currentSprites.forEach(sprite => {
        if (sprite.userData.ratio && sprite.userData.complexity !== undefined && !processedRatios.has(sprite.userData.ratio)) {
            const chordRatio = sprite.userData.ratio;
            const parts = chordRatio.split(':').map(Number);
            const fundamental = parts[0];

            const notes = parts.map(p => simplifyFraction(p, fundamental)).join(' ');
            const cents = parts.map(p => Math.round(1200 * Math.log2(p / fundamental))).join(' ');

            data.push({
                chord: chordRatio,
                notes: notes,
                cents: cents,
                complexity: sprite.userData.complexity
            });
            processedRatios.add(chordRatio);
        }
    });

    // Sort by complexity, lowest first
    data.sort((a, b) => a.complexity - b.complexity);

    // Generate CSV content
    const header = `Chord,Notes,Cents,${complexityMethod}`;
    const rows = data.map(d => `${d.chord},"${d.notes}","${d.cents}",${d.complexity}`);
    const csvContent = [header, ...rows].join('\n');

    downloadCSV(csvContent, 'tetrads-export.csv');
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

def generate_points(limit_value, equave_ratio, limit_mode=\"odd\", max_exponent=3, complexity_measure=\"Tenney\", hide_unison_voices=False, omit_octaves=False, virtual_fundamental_filter=None):
    points = []
    equave_ratio_float = float(equave_ratio)
    
    valid_numbers = _generate_valid_numbers(limit_value, limit_mode, max_exponent, equave_ratio_float)

    if not valid_numbers: return []

    sorted_valid_numbers = sorted(list(valid_numbers))
    
    primes = []
    if limit_mode == \"prime\":
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
        if limit_mode == \"odd\":
            limit_val_int = int(limit_value)
            for interval in intervals:
                if get_odd_limit(interval) > limit_val_int:
                    valid_combo = False
                    break
        elif limit_mode == \"integer\":
            limit_val_int = int(limit_value)
            for interval in intervals:
                if get_integer_limit(interval) > limit_val_int:
                    valid_combo = False
                    break
        elif limit_mode == \"prime\":
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

def generate_ji_tetra_labels(limit_value, equave_ratio, limit_mode='odd', max_exponent=3, complexity_measure='Tenney', hide_unison_voices=False, omit_octaves=False, virtual_fundamental_filter=None):
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

    // Live-update sliders: Base Size and Measure (scalingFactor)
    const baseSizeSlider = document.getElementById('baseSize');
    const scalingFactorSlider = document.getElementById('scalingFactor');

    if (baseSizeSlider) {
        baseSizeSlider.addEventListener('input', () => {
            // Use the existing update flow tied to the Update button for consistency
            document.getElementById('updateButton').click();
        });
    }

    if (scalingFactorSlider) {
        scalingFactorSlider.addEventListener('input', () => {
            document.getElementById('updateButton').click();
        });
    }

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
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toUpperCase() === 'L') {
            event.preventDefault();
            cycleLayoutMode();
        }
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toUpperCase() === 'S') {
            event.preventDefault();
            exportToCSV();
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
