/**
 * Calculator.js
 * 1:1 conversion of the "Calculator" sheet from
 * "Sagittal Standard JI Notation Calculator Spreadsheet - C.xlsx"
 *
 * ============================================================================
 * SHEET STRUCTURE
 * ============================================================================
 *
 * Row 1  – A1: the "nominals string" (35 Pythagorean positions encoded as text):
 *   "bbFbbCbbGbbDbbAbbEbbBbF bC bG bD bA bE bB F  C  G  D  A  E  B  #F #C #G #D #A #E #B xF xC xG xD xA xE xB "
 *
 * Constant cells (column AD):
 *   AD2 = (log2(3)*7 - 11)*1200          cents per apotome  ≈ 113.685¢
 *   AD3 = Boundaries!N154 + 1e-9         max alteration     ≈  68.573¢
 *   AD4 = AD3 / AD2                      max / apotome      ≈   0.60338
 *
 * Input pitch (column AG):
 *   AG2 = (3^e3)*(5^e5)*(7^e7)*...       monzo multiplier
 *   AG3 = numerator / denominator        ratio multiplier
 *   AG4 = AG2 * AG3                      total multiplier
 *   AG5 = MOD(1200*log2(AG4), 1200)      cents above 1/1
 *
 * 1/1 reference (column AJ):
 *   AJ2 = fifths-above-C of the chosen 1/1 nominal
 *
 * ============================================================================
 * PER-NOMINAL ROWS (rows 6-12, one row per Pythagorean nominal C D E F G A B)
 * ============================================================================
 *
 * Col A  – nominalBaseCents  (octave-adjusted Pythagorean cents of nominal)
 * Col B  – nominalLetter     ("C"/"D"/... or "" if > 2 apotomes from input)
 * Col C  – nominalGlyph      (Unicode notehead glyph)
 * Col D  – sharpFlat         ("x","#","","b","bb")
 * Col E  – sharpFlatKeyShift (+2000/+1000/0/-1000/-2000)
 * Col F  – adjustedNominalCents  (nominal shifted by accidental)
 * Col G  – alteration            (inputCents - adjustedNominal, in cents)
 *
 * Per precision (Medium H-L, High M-Q, Ultra R-V, Extreme W-AA):
 *   fullKey = VLOOKUP_key + sharpFlatKeyShift
 *   key     = VLOOKUP(alteration, BoundariesTable, approximate)
 *   symbol  = VLOOKUP(key, Key sheet)
 *   default = VLOOKUP(abs(key), Commas sheet)   [negated if key<0]
 *   error   = alteration - default   (signed; spreadsheet uses ABS(...), see note below)
 *
 * Col AB – fifthsAbove1over1
 *   = exponent3 + (FIND(accidental+letter+spaces, $A$1) - 46)/3 - ref1over1Fifths
 */

import { BOUNDARIES } from './sagittal-Boundaries.js';
import { getCommaCents } from './sagittal-Commas.js';
import { getKeySymbols } from './sagittal-Key.js';
import { UI_CONFIG, getFifthsAboveC } from './sagittal-UI.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Calculator!AD2: cents per apotome = (log2(3)*7-11)*1200 ≈ 113.685¢ */
export const CENTS_PER_APOTOME = (Math.log2(3) * 7 - 11) * 1200;

/** Calculator!AD3: maximum alteration ≈ 68.573¢ (Boundaries!N154 + 1e-9) */
export const MAX_ALTERATION = (() => {
    const extreme = BOUNDARIES.extreme;
    return extreme[extreme.length - 1].lower + 1e-9;
})();

/** Calculator!AD4: max / apotome ≈ 0.60338 */
export const MAX_OVER_APOTOME = MAX_ALTERATION / CENTS_PER_APOTOME;

/** Calculator!A1: nominals lookup string */
export const NOMINALS_STRING =
    "bbFbbCbbGbbDbbAbbEbbBbF bC bG bD bA bE bB F  C  G  D  A  E  B  #F #C #G #D #A #E #B xF xC xG xD xA xE xB ";

/**
 * The seven natural Pythagorean nominals.
 * baseCents = log2(ratio) * 1200 from C.
 * fifthsFromC = position in the circle of fifths relative to C.
 */
export const NOMINALS = [
    { letter: 'C', baseCents:    0,                          fifthsFromC:  0 },
    { letter: 'D', baseCents: 1200 * Math.log2(9   / 8),    fifthsFromC:  2 },
    { letter: 'E', baseCents: 1200 * Math.log2(81  / 64),   fifthsFromC:  4 },
    { letter: 'F', baseCents: 1200 * Math.log2(4   / 3),    fifthsFromC: -1 },
    { letter: 'G', baseCents: 1200 * Math.log2(3   / 2),    fifthsFromC:  1 },
    { letter: 'A', baseCents: 1200 * Math.log2(27  / 16),   fifthsFromC:  3 },
    { letter: 'B', baseCents: 1200 * Math.log2(243 / 128),  fifthsFromC:  5 },
];

// ============================================================================
// VLOOKUP (approximate match)
// ============================================================================

/**
 * Mirrors VLOOKUP(..., table, 2, TRUE).
 * Finds the largest `lower` <= searchValue and returns its `key`.
 * Returns null if searchValue < first lower bound.
 */
function vlookupApprox(searchValue, table) {
    let match = null;
    for (const row of table) {
        if (row.lower <= searchValue) match = row.key;
        else break;
    }
    return match;
}

// ============================================================================
// PER-NOMINAL ROW COMPUTATION
// ============================================================================

/**
 * Compute all columns for one Pythagorean nominal row.
 * Mirrors Calculator rows 6-12.
 *
 * @param {number} inputCents       AG5: cents of input pitch (0-1200 range)
 * @param {object} nominal          Entry from NOMINALS array
 * @param {number} ref1over1Fifths  AJ2: fifths-above-C of the 1/1 nominal
 * @param {number} exponent3        UI!C8: exponent of prime 3
 */
function computeNominalRow(inputCents, nominal, ref1over1Fifths, exponent3) {
    const A   = CENTS_PER_APOTOME;
    const AD4 = MAX_OVER_APOTOME;

    // Col A: nominalBaseCents – place nominal in the octave closest to inputCents
    let baseCents = nominal.baseCents % 1200;
    if (Math.abs(inputCents - (baseCents + 1200)) < Math.abs(inputCents - baseCents)) {
        baseCents += 1200;
    }
    const colA = baseCents;

    // Col B: nominalLetter – blank if more than 2 apotomes away
    const inRange = Math.abs(inputCents - colA) <= 2.000001 * A;
    const colB    = inRange ? nominal.letter : "";

    // Col C: nominalGlyph (simplified – not needed for numerical output)
    const colC = colB === "" ? "" : nominal.letter;

    // Col D: sharpFlat
    let colD = "";
    if (colB !== "") {
        const d = inputCents - colA;
        if      (d  >  A * (1 + AD4)) colD = "x";
        else if (d  >  A * AD4)       colD = "#";
        else if (-d >  A * (1 + AD4)) colD = "bb";
        else if (-d >  A * AD4)       colD = "b";
    }

    // Col E: sharpFlatKeyShift
    const colE = { "x": 2000, "#": 1000, "": 0, "b": -1000, "bb": -2000 }[colD] ?? 0;

    // Col F: adjustedNominalCents
    let colF = "";
    if (colB !== "") {
        const d = inputCents - colA;
        if      (d  >  A * (1 + AD4)) colF = colA + A * 2;
        else if (d  >  A * AD4)       colF = colA + A;
        else if (-d >  A * (1 + AD4)) colF = colA - A * 2;
        else if (-d >  A * AD4)       colF = colA - A;
        else                          colF = colA;
    }

    // Col G: alteration
    let colG = "";
    if (colB !== "" && colF !== "") {
        const raw = inputCents - colF;
        colG = Math.round(raw * 1000) === 0 ? 0 : raw;
    }

    // Per-precision columns (H-L, M-Q, R-V, W-AA)
    const precisions = [
        { id: 'medium',  table: BOUNDARIES.medium  },
        { id: 'high',    table: BOUNDARIES.high    },
        { id: 'ultra',   table: BOUNDARIES.ultra   },
        { id: 'extreme', table: BOUNDARIES.extreme },
    ];

    const precision = {};
    for (const prec of precisions) {
        let key = "";
        let fullKey = 0;
        let defaultValue = "";
        let error = "";

        if (colG !== "") {
            if (Math.round(colG * 1000) === 0) {
                key = 0;
            } else if (colG > 0) {
                key = vlookupApprox(colG, prec.table);
            } else {
                const pos = vlookupApprox(-colG, prec.table);
                key = (pos !== null) ? -pos : null;
            }

            if (key !== null && key !== "") {
                fullKey      = key + colE;
                defaultValue = getCommaCents(key);
                // NB: deviates from the spreadsheet's ABS(alteration - default) — sign is
                // kept so the UI can show direction (true pitch sharp/flat of the notated
                // symbol), the same convention used by the EDO cent-deviation display.
                error        = colB === "" ? "" :
                               colG === "" ? 0  :
                               defaultValue === "" ? colG :
                               colG - defaultValue;
            }
        }

        precision[prec.id] = { fullKey, key, defaultValue, error };
    }

    // Col AB: fifths above 1/1
    let colAB = "";
    if (colB !== "") {
        const token   = (colD + colB + "   ").slice(0, 3);
        const idx     = NOMINALS_STRING.indexOf(token);
        if (idx !== -1) {
            // FIND is 1-based in Excel, so position = idx+1; formula: (pos-46)/3
            const fifthsFromC = (idx + 1 - 46) / 3;
            colAB = exponent3 + fifthsFromC - ref1over1Fifths;
        }
    }

    return {
        nominalBaseCents:     colA,   // Col A
        nominalLetter:        colB,   // Col B
        nominalGlyph:         colC,   // Col C
        sharpFlat:            colD,   // Col D
        sharpFlatKeyShift:    colE,   // Col E
        adjustedNominalCents: colF,   // Col F
        alteration:           colG,   // Col G
        precision,                    // Cols H-AA (per precision)
        fifthsAbove1over1:    colAB,  // Col AB
    };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Run the full sagittal calculation.
 *
 * @param {object} input
 *   .exponents    {Object}  e.g. { 3: 0, 5: 1, 7: 0, ... }
 *   .numerator    {number}  ratio numerator   (default 1)
 *   .denominator  {number}  ratio denominator (default 1)
 *   .nominal      {string}  1/1 nominal, e.g. "C", "#G", "bD"
 *
 * @returns {{ centsPitch, nominalRows, inRangeRows }}
 */
export function calculate(input = {}) {
    const {
        exponents   = {},
        numerator   = 1,
        denominator = 1,
        nominal     = "C",
    } = input;

    // Build full exponent map (all primes default 0)
    const fullExponents = {};
    for (const p of UI_CONFIG.inputPrimes) fullExponents[p] = 0;
    Object.assign(fullExponents, exponents);

    // AG2: monzo multiplier = product of prime^exponent
    const monzoMult = Object.entries(fullExponents).reduce(
        (acc, [p, e]) => acc * Math.pow(Number(p), Number(e)), 1
    );

    // AG3: ratio multiplier
    const ratioMult = numerator / denominator;

    // AG4: total multiplier; AG5: cents (mod 1200)
    const totalMult  = monzoMult * ratioMult;
    const centsPitch = ((1200 * Math.log2(totalMult)) % 1200 + 1200) % 1200;

    // Exponent of prime 3 (UI!C8)
    const exponent3 = fullExponents[3] ?? 0;

    // AJ2: fifths-above-C of chosen 1/1 nominal
    // Excel: =UI!$C$8+(FIND(nominal...)-46)/3 — the exponent-of-3 term is required;
    // it cancels the same term added back in colAB (fifthsAbove1over1) below.
    const ref1over1Fifths = exponent3 + (getFifthsAboveC(nominal, NOMINALS_STRING) ?? 0);

    // Compute one row per natural nominal
    const nominalRows  = NOMINALS.map(nom =>
        computeNominalRow(centsPitch, nom, ref1over1Fifths, exponent3)
    );
    const inRangeRows  = nominalRows.filter(r => r.nominalLetter !== "");

    return { centsPitch, nominalRows, inRangeRows };
}

/**
 * Convenience wrapper: return up to 3 enharmonic variants for a given
 * precision level, matching the UI sheet output (rows 9-11).
 *
 * @param {object} input      same as calculate()
 * @param {string} precision  'medium' | 'high' | 'ultra' | 'extreme'
 * @returns {object[]}  up to 3 variant objects
 */
export function getEnharmonicVariants(input, precision = 'medium') {
    const { inRangeRows } = calculate(input);

    return inRangeRows.map(row => {
        const pr   = row.precision[precision];
        const syms = getKeySymbols(pr.fullKey);
        return {
            evo_ascii:         syms.evo_ascii,
            revo_ascii:        syms.revo_ascii,
            evo_unicode:       syms.evo_unicode,
            revo_unicode:      syms.revo_unicode,
            nominalLetter:     row.nominalLetter,
            sharpFlat:         row.sharpFlat,
            alteration:        row.alteration,
            fullKey:           pr.fullKey,
            key:               pr.key,
            defaultValue:      pr.defaultValue,
            error:             pr.error,
            fifthsAbove1over1: row.fifthsAbove1over1,
        };
    });
}

export default { calculate, getEnharmonicVariants };
