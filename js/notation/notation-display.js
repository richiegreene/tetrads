
import * as C from '../constants.js'; // HEJI constants
import { state as hejiState } from '../state.js'; // HEJI state
import * as U from '../utils/helpers.js'; // HEJI utilities

import {
    enableNotation, notationType, notationDisplay,
    initialBaseFreq
} from '../globals.js';

// Helper functions for _getPC (minimal UI interaction, mainly fixed defaults for Tetrads context)
export function getRefOctave() { return 9; } // Default to C4 (index 9) for octave
export function getRefNote() { return 1; } // Default to C (index 1) for note
export function getRefAccidental() { return 1; } // Default to natural (index 1) for accidental

// --- NOTATION FUNCTIONS ---
export function parseMidiNoteOutput(midiNoteString) {
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
export function _getPC(monzo) {
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

    // hejiState.jiCents and hejiState.cents_toRef are calculated by the new functions.
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
		sixtySeven = C.sixtySevenSymbols[1];
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
    
    return { notationHtml: notationString, diatonicNote: outputDiatonic, refMidiNoteOutput: refMidiNoteOutput }; // also return refMidiNoteOutput
}

// Ported and adapted prepareCentsCalculationData function from Notation Dev
export function prepareCentsCalculationData(inputMonzo) {
    hejiState.centsSum = inputMonzo; 
    var centsOtonalArray = hejiState.centsSum.map(value => {
        return value < 0 ? 0 : value;
    });
    var centsUtonalArray = hejiState.centsSum.map(value => {
        return value < 0 ? Math.abs(value) : 0;
    });
    hejiState.centsNumValue = U.getValue(centsOtonalArray);
    hejiState.centsDenValue = U.getValue(centsUtonalArray);
}

// Ported and adapted calculateJiCents function from Notation Dev
export function calculateJiCents(){
    // hejiState.displayNumValue and hejiState.displayDenValue must be set externally
    // These values are derived from the same original ratio, so displayNum/DenValue can be used here.
    hejiState.jiCents = 1200 * Math.log2(hejiState.centsNumValue / hejiState.centsDenValue /
        (hejiState.kammerTon / (hejiState.freq1to1 / Math.pow(2, (C.frequencyOctave[getRefOctave()] / 12)) /
        Math.pow(2, (C.frequencyNote[getRefNote()] / 12)) /
        Math.pow(2, (C.frequencyAccidental[getRefAccidental()] / 12)))));
}

// Ported and adapted getCentDeviation function from Notation Dev
export function getCentDeviation(){
    var et2 = (hejiState.centsSum[0] * 12);
    var et3 = (hejiState.centsSum[1] * 19);
    var et5 = (hejiState.centsSum[2] * 28);
    var et7 = (hejiState.centsSum[3] * 34);
    var et11 = (hejiState.centsSum[4] * 41);
    var et13 = (hejiState.centsSum[5] * 45);
    var et17 = (hejiState.centsSum[6] * 49);
    var et19 = (hejiState.centsSum[7] * 51);
    var et23 = (hejiState.centsSum[8] * 54);
    var et29 = (hejiState.centsSum[9] * 58);
    var et31 = (hejiState.centsSum[10] * 60);
    var et37 = (hejiState.centsSum[11] * 62);
    var et41 = (hejiState.centsSum[12] * 64);
    var et43 = (hejiState.centsSum[13] * 65);
    var et47 = (hejiState.centsSum[14] * 67);
    var etSemiTones = (et2 + et3 + et5 + et7 + et11 + et13 + et17 + et19 + et23 + et29 + et31 + et37 + et41 + et43 + et47);
    var etCents = etSemiTones * 100.0;
    hejiState.centDeviation = U.mod((hejiState.jiCents - etCents),100);
    if (hejiState.centDeviation > 50){
        hejiState.centDeviation = -(100.0 - hejiState.centDeviation);
    }

    let centsText;
    if (Math.round(hejiState.centDeviation * Math.pow(10, hejiState.precision)) / Math.pow(10, hejiState.precision) === 0) {
        centsText = "";
    } else if (hejiState.centDeviation > 0) {
        centsText = "+" + hejiState.centDeviation.toFixed(hejiState.precision);
    } else {
        centsText = hejiState.centDeviation.toFixed(hejiState.precision);
    }
    
    // hejiState.cents_toRef calculation needed for Notation Dev's _getBend.
    // In Tetrads, we need this for the overall output formatting.
    hejiState.cents_toRef = 1200 * Math.log2(hejiState.centsNumValue / hejiState.centsDenValue);
    // hejiState.cents_toRef is not normalized here, but can be if needed.

    return centsText; // Return the formatted cents deviation string
}


/**
 * Converts a floating-point number to its most accurate reduced fractional representation
 * within a given maximum denominator.
 * @param {number} value The floating-point number to convert.
 * @param {number} maxDenominator The maximum denominator to consider for the fraction.
 * @returns {{numerator: number, denominator: number}} An object containing the numerator and denominator.
 */
export function floatToReducedFraction(value, maxDenominator = 10000) {
    if (value === 0) return { numerator: 0, denominator: 1 };
    
    // Handle negative values
    const isNegative = value < 0;
    value = Math.abs(value);

    let bestNumerator = 1;
    let bestDenominator = 1;
    let minDiff = Math.abs(value - (bestNumerator / bestDenominator));

    for (let d = 1; d <= maxDenominator; d++) {
        const n = Math.round(value * d);
        const currentDiff = Math.abs(value - (n / d));

        // If this fraction is more accurate
        if (currentDiff < minDiff) {
            minDiff = currentDiff;
            bestNumerator = n;
            bestDenominator = d;
        }
        // If we found an exact match
        if (currentDiff === 0) break;
    }
    
    // Reduce the fraction using the utility function
    const reduced = U.reduce(bestNumerator, bestDenominator);
    
    return { 
        numerator: isNegative ? -reduced[0] : reduced[0], 
        denominator: reduced[1] 
    };
}

export function updateNotationDisplay(ratioString, frequencies, effectiveBaseFreq) {
    if (!enableNotation || !notationDisplay) return;

    let output = '';
    if (notationType === 'ratio') {
        const baseRatio = effectiveBaseFreq / initialBaseFreq;
        const fractionString = floatToReducedFraction(baseRatio).numerator + '/' + floatToReducedFraction(baseRatio).denominator;
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
            let fullHejiOutput = '';
            const referenceValue = ratioParts[0]; // The fundamental for these ratios
            
            // Calculate baseRatioMonzo
            const baseRatio = effectiveBaseFreq / initialBaseFreq;
            const baseRatioFraction = floatToReducedFraction(baseRatio);
            const baseRatioNumMonzo = U.getArray(baseRatioFraction.numerator);
            const baseRatioDenMonzo = U.getArray(baseRatioFraction.denominator);
            const baseRatioMonzo = U.diffArray(baseRatioNumMonzo, baseRatioDenMonzo);

            for (let i = 0; i < ratioParts.length; i++) {
                const numerator = ratioParts[i];
                const denominator = referenceValue;

                if (denominator === 0) {
                    fullHejiOutput += 'n/a (denom is zero) ';
                } else {
                    const reduced = U.reduce(numerator, denominator);
                    const numMonzo = U.getArray(reduced[0]);
                    const denMonzo = U.getArray(reduced[1]);
                    let intervalMonzo = U.diffArray(numMonzo, denMonzo);
                    
                    // Apply baseRatioMonzo
                    intervalMonzo = U.sumArray(intervalMonzo, baseRatioMonzo);
                    
                    // Temporarily set hejiState.displayNumValue and hejiState.displayDenValue for calculateJiCents
                    hejiState.displayNumValue = reduced[0];
                    hejiState.displayDenValue = reduced[1];

                    prepareCentsCalculationData(intervalMonzo);
                    calculateJiCents();
                    const hejiOutput = _getPC(intervalMonzo);
                    // The Notation Dev's HEJI output does not display cents deviation by default, so we won't add it here for consistency.

                    fullHejiOutput += `<span class="notation-dev-notename-inline">${hejiOutput.diatonicNote}</span>` + hejiOutput.notationHtml;
                    if (i < ratioParts.length - 1) {
                        fullHejiOutput += '&nbsp;'; // Add a non-breaking space between notes
                    }
                }
            }
            output = fullHejiOutput;
        }
        notationDisplay.className = 'notation-display notation-heji'; // Add class for styling
    } else if (notationType === 'deviation') {
        const ratioParts = ratioString.split(':').map(Number);
        if (ratioParts.length !== 4 || ratioParts.some(isNaN)) {
            console.error(`Invalid ratio format for Deviation: ${ratioString}`);
            output = 'n/a';
        } else {
            let fullDeviationOutput = '';
            const referenceValue = ratioParts[0]; // The fundamental for these ratios

            // Calculate baseRatioMonzo (same logic as heji)
            const baseRatio = effectiveBaseFreq / initialBaseFreq;
            const baseRatioFraction = floatToReducedFraction(baseRatio);
            const baseRatioNumMonzo = U.getArray(baseRatioFraction.numerator);
            const baseRatioDenMonzo = U.getArray(baseRatioFraction.denominator);
            const baseRatioMonzo = U.diffArray(baseRatioNumMonzo, baseRatioDenMonzo);

            for (let i = 0; i < ratioParts.length; i++) {
                const numerator = ratioParts[i];
                const denominator = referenceValue;

                if (denominator === 0) {
                    fullDeviationOutput += 'n/a (denom is zero) ';
                } else {
                    const reduced = U.reduce(numerator, denominator);
                    const numMonzo = U.getArray(reduced[0]);
                    const denMonzo = U.getArray(reduced[1]);
                    let intervalMonzo = U.diffArray(numMonzo, denMonzo);
                    
                    // Apply baseRatioMonzo
                    intervalMonzo = U.sumArray(intervalMonzo, baseRatioMonzo);
                    
                    // Temporarily set hejiState.displayNumValue and hejiState.displayDenValue for calculateJiCents
                    hejiState.displayNumValue = reduced[0];
                    hejiState.displayDenValue = reduced[1];

                    prepareCentsCalculationData(intervalMonzo);
                    calculateJiCents();
                    const hejiOutput = _getPC(intervalMonzo);
                    const centsDeviation = getCentDeviation();

                    // Format deviation output
                    const midiNote = parseMidiNoteOutput(hejiOutput.refMidiNoteOutput);
                    const noteLetter = midiNote.letter;
                    const accidental = midiNote.accidental === 'j' ? '' : midiNote.accidental; // 'j' means natural, show as empty string
                    
                    fullDeviationOutput += `<span class="notation-dev-notename-inline">${noteLetter}</span>` + 
                                           `<span class="midiAccidental-heji-font">${accidental}</span>` + 
                                           `<span class="deviation-cents-monospace">${centsDeviation}</span>`; // Removed 'c'
                    
                    if (i < ratioParts.length - 1) {
                        fullDeviationOutput += '&nbsp;&nbsp;'; // Use non-breaking spaces for horizontal layout
                    }
                }
            }
            output = fullDeviationOutput;
        }
        notationDisplay.className = 'notation-display notation-deviation'; // Add class for styling
    }

    notationDisplay.innerHTML = output;
    notationDisplay.style.display = 'block';
}
