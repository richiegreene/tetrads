
import * as C from './constants.js';
import * as U from './utils.js';
import { getEnharmonicVariants } from './sagittal-Calculator.js';
import { calculateEdoNotation } from './edo.js';

/**
 * Notation engine for the Tuner window.
 *
 * The tuner anchors 1/1 = C, matching the natural anchor of every notation
 * engine it drives (the Sagittal Calculator's NOMINALS table is C-based, and
 * the HEJI speller below is written C-anchored). The Hz / cents readouts use the app-wide 1/1 frequency; that
 * reference is applied by the render layer, not here.
 *
 * A "scale" is a set of ratios folded into one octave [1, 2). The incoming mic
 * pitch is folded the same way, so any octave of a played note lines up with
 * the scale degrees.
 */

const MONZO_LENGTH = C.reference.length; // 24
const HIGHEST_PRIME = 89;

// ---------------------------------------------------------------------------
// Ratio helpers
// ---------------------------------------------------------------------------

/** Absolute monzo of num/den, relative to 1/1 (= C for the tuner). */
export function ratioMonzo(num, den) {
    return U.diffArray(U.getArray(num), U.getArray(den));
}

/** Cents of num/den above 1/1 (not folded). */
export function ratioCents(num, den) {
    return 1200 * Math.log2(num / den);
}

/** Fold a ratio into [1, 2) with integer arithmetic. */
function foldOctave(num, den) {
    let n = num, d = den;
    while (n / d >= 2) { d *= 2; [n, d] = U.reduce(n, d); }
    while (n / d < 1) { n *= 2; [n, d] = U.reduce(n, d); }
    return U.reduce(n, d);
}

/** True when num/den factors entirely within the 89-limit (spellable). */
function within89Limit(num, den) {
    const strip = (x) => {
        for (const p of C.primes) while (x % p === 0) x /= p;
        return x;
    };
    return strip(num) === 1 && strip(den) === 1;
}

// ---------------------------------------------------------------------------
// Scale enumeration
// ---------------------------------------------------------------------------

const MAX_DEGREES = 400; // safety cap for prime-limit blow-ups

/**
 * Build a just-intonation scale (one octave) for the given limit type.
 *
 * @param {string} limitType  'integer' | 'odd' | 'prime' | 'custom'
 * @param {object} params     { limit, maxExp, custom } as relevant
 * @returns {{num:number, den:number, cents:number}[]}  sorted by cents [0,1200)
 */
export function buildJiScale(limitType, params = {}) {
    const degrees = new Map(); // "n/d" -> [n, d]
    const add = (num, den) => {
        if (num <= 0 || den <= 0) return;
        const [n, d] = foldOctave(num, den);
        degrees.set(n + '/' + d, [n, d]);
        if (degrees.size > MAX_DEGREES * 4) return; // hard stop
    };

    if (limitType === 'integer') {
        const N = clampInt(params.limit, 1, 1000, 13);
        for (let a = 1; a <= N; a++) {
            for (let b = 1; b <= N; b++) {
                const [rn, rd] = U.reduce(a, b);
                if (rn <= N && rd <= N) add(rn, rd);
            }
        }
    } else if (limitType === 'odd') {
        const N = clampInt(params.limit, 1, 1000, 13);
        for (let a = 1; a <= N; a += 2) {
            for (let b = 1; b <= N; b += 2) add(a, b);
        }
    } else if (limitType === 'prime') {
        const P = clampInt(params.limit, 2, HIGHEST_PRIME, 13);
        const E = clampInt(params.maxExp, 1, 12, 2);
        const ps = C.primes.filter((p) => p > 2 && p <= P);
        enumeratePrimeProducts(ps, E, add);
    } else if (limitType === 'custom') {
        for (const [num, den] of parseCustomRatios(params.custom || '')) add(num, den);
    }

    if (!degrees.has('1/1')) degrees.set('1/1', [1, 1]);

    const out = [...degrees.values()].map(([num, den]) => ({
        num, den,
        cents: U.mod(ratioCents(num, den), 1200),
        supported: within89Limit(num, den),
    }));
    out.sort((a, b) => a.cents - b.cents);
    return out.slice(0, MAX_DEGREES);
}

/** Enumerate all prime^exp products with |exp| <= E, folding via `add`. */
function enumeratePrimeProducts(primesList, E, add) {
    let combos = [[1, 1]]; // [num, den]
    for (const p of primesList) {
        const next = [];
        for (const [n, d] of combos) {
            for (let e = -E; e <= E; e++) {
                let nn = n, dd = d;
                if (e > 0) nn *= Math.pow(p, e);
                else if (e < 0) dd *= Math.pow(p, -e);
                next.push(U.reduce(nn, dd));
            }
        }
        combos = next;
        if (combos.length > 20000) break; // runaway guard
    }
    for (const [n, d] of combos) add(n, d);
}

/** Parse a free-form ratio list ("3/2, 5/4 7/4" or newline separated). */
export function parseCustomRatios(text) {
    const out = [];
    for (const tok of String(text).split(/[\s,]+/)) {
        if (!tok) continue;
        const m = tok.match(/^(\d+)(?:\/(\d+))?$/);
        if (!m) continue;
        const num = parseInt(m[1], 10);
        const den = m[2] ? parseInt(m[2], 10) : 1;
        if (num > 0 && den > 0) out.push([num, den]);
    }
    return out;
}

function clampInt(v, lo, hi, fallback) {
    const n = parseInt(v, 10);
    if (isNaN(n)) return fallback;
    return Math.max(lo, Math.min(hi, n));
}

// ---------------------------------------------------------------------------
// HEJI speller (C-anchored)
// ---------------------------------------------------------------------------
//
// Faithful replica of the exponent->symbol tables in ui.js getPC(), specialized
// to 1/1 = C (reference note C natural => refpc 1, diatonic & accidental offset
// 0, so chromatic = fifths + 22). Spelling is octave-invariant because prime 2
// contributes 0 to tonalIdentity. Kept self-contained so the app's core getPC()
// is never touched.

// e5 -> the combined nominal/sharp/syntonic-arrow glyph row, indexed by the
// chromatic (fifths) band. Mirrors the state.displaySum[2] switch in getPC().
const FIVE_ROWS = {
    '-4': C.fiveUpUpUpUp, '-3': C.fiveUpUpUp, '-2': C.fiveUpUp, '-1': C.fiveUp,
    '0': C.pythagOutput,
    '1': C.fiveDown, '2': C.fiveDownDown, '3': C.fiveDownDownDown, '4': C.fiveDownDownDownDown,
};

// Higher-prime accidentals by monzo index. `dir` is +1 when the symbol array
// runs low->high with exponent, -1 when reversed (matches getPC's per-prime
// if/else ordering). symbolIndex = clamp(3 + dir*exp).
const PRIME_ACC = {
    3:  { s: C.septimalSymbols,     dir: -1 }, // 7
    4:  { s: C.undecimalSymbols,    dir: +1 }, // 11
    5:  { s: C.tridecimalSymbols,   dir: -1 }, // 13
    6:  { s: C.seventeenSymbols,    dir: -1 }, // 17
    7:  { s: C.nineteenSymbols,     dir: +1 }, // 19
    8:  { s: C.twentyThreeSymbols,  dir: +1 }, // 23
    9:  { s: C.twentyNineSymbols,   dir: +1 }, // 29
    10: { s: C.thirtyOneSymbols,    dir: -1 }, // 31
    11: { s: C.thirtySevenSymbols,  dir: +1 }, // 37
    12: { s: C.fortyOneSymbols,     dir: +1 }, // 41
    13: { s: C.fortyThreeSymbols,   dir: +1 }, // 43
    14: { s: C.fortySevenSymbols,   dir: +1 }, // 47
    15: { s: C.fiftyThreeSymbols,   dir: +1 }, // 53
    16: { s: C.fiftyNineSymbols,    dir: +1 }, // 59
    17: { s: C.sixtyOneSymbols,     dir: +1 }, // 61
    18: { s: C.sixtySeventhSymbols, dir: +1 }, // 67
    19: { s: C.seventyOneSymbols,   dir: +1 }, // 71
    20: { s: C.seventyThreeSymbols, dir: +1 }, // 73
    21: { s: C.seventyNineSymbols,  dir: +1 }, // 79
    22: { s: C.eightyThreeSymbols,  dir: +1 }, // 83
    23: { s: C.eightyNineSymbols,   dir: +1 }, // 89
};

const clampBand = (i) => Math.max(0, Math.min(6, i));

/**
 * Spell an absolute (1/1 = C) monzo in HEJI.
 * @param {number[]} monzo
 * @param {{unofficialExtensions?:boolean}} opts  when unofficialExtensions is
 *        false, pitches using primes 53-89 are un-notatable (null), matching
 *        HEJI Output's "unofficial extensions" toggle.
 * @returns {{letter:string, html:string}|null}  null if un-notatable.
 */
export function hejiName(monzo, opts = {}) {
    const { unofficialExtensions = true } = opts;
    const m = padMonzo(monzo);
    for (let i = 0; i < m.length; i++) {
        if (i >= 24 && m[i]) return null; // beyond the app's prime table
    }
    if (!unofficialExtensions) {
        for (let i = 15; i < 24; i++) if (m[i]) return null; // primes 53-89
    }

    let fifths = 0;
    for (let i = 0; i < m.length; i++) fifths += m[i] * (C.tonalIdentity[i] || 0);

    const pc = U.mod(1 + fifths, 7); // refpc(C) = 1
    const letter = C.diatonicOutput[pc];

    const chromatic = fifths + 22; // C anchor: 22 + diatonicOffset(0) + accidentalOffset(0)
    const band = clampBand(Math.floor(chromatic / 7));
    const e5 = m[2] || 0;
    const fiveRow = FIVE_ROWS[String(Math.max(-4, Math.min(4, e5)))];
    const pythag = fiveRow[band];

    const g = {};
    let anyHigher = false;
    for (let i = 3; i < 24; i++) {
        const exp = m[i] || 0;
        if (exp !== 0) anyHigher = true;
        const spec = PRIME_ACC[i];
        g[i] = spec ? spec.s[clampBand(3 + spec.dir * exp)] : '';
    }

    const natural = (pythag === '' && e5 === 0 && !anyHigher) ? 'n' : '';

    const heji2 = g[14] + g[13] + g[12] + g[11] + g[10] + g[9] + g[8] + g[7] + g[6]
        + g[5] + g[4] + g[3] + pythag + natural;
    const ext = g[23] + g[22] + g[21] + g[20] + g[19] + g[18] + g[17] + g[16] + g[15];
    const displayedHeji2 = natural === 'n' ? heji2.replace(/n/g, ' ') : heji2;

    const html = `<span class="heji-extensions">${ext}</span>`
        + `<span class="heji2">${displayedHeji2}</span>`;
    return { letter, html };
}

function padMonzo(monzo) {
    const m = monzo.slice();
    while (m.length < MONZO_LENGTH) m.push(0);
    return m;
}

// ---------------------------------------------------------------------------
// Sagittal / EDO names
// ---------------------------------------------------------------------------

/**
 * Sagittal spellings for num/den (1/1 = C).
 * @param {object} opts { precision, useEvo, useUnicode, showEnh }
 * @returns {{letter:string, symbol:string, unicode:boolean}[]}  one spelling, or
 *          the enharmonic set when showEnh is true (like Sagittal Output).
 */
export function sagittalSpellings(num, den, opts = {}) {
    const { precision = 'medium', useEvo = false, useUnicode = true, showEnh = false } = opts;
    let variants = getEnharmonicVariants(
        { numerator: num, denominator: den, nominal: 'C' },
        precision
    ).filter((v) => v.nominalLetter);
    if (!variants.length) return [];

    if (!showEnh && variants.length > 1) {
        variants = [variants.reduce((a, b) => {
            const ea = typeof a.error === 'number' ? Math.abs(a.error) : Infinity;
            const eb = typeof b.error === 'number' ? Math.abs(b.error) : Infinity;
            return eb < ea ? b : a;
        })];
    }
    const field = (useEvo ? 'evo' : 'revo') + '_' + (useUnicode ? 'unicode' : 'ascii');
    return variants.map((v) => ({
        letter: v.nominalLetter,
        symbol: v[field] || '',
        unicode: useUnicode,
    }));
}

/**
 * Ups-and-downs name for a step of m-EDO (1/1 = C, step 0 = C).
 * @returns {{spellings:{base:string, acc:string}[]}}  one entry, or several when
 *          showEnh yields comma-separated enharmonic equivalents.
 */
export function edoName(step, m, opts = {}) {
    const { showEnh = true, excludeHalves = false } = opts;
    const notation = calculateEdoNotation(U.mod(step, m), m, 1, 0, showEnh, '', excludeHalves);
    if (notation === 'n/a') return { spellings: [{ base: 'n/a', acc: '' }] };
    const spellings = notation.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(splitEdoSpelling)
        .reverse(); // spelling that was on top is now on the bottom
    return { spellings: spellings.length ? spellings : [{ base: notation, acc: '' }] };
}

/** Split one ups-and-downs spelling into nominal + accidental (no comma). */
function splitEdoSpelling(part) {
    const base = part.split(/[\^vb#x\\/]/)[0].trim();
    const acc = part.substring(base.length).trim();
    return { base, acc };
}

/**
 * Attach a notation name to each JI degree for the given language.
 * @param {{num,den,cents,supported}[]} degrees
 * @param {string} language  'heji' | 'sagittal'
 */
export function nameJiDegrees(degrees, language, opts = {}) {
    return degrees.map((deg) => {
        let name = null;
        if (deg.supported) {
            if (language === 'heji') name = hejiName(ratioMonzo(deg.num, deg.den), opts);
            else if (language === 'sagittal') name = { spellings: sagittalSpellings(deg.num, deg.den, opts) };
        }
        return { ...deg, name };
    });
}

/** Build the m-EDO degree list (one octave) with ups-and-downs names. */
export function buildEdoDegrees(m, opts = {}) {
    const steps = clampInt(m, 5, 300, 41);
    const out = [];
    for (let s = 0; s < steps; s++) {
        out.push({
            step: s,
            cents: (s * 1200) / steps,
            edo: steps,
            name: edoName(s, steps, opts),
        });
    }
    return out;
}
