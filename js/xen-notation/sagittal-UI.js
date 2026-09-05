/**
 * UI.js
 * conversion of the "UI" sheet from
 * "Sagittal Standard JI Notation Calculator Spreadsheet - C.xlsx"
 *
 * The UI sheet is the user-facing entry point of the spreadsheet. It:
 *   1. Accepts prime-factor exponents (row 8, cols C–S, primes 3–61).
 *   2. Accepts a ratio directly via Numerator (C10/C11) and Denominator (C11).
 *   3. Accepts a Pythagorean nominal for the 1/1 (C13).
 *   4. Displays results per precision level (Medium/High/Ultra/Extreme).
 *
 * Precision level summary (rows 2–6):
 *   Medium  – Athenian   (17-limit, ~5.41¢ resolution, no diacritics)
 *   High    – Promethean (23-limit, ~2.42¢ resolution, no diacritics)
 *   Ultra   – Herculean  (23-limit, ~1.96¢ resolution, accents)
 *   Extreme – Olympian   (47-limit, ~0.49¢ resolution, accents & breves)
 *
 * Input cells (row 8, col C onward = primes 3, 5, 7, 11, 13, 17, 19, 23, ...):
 *   C8 = exponent of 3
 *   D8 = exponent of 5
 *   E8 = exponent of 7
 *   F8 = exponent of 11
 *   G8 = exponent of 13
 *   H8 = exponent of 17
 *   I8 = exponent of 19
 *   J8 = exponent of 23
 *   K8 = exponent of 29
 *   L8 = exponent of 31
 *   M8 = exponent of 37
 *   N8 = exponent of 41
 *   O8 = exponent of 43
 *   P8 = exponent of 47
 *   Q8 = exponent of 53
 *   R8 = exponent of 59
 *   S8 = exponent of 61
 *
 * Ratio input (rows 10–11):
 *   C10 = numerator    (default 5)
 *   C11 = denominator  (default 4)
 *
 * 1/1 nominal (row 13): C13 = Pythagorean nominal string, e.g. "C", "#G", "bD"
 *
 * Output display (rows 9–20, cols W onwards):
 *   Row 9  = first enharmonic variant
 *   Row 10 = second enharmonic variant
 *   Row 11 = third enharmonic variant
 *
 *   Each precision occupies a group of columns:
 *     Medium  (Athenian):   W=Evo ASCII, X=Revo ASCII, Y=Evo Unicode, Z=Revo Unicode, AA=Fifths, AB=Error
 *     High    (Promethean): AD=Evo ASCII, AE=Revo ASCII, AF=Evo Unicode, AG=Revo Unicode, AH=Fifths, AI=Error
 *     Ultra   (Herculean):  AK=Evo ASCII, AL=Revo ASCII, AM=Evo Unicode, AN=Revo Unicode, AO=Fifths, AP=Error
 *     Extreme (Olympian):   AR=Evo ASCII, AS=Revo ASCII, AT=Evo Unicode, AU=Revo Unicode, AV=Fifths, AW=Error
 *
 * The output cells concatenate:
 *   VLOOKUP(fullKey, Key!$A$2:$E$982, col, FALSE)  +  nominal letter (B col of Calculator)
 */

export const UI_CONFIG = {
    title: "Sagittal Standard Just Intonation Notation Calculator",

    precisionLevels: [
        {
            id:          "medium",
            name:        "Medium",
            symbolSet:   "Athenian",
            limit:       17,
            resolution:  5.41,
            diacritics:  "none",
            stepsPerApotome: 21,
        },
        {
            id:          "high",
            name:        "High",
            symbolSet:   "Promethean",
            limit:       23,
            resolution:  2.42,
            diacritics:  "none",
            stepsPerApotome: 47,
        },
        {
            id:          "ultra",
            name:        "Ultra",
            symbolSet:   "Herculean",
            limit:       23,
            resolution:  1.96,
            diacritics:  "accents",
            stepsPerApotome: 58,
        },
        {
            id:          "extreme",
            name:        "Extreme",
            symbolSet:   "Olympian",
            limit:       47,
            resolution:  0.49,
            diacritics:  "accents & breves",
            stepsPerApotome: 233,
        },
    ],

    /**
     * Primes available as input exponents (columns C–S in row 8).
     * Exponent of 2 is derived from the ratio, not entered directly.
     */
    inputPrimes: [3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61],

    /**
     * Pythagorean nominals recognised in cell C13 (the 1/1 position string).
     * Row 1 of the Calculator sheet encodes all 35 positions as a fixed string:
     *   "bbFbbCbbGbbDbbAbbEbbBbF bC bG bD bA bE bB F  C  G  D  A  E  B  #F #C #G #D #A #E #B xF xC xG xD xA xE xB "
     * FIND(nominal, $A$1) gives the character position; subtract 46 and divide by 3
     * to get the fifths-above-C offset.
     */
    nominalsString:
        "bbFbbCbbGbbDbbAbbEbbBbF bC bG bD bA bE bB F  C  G  D  A  E  B  #F #C #G #D #A #E #B xF xC xG xD xA xE xB ",

    /**
     * Default input state (all exponents zero, ratio 5/4, nominal C).
     */
    defaultInputs: {
        exponents: { 3:0, 5:0, 7:0, 11:0, 13:0, 17:0, 19:0, 23:0, 29:0, 31:0, 37:0, 41:0, 43:0, 47:0, 53:0, 59:0, 61:0 },
        numerator:   5,
        denominator: 4,
        nominal:     "C",
    },
};

// ============================================================================
// UI sheet formulas – translated to JavaScript functions
// ============================================================================

const APOTOME = (Math.log2(3) * 7 - 11) * 1200; // ≈ 113.685¢

/**
 * Compute the monzo multiplier for a given set of prime exponents.
 * Mirrors Calculator!AG2: =(3^e3)*(5^e5)*(7^e7)*(11^e11)*...
 * @param {Object} exponents  e.g. { 3: 1, 5: -2, 7: 0, ... }
 */
export function computeMonzoMultiplier(exponents) {
    let result = 1;
    for (const [prime, exp] of Object.entries(exponents)) {
        result *= Math.pow(Number(prime), Number(exp));
    }
    return result;
}

/**
 * Compute the ratio multiplier from a numerator/denominator entry.
 * Mirrors Calculator!AG3: =numerator / denominator
 */
export function computeRatioMultiplier(numerator, denominator) {
    return numerator / denominator;
}

/**
 * Compute the total multiplier (monzo × ratio).
 * Mirrors Calculator!AG4: =AG2 * AG3
 */
export function computeTotalMultiplier(exponents, numerator, denominator) {
    return computeMonzoMultiplier(exponents) * computeRatioMultiplier(numerator, denominator);
}

/**
 * Compute cents above 1/1 from total multiplier.
 * Mirrors Calculator!AG5: =MOD(1200*LOG(AG4, 2), 1200)
 */
export function computeCents(totalMultiplier) {
    return ((1200 * Math.log2(totalMultiplier)) % 1200 + 1200) % 1200;
}

/**
 * Get the fifths-above-C value for a nominal string.
 * Mirrors Calculator!AJ2: =C8 + (FIND(nominal&SPACES, $A$1) - 46) / 3
 * where $A$1 is the nominalsString.
 * For the 1/1, the result is the fifths offset of the reference pitch.
 */
export function getFifthsAboveC(nominalStr, nominalsString) {
    const padded = (nominalStr + "   ").slice(0, 3);
    const idx = nominalsString.indexOf(padded);
    if (idx === -1) return null;
    return (idx - 45) / 3; // 1-based FIND, so idx+1-46 = idx-45
}

export default UI_CONFIG;
