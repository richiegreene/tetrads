/* =====================================================================
 *  DYADS — thirty-eight measured listeners
 * =====================================================================
 *
 * Mean consonance ratings and their standard deviations for thirty-eight
 * dyads, from
 *
 *   Masina, I., Lo Presti, G. & Stanzial, D. "Dyad's consonance and
 *   dissonance: combining the compactness and roughness approaches."
 *   Eur. Phys. J. Plus 137, 1254 (2022).  doi:10.1140/epjp/s13360-022-03456-2
 *
 * WHY THE APP CARRIES DATA AT ALL.  Every other number in Tetrads is derived:
 * you give it a limit and it tells you what follows. These are not derived
 * from anything — they are what people said — and they are here because
 * without them the four measures in this mode are four curves with no way to
 * choose between them. Harmonic entropy, sensory dissonance and the Tenney
 * norm are stated in three incommensurable units and disagree about which
 * intervals are concordant; the ratings are the only thing on the plot that
 * can settle it.
 *
 * Written in rather than fetched: it is thirty-eight rows, and a static page
 * that has to load a file before it can draw is a static page with a way to
 * fail.
 *
 * A rating is 0 (least consonant) to 1 (most). The deviations are wide and
 * they matter — 5/3 was rated 0.609 with a spread of 0.225, and a model that
 * misses it by a tenth has not really missed it. That is why the fit below is
 * WEIGHTED by the inverse variance rather than plain least squares: a dyad the
 * listeners agreed about counts for more than one they did not.
 * ------------------------------------------------------------------ */

/** [numerator, denominator, mean rating, standard deviation]. */
const ROWS = [
    [33, 32, 0.067, 0.126], [16, 15, 0.025, 0.064], [11, 10, 0.047, 0.084],
    [9, 8, 0.123, 0.152], [7, 6, 0.153, 0.186], [6, 5, 0.306, 0.138],
    [11, 9, 0.256, 0.149], [5, 4, 0.569, 0.155], [9, 7, 0.334, 0.185],
    [4, 3, 0.677, 0.124], [11, 8, 0.234, 0.178], [7, 5, 0.224, 0.138],
    [16, 11, 0.150, 0.122], [3, 2, 0.850, 0.089], [14, 9, 0.219, 0.136],
    [8, 5, 0.378, 0.119], [18, 11, 0.325, 0.178], [5, 3, 0.609, 0.225],
    [7, 4, 0.291, 0.190], [9, 5, 0.273, 0.135], [11, 6, 0.184, 0.150],
    [15, 8, 0.188, 0.107], [27, 14, 0.117, 0.121], [2, 1, 0.979, 0.058],
    [33, 16, 0.086, 0.130], [32, 15, 0.157, 0.122], [9, 4, 0.319, 0.144],
    [12, 5, 0.409, 0.143], [5, 2, 0.628, 0.176], [8, 3, 0.575, 0.160],
    [14, 5, 0.325, 0.150], [3, 1, 0.814, 0.093], [16, 5, 0.384, 0.179],
    [10, 3, 0.550, 0.183], [7, 2, 0.400, 0.165], [18, 5, 0.334, 0.141],
    [15, 4, 0.312, 0.144], [4, 1, 0.825, 0.121],
];

/** The same rows with the cents worked out, which is where they are drawn. */
export const RATINGS = ROWS.map(([p, q, mean, sd]) => ({
    p, q,
    label: `${p}/${q}`,
    cents: 1200 * Math.log2(p / q),
    mean,
    sd,
}));

/** The widest interval anyone was asked about — 4/1, two octaves. */
export const RATINGS_MAX_CENTS = 2400;

/** The rated ratios as bare numerators and denominators, for Python. */
export const RATED_P = RATINGS.map((r) => r.p);
export const RATED_Q = RATINGS.map((r) => r.q);

/**
 * Fit a measure to the ratings, the way the published comparison does it.
 *
 * A weighted least-squares line, weights 1/sd^2, of rating against the
 * measure's own value. Three things come out of it and all three are needed:
 *
 *   slope and intercept  the map from the model's arbitrary units onto the
 *                        rating axis, which is what lets an entropy curve and
 *                        a Tenney curve be drawn on the same plot at all.
 *   r2                   how much of the disagreement between listeners'
 *                        ratings the model actually accounts for. This is the
 *                        number in the foot, and it is the one that makes
 *                        switching models mean something rather than just
 *                        looking different.
 *
 * R-squared is the weighted, mean-centred one — the same quantity statsmodels
 * reports for a WLS fit, so the figures here are comparable with the published
 * ones rather than merely similar in spirit.
 *
 * Takes the measure's value AT each rated ratio rather than a function to
 * sample, because the two kinds of measure produce them differently and only
 * one of them can be sampled at all: a curve is read off at the ratio's cents,
 * while a discrete measure is computed from the ratio's own two numbers — and
 * several of the rated ratios (27/14, 33/32) are outside any limit the app is
 * likely to be set to, so there is no lattice mark to read them off.
 *
 * @param {ArrayLike<number>} values aligned with RATINGS; NaN where the
 *                           measure has nothing to say about that ratio
 * @param {number} maxCents  the axis; ratings beyond it are not in the picture
 *                           and are not allowed to influence the line either
 * @returns {{a:number, b:number, r2:number, n:number}|null}
 */
export function fitRatings(values, maxCents) {
    const pts = [];
    RATINGS.forEach((r, i) => {
        if (r.cents > maxCents + 1e-6) return;
        const x = values ? values[i] : NaN;
        if (!(x === x)) return;
        pts.push({ x, y: r.mean, w: 1 / (r.sd * r.sd) });
    });
    /* Two points define a line and say nothing about how good it is, so a fit
       from fewer than three is not reported at all. */
    if (pts.length < 3) return null;

    let Sw = 0, Sx = 0, Sy = 0, Sxx = 0, Sxy = 0;
    for (const p of pts) {
        Sw += p.w; Sx += p.w * p.x; Sy += p.w * p.y;
        Sxx += p.w * p.x * p.x; Sxy += p.w * p.x * p.y;
    }
    const den = Sw * Sxx - Sx * Sx;
    /* A measure that is flat across every rated dyad has no line through it. */
    if (Math.abs(den) < 1e-12) return null;

    const b = (Sw * Sxy - Sx * Sy) / den;
    const a = (Sy - b * Sx) / Sw;

    const ybar = Sy / Sw;
    let ssRes = 0, ssTot = 0;
    for (const p of pts) {
        const d = p.y - (a + b * p.x);
        ssRes += p.w * d * d;
        ssTot += p.w * (p.y - ybar) * (p.y - ybar);
    }
    const r2 = ssTot > 1e-12 ? 1 - ssRes / ssTot : 0;
    return { a, b, r2, n: pts.length };
}
