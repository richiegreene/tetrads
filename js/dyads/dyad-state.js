/* =====================================================================
 *  DYADS — what the mode is currently set to
 * =====================================================================
 *
 * The triangle keeps its settings in triad-state.js and the tetrahedron keeps
 * its in globals.js, for the reason the three have separate drawers: a control
 * that only exists in one mode has no business being read in another, and a
 * single store would make it impossible to tell which those are.
 *
 * What is NOT here is anything genuinely shared — the limit, the equave, the
 * complexity measure, the colormap, the synth, the notation. Those are read
 * from the same inputs the other two modes read; see read-panel.js.
 * ------------------------------------------------------------------ */

/**
 * Which measure the plot is a picture of.
 *
 * Four kinds of answer to one question, which is the point of the mode:
 *
 *   discrete WHICHEVER OF THE SIX the Complexity drawer is set to — Tenney,
 *            Weil, Wilson, Euler, Benedetti, Arithmetic. These are functions
 *            of a ratio's two numbers, so they have a value AT every just
 *            interval and none at all between them: no curve, only the height
 *            of the lattice itself.
 *   he       HARMONIC ENTROPY. How many simple readings of the interval the
 *            ear has to choose between. Probabilistic, and knows nothing
 *            about timbre.
 *   sethares SENSORY DISSONANCE. Partial against partial, from the spectrum
 *            of whatever wave is loaded in the Play drawer. Physical, and
 *            knows nothing about arithmetic.
 *   tenney   THE TENNEY NORM, MADE CONTINUOUS. log2(pq) at every ratio, with
 *            a parabola let down from each one so the space between them has
 *            a value too. Arithmetic, and knows nothing about ears.
 *
 * Nine measures between them, and they disagree. The Ratings overlay is what
 * lets you see which of them is right about a listener.
 */
export let dyadModel = 'he'; // 'discrete' | 'he' | 'sethares' | 'tenney'
export function setDyadModel(v) { dyadModel = v; }

/* ---- how the curve is drawn ----
   Fill and Line are independent rather than a choice of one, drawn with the
   same flagSeg the other modes use: the curve can be shaded under, stroked,
   both, or neither with only the lattice left. */
export let dyadFill = true;
export let dyadLine = true;
export function setDyadFill(v) { dyadFill = v; }
export function setDyadLine(v) { dyadLine = v; }

/**
 * Whether the measured listeners are on the plot.
 *
 * Ratings for thirty-eight dyads, from Masina, Lo Presti and Stanzial (2022) —
 * see dyad-data.js. Switching them on changes what the vertical axis IS: the
 * curve stops being drawn in the model's own arbitrary units and is fitted to
 * the ratings by weighted least squares, so what you are looking at is the
 * model's PREDICTION of a consonance rating, against the ratings themselves,
 * with the error bars the listeners actually produced.
 *
 * That is the one honest way to put four incommensurable measures on the same
 * axis, and it is what makes switching between them mean something.
 */
export let dyadRatings = false;
export function setDyadRatings(v) { dyadRatings = v; }

/* ---- the JI dyads themselves ----
   Two questions, so two switches: whether the lattice is marked at all, and
   whether each mark says which interval it is. */
export let dyadDots = true;
export let dyadLabels = true;
export function setDyadDots(v) { dyadDots = v; }
export function setDyadLabels(v) { dyadLabels = v; }

/**
 * Land the cursor on the nearest just dyad within this many pixels, or never
 * if 0.
 *
 * Without it the marks are decoration: a pixel is a cent or two and the hand
 * is not that steady, so 3/2 is visible and not reliably touchable. With it, a
 * drag glides freely along the curve and clicks into the lattice as it passes.
 */
export let dyadSnap = 0;
export function setDyadSnap(v) { dyadSnap = v; }

/**
 * How long a voice takes to reach the pitch under the pointer, in seconds.
 *
 * Its own setting rather than the triangle's, because it is its own gesture:
 * two voices moving in contrary motion about a pivot is a different thing to
 * follow than three, and the useful amount of smoothing is not the same.
 */
export let dyadGlide = 0.045;
export function setDyadGlide(v) { dyadGlide = v; }

/** Which of the two voices is held while the other moves. 0 = lower. */
export let dyadPivot = 0;
export function setDyadPivot(v) { dyadPivot = v; }

/**
 * How many equaves wide the axis is.
 *
 * The equave itself is shared with the other two modes and is not this mode's
 * to change — but a dyad is the one chord that is perfectly readable beyond
 * one, and the rating data runs to 4/1. So the SPAN is the dyad's own control:
 * it widens the axis without touching the set the other two modes are built
 * from. At 2 the whole of the published data is on screen.
 */
export let dyadSpan = 2;
export function setDyadSpan(v) { dyadSpan = v; }

/* ---- model parameters ----
   Spread, order and depth are asked in the units the models are stated in, and
   the resolution is shared by all three so the curves are comparable. */
export const dheParams = { resolution: 1600, nLimit: 160, spread: 17, alpha: 7 };
export const dsmParams = { resolution: 1600, partials: 12, ramp: 1 };
export const dtnParams = { resolution: 1600, softness: 20, depth: 50 };

/** Every model's resolution at once — the one slider that sets all three. */
export function setDyadResolution(v) {
    dheParams.resolution = v; dsmParams.resolution = v; dtnParams.resolution = v;
}

/**
 * Where the pointer is, as the interval in cents.
 *
 * One number, which is the whole difference between this mode and the
 * triangle: a dyad has one degree of freedom, so the picture is a curve rather
 * than a surface and the cursor is a position along it.
 */
export const cursor = { c: 0, live: false };
export function setCursor(c) { cursor.c = c; }
export function setCursorLive(v) { cursor.live = v; }
