// Ups and Downs rendering info based on EDO described in Settings panel.
function mod(n, m) {
    return ((n % m) + m) % m;
}

class Note {
    constructor() {
        this.sharps = 0;
        this.s_ups = 0;
        this.s_lifts = 0;
        this.s_nom = 0;
        this.flats = 0;
        this.f_ups = 0;
        this.f_lifts = 0;
        this.f_nom = 0;
    }
}

function fifth(edo) {
    return Math.round(Math.log(1.5) / Math.log(2) * edo);
}

function majsec(edo, p5) {
    return (p5 * 2) - edo;
}

function apotome(edo, p5) {
    if ((edo % 7 === 0 || edo % 5 === 0) && edo < 36) {
        return edo;
    }
    return (p5 * 7) - (edo * 4);
}

function updown(edo, p5) {
    if (edo < 66) {
        return 1;
    }
    if (edo === 129) {
        return 3;
    }
    const y3 = Math.round(Math.log(1.25) / Math.log(2) * edo);
    const sc = (p5 * 4) - (edo * 2) - y3;
    return 1;
}

function verysharp(edo, p5) {
    return p5 / edo > 0.6 || (edo < 35 && edo % 5 === 0);
}

function halfacc(a1) {
    return a1 % 2 === 0;
}

function basicnotes(notes, edo, p5, p2, penta, refDiatonicOffset) {
    notes[0].s_nom = mod(0 + refDiatonicOffset, 7);
    notes[p2].s_nom = mod(1 + refDiatonicOffset, 7);
    notes[edo - p5].s_nom = mod(3 + refDiatonicOffset, 7);
    notes[p5].s_nom = mod(4 + refDiatonicOffset, 7);
    notes[p5 + p2].s_nom = mod(5 + refDiatonicOffset, 7);

    notes[0].f_nom = mod(0 + refDiatonicOffset, 7);
    notes[p2].f_nom = mod(1 + refDiatonicOffset, 7);
    notes[edo - p5].f_nom = mod(3 + refDiatonicOffset, 7);
    notes[p5].f_nom = mod(4 + refDiatonicOffset, 7);
    notes[p5 + p2].f_nom = mod(5 + refDiatonicOffset, 7);

    if (!penta) {
        notes[2 * p2].s_nom = mod(2 + refDiatonicOffset, 7);
        notes[p5 + (2 * p2)].s_nom = mod(6 + refDiatonicOffset, 7);
        notes[2 * p2].f_nom = mod(2 + refDiatonicOffset, 7);
        notes[p5 + (2 * p2)].f_nom = mod(6 + refDiatonicOffset, 7);
    }
}

function trround(x) {
    if (x - Math.floor(x) === 0.5) {
        return x > 0 ? Math.floor(x) : Math.ceil(x);
    }
    return Math.round(x);
}

function setsharpcounts(x, ap, ud) {
    let apc = x / ap;
    let ra = trround(apc);
    let udc = ((ra * ap) - x) / ud;
    let ru = trround(udc);
    let ldc = (ru * ud) - ((ra * ap) - x);
    ru *= -1;
    return { ra: ra, ru: ru, ldc: ldc };
}

function setsharpnotes(note, nom, r_ap, r_ud, ldcount) {
    note.s_nom = nom;
    note.sharps = r_ap;
    note.s_ups = r_ud;
    note.s_lifts = ldcount;
}

function sharpnotes(notes, edo, p5, p2, ap, ud, penta) {
    for (let i = 1; i < p2; i++) {
        const counts = setsharpcounts(i, ap, ud);
        setsharpnotes(notes[i], 0, counts.ra, counts.ru, counts.ldc);
        setsharpnotes(notes[edo - p5 + i], 3, counts.ra, counts.ru, counts.ldc);
        setsharpnotes(notes[p5 + i], 4, counts.ra, counts.ru, counts.ldc);
    }
    if (penta) {
        for (let i = 1; i < (edo - p5) - p2; i++) {
            const counts = setsharpcounts(i, ap, ud);
            setsharpnotes(notes[p2 + i], 1, counts.ra, counts.ru, counts.ldc);
            setsharpnotes(notes[p5 + p2 + i], 5, counts.ra, counts.ru, counts.ldc);
        }
    } else {
        for (let i = 1; i < p2; i++) {
            const counts = setsharpcounts(i, ap, ud);
            setsharpnotes(notes[p2 + i], 1, counts.ra, counts.ru, counts.ldc);
            setsharpnotes(notes[p5 + p2 + i], 5, counts.ra, counts.ru, counts.ldc);
        }
        for (let i = 1; i < (edo - p5) - (p2 * 2); i++) {
            const counts = setsharpcounts(i, ap, ud);
            setsharpnotes(notes[(p2 * 2) + i], 2, counts.ra, counts.ru, counts.ldc);
            setsharpnotes(notes[p5 + (p2 * 2) + i], 6, counts.ra, counts.ru, counts.ldc);
        }
    }
}

function setflatcounts(x, ap, ud) {
    let apc = x / ap;
    let ra = trround(apc);
    let udc = ((ra * ap) - x) / ud;
    let ru = trround(udc);
    let ldc = ((ra * ap) - x) - (ru * ud);
    return { ra: ra, ru: ru, ldc: ldc };
}

function setflatnotes(note, nom, r_ap, r_ud, ldcount) {
    note.f_nom = nom;
    note.flats = r_ap;
    note.f_ups = r_ud;
    note.f_lifts = ldcount;
}

function flatnotes(notes, edo, p5, p2, ap, ud, penta) {
    for (let i = 1; i < p2; i++) {
        const counts = setflatcounts(i, ap, ud);
        setflatnotes(notes[p2 - i], 1, counts.ra, counts.ru, counts.ldc);
        setflatnotes(notes[p5 - i], 4, counts.ra, counts.ru, counts.ldc);
        setflatnotes(notes[p5 + p2 - i], 5, counts.ra, counts.ru, counts.ldc);
    }
    if (penta) {
        for (let i = 1; i < (edo - p5) - p2; i++) {
            const counts = setflatcounts(i, ap, ud);
            setflatnotes(notes[edo - i], 0, counts.ra, counts.ru, counts.ldc);
            setflatnotes(notes[edo - p5 - i], 3, counts.ra, counts.ru, counts.ldc);
        }
    } else {
        for (let i = 1; i < (edo - p5) - (p2 * 2); i++) {
            const counts = setflatcounts(i, ap, ud);
            setflatnotes(notes[edo - i], 0, counts.ra, counts.ru, counts.ldc);
            setflatnotes(notes[edo - p5 - i], 3, counts.ra, counts.ru, counts.ldc);
        }
        for (let i = 1; i < p2; i++) {
            const counts = setflatcounts(i, ap, ud);
            setflatnotes(notes[(p2 * 2) - i], 2, counts.ra, counts.ru, counts.ldc);
            setflatnotes(notes[p5 + (p2 * 2) - i], 6, counts.ra, counts.ru, counts.ldc);
        }
    }
}

function printnom(nom) {
    const noteNames = ["F", "C", "G", "D", "A", "E", "B"]; 
    // Internal C-centric nominal 
    const cCentricNominalToFcentricIndex = {
        0: 1, // C (C-centric 0) is at index 1 in F-centric noteNames
        1: 3, // D
        2: 5, // E
        3: 0, // F
        4: 2, // G
        5: 4, // A
        6: 6  // B
    };
    const fCentricIndex = cCentricNominalToFcentricIndex[mod(nom, 7)];
    return noteNames[fCentricIndex];
}

function printupdown(ups) {
    if (ups === -2) {
        return "#";
    } else if (ups === 2) {
        return "ww"; // "ww" placeholder for double ups single character
    }
    return "v".repeat(Math.max(0, -ups)) + "w".repeat(Math.max(0, ups));
}

function printliftdrop(lifts) {
    return "\\".repeat(Math.max(0, -lifts)) + "/".repeat(Math.max(0, lifts));
}

function printsharp(sharps, half) {
    let result = "";
    if (half) {
        if (sharps % 2 !== 0) { // e.g., 1, 3, 5 sharps
            if (sharps === 3) { // Special case for three half-sharps: t#
                result += "g"; // t# -> g
                sharps -= 3;
            } else {
                result += "h"; // t -> h
                sharps -= 1;
            }
        }
        // Handle remaining full sharps (2 or 4) or cases where initial sharps were even
        if (sharps > 0) {
            // Priority for double sharp first (x -> d)
            while (sharps >= 4) {
                result += "d"; // x -> d
                sharps -= 4;
            }
            // Then for single sharp (# -> c)
            if (sharps >= 2) {
                result += "c"; // # -> c
                sharps -= 2;
            }
        }
    } else { // full sharps
        while (sharps >= 2) {
            result += "d"; // x -> d (double sharp)
            sharps -= 2;
        }
        if (sharps === 1) {
            result += "c"; // # -> c (single sharp)
        }
    }
    return result;
}

function printflat(flats, half) {
    let result = "";
    if (half) {
        if (flats % 2 !== 0) { // e.g., 1, 3, 5 flats
            if (flats === 3) { // Special case for three half-flats: db
                result += "ea"; // db -> ea
                flats -= 3;
            } else {
                result += "e"; // d -> e
                flats -= 1;
            }
        }
        // Handle remaining full flats (2 or 4) or cases where initial flats were even
        if (flats > 0) {
            // Priority for double flat first (bb -> )
            while (flats >= 4) {
                result += "aa"; // bb -> aa
                flats -= 4;
            }
            // Then for single flat (b -> a)
            if (flats >= 2) {
                result += "a"; // b -> a
                flats -= 2;
            }
        }
    } else { // full flats
        while (flats >= 2) {
            result += "aa"; // bb -> aa (double flat)
            flats -= 2;
        }
        if (flats === 1) {
            result += "a"; // b -> a (single flat)
        }
    }
    return result;
}

function printnote(note, halves, showEnharmonics, hejiBaseNote) {
    let sharp_name;
    let flat_name;

    sharp_name = (
        printliftdrop(note.s_lifts) +
        printupdown(note.s_ups) +
        printnom(note.s_nom) +
        printsharp(note.sharps, halves)
    );
    
    flat_name = (
        printliftdrop(note.f_lifts) +
        printupdown(note.f_ups) +
        printnom(note.f_nom) +
        printflat(note.flats, halves)
    );

    if (showEnharmonics) {
        if (note.s_nom === note.f_nom) {
            if (sharp_name.length <= flat_name.length) {
                return sharp_name;
            } else {
                return flat_name;
            }
        } else {
            return `${sharp_name},${flat_name}`;
        }
    } else { // HEJI-like spelling without enharmonic equivalents
        // Calculate total "accidental units" for comparison
        const totalSharpAccidentals = Math.abs(note.sharps) + Math.abs(note.s_ups) + Math.abs(note.s_lifts);
        const totalFlatAccidentals = Math.abs(note.flats) + Math.abs(note.f_ups) + Math.abs(note.f_lifts);

        // Rule 1: If hejiBaseNote is provided, use it as the primary guide for nominal preference
        if (hejiBaseNote) {
            const sharpNominal = printnom(note.s_nom);
            const flatNominal = printnom(note.f_nom);

            if (sharpNominal === hejiBaseNote) {
                return sharp_name;
            } else if (flatNominal === hejiBaseNote) {
                return flat_name;
            }
        }
        
        // Rule 2: Prioritize natural notes (if hejiBaseNote didn't yield a match)
        if (totalSharpAccidentals === 0 && totalFlatAccidentals !== 0) {
            return sharp_name; // Sharp spelling is natural
        }
        if (totalFlatAccidentals === 0 && totalSharpAccidentals !== 0) {
            return flat_name; // Flat spelling is natural
        }
        if (totalSharpAccidentals === 0 && totalFlatAccidentals === 0) {
            return sharp_name; // Both are natural, return one.
        }

        // Rule 3: Prefer fewer accidentals (if natural notes didn't yield a match)
        if (totalSharpAccidentals < totalFlatAccidentals) {
            return sharp_name;
        }
        if (totalFlatAccidentals < totalSharpAccidentals) {
            return flat_name;
        }

        // Default tie-breaker: if sharp_name is shorter or equal length
        if (sharp_name.length <= flat_name.length) {
            return sharp_name;
        } else {
            return flat_name;
        }
    }
}

export function calculateEdoNotation(n, m, refpc, ref12acc, showEnharmonics = true, hejiBaseNote = "", excludeHalves = false) {
    if (m < 7 && m !== 5) {
        return "n/a";
    }

    const p5 = fifth(m);
    const p2 = majsec(m, p5);
    let a1 = apotome(m, p5);
    const ud = updown(m, p5);
    const penta = verysharp(m, p5);
    let halves = halfacc(a1);

    if (excludeHalves) {
        halves = false;
    }

    if (halves) {
        a1 = Math.floor(a1 / 2); // Integer division
    }

    const notes = Array.from({ length: m }, () => new Note());

    // Generate the EDO scale starting with C at step 0 (C-centric)
    basicnotes(notes, m, p5, p2, penta, 0);
    sharpnotes(notes, m, p5, p2, a1, ud, penta);
    flatnotes(notes, m, p5, p2, a1, ud, penta);

    // Number of fifths from C to the reference note
    const fifths = (refpc - 1) - 7 * ref12acc;
    // Step of the reference note relative to C
    const stepRef_rel_C = fifths * p5;

    // Shift the query step n to be relative to C
    n = mod(n + stepRef_rel_C, m);

    return printnote(notes[n], halves, showEnharmonics, hejiBaseNote);
}
