/* =====================================================================
 *  HOW MUCH WORK THAT WOULD BE
 * =====================================================================
 *
 * The generators walk every combination-with-replacement of the valid numbers,
 * so the size of the job is knowable before any of it is done — and it has to
 * be, because the growth is brutal and the failure mode is silent. Odd-limit
 * 13 is a hundred and twenty thousand chords; a slipped keystroke making that
 * 1113 is a TRILLION, and in Pyodide — which runs on the page's own thread —
 * that is not a slow render, it is a tab that never comes back and cannot be
 * interrupted.
 *
 * This mattered less when a press was required: asking for a trillion chords
 * was something you did on purpose, having typed the number and then reached
 * for Update. A panel that applies itself has no such moment, so it needs to
 * know what it is about to attempt.
 *
 * THE BUDGET IS NOT A LIMIT ON THE APP.  A job over budget is not refused, it
 * is deferred to an explicit press — ↵ runs it anyway. That is the one thing
 * the Update button was genuinely good for, kept for the one case that needs
 * it, rather than made a toll on every ordinary change.
 * ------------------------------------------------------------------ */

import { pyodide, python_ready } from '../globals.js';

/**
 * As many chords as will generate without the page going away for a minute.
 *
 * Between one and two million combinations is a second or so of Pyodide, which
 * is a pause; ten million is a minute, which is a hang. The number is the
 * order of magnitude rather than a measurement — machines differ by more than
 * the slack here.
 */
export const WORK_BUDGET = 2_500_000;

/**
 * How many chords this panel would generate.
 *
 * @param {object} o     the panel, as readPanel/applyTetrads read it
 * @param {number} voices 4 for the tetrahedron, 3 for the triangle
 * @returns {Promise<number>} the count, or -1 if it could not be worked out
 */
export async function estimateWork(o, voices) {
    if (!python_ready) return -1;
    const limit = typeof o.limitValue === 'string' && o.limitValue.includes('.')
        ? `"${o.limitValue}"` : o.limitValue;
    try {
        return await pyodide.runPythonAsync(`
from theory.calculations import estimate_combinations
estimate_combinations(
    limit_value=${limit},
    equave_ratio=${o.equaveRatio},
    limit_mode="${String(o.limitType).toLowerCase()}",
    max_exponent=${o.maxExponent},
    voices=${voices}
)
        `);
    } catch (err) {
        return -1;
    }
}

/** The count, said the way the foot says it. */
export function sayWork(n) {
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)} billion`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)} million`;
    return n.toLocaleString();
}
