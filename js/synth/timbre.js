/* =====================================================================
 *  TIMBRE — the filtered wavetable, and the picker over it
 * =====================================================================
 *
 * Lifted verbatim out of the Engrave app's shared/js/synth.js, which is where
 * this family of sounds is defined and documented. Nothing here is rewritten:
 * the same four stations, the same feedback recursion transcribed from
 * justidraw's src/audio.lua, the same drawn preview and the same picker, so a
 * shape chosen in this app is the shape that app would sound.
 *
 * What is NOT here is Engrave's ScorePlayer, which pre-renders a whole score
 * into an AudioBuffer. This app plays one key at a time, under a hand, and
 * wants the note to start when the key goes down — so the sounding half lives
 * in ./voice.js and ./voice-processor.js instead, running the identical
 * recursion a sample at a time.
 * ------------------------------------------------------------------ */

const TWO_PI = Math.PI * 2;

/* ------------------------------------------------------------------ *
 * Timbre
 *
 * One number says what a partial is re-synthesised as, and which family of
 * synthesis it belongs to is read off its range rather than carried beside it.
 * That is what lets a timbre flag stay a single scalar everywhere it is
 * stored, drawn, glided between, saved and printed — see makeTimbreFlag in
 * layout.js and the flag chips in canvas.js and print.js, none of which need
 * to know a second family arrived.
 *
 *   0 .. 300      wavetable: sine -> triangle -> saw -> square, linear
 *                 crossfade between adjacent shapes, matching the "Basic
 *                 Shapes" preset in the desktop modifier's wavetable dialog.
 *
 *   1000 .. 1300  filtered wavetable: filtered sine -> triangle -> saw ->
 *                 square, the same four stations in the same order, so the
 *                 slider means the same thing in either family. Not a table at
 *                 all but a feedback oscillator; see FILTERED below and
 *                 render-worker.js, which runs it.
 *
 * The gap between the two is deliberate. Nothing valid lives in it, so an old
 * project's plain number still reads as the wavetable it always was, and a
 * value that has strayed somewhere strange lands on a family rather than
 * halfway between two of them.
 *
 * Naming and drawing live here beside the renderer so that the label, the
 * picture and the sound cannot disagree about what the slider is set to.
 * ------------------------------------------------------------------ */

export const TIMBRE_MAX = 300;

export const FILTERED_MIN = 1000;
export const FILTERED_MAX = 1300;

const SHAPE_NAMES = ['Sine', 'Triangle', 'Sawtooth', 'Square'];
const FILTERED_NAMES = ['Filtered sine', 'Filtered triangle', 'Filtered saw', 'Filtered square'];

/**
 * The families a picker offers, and the range each one occupies.
 *
 * Both the Play tab's timbre area and the Write tab's timbre-flag drawer build
 * their dropdown from this list, so the two cannot come to offer different
 * things — see createTimbrePicker, which is the only thing that reads it.
 */
export const TIMBRE_FAMILIES = [
  {
    id: 'wavetable',
    label: 'Wavetable',
    min: 0,
    max: TIMBRE_MAX,
    ticks: ['sine', 'tri', 'saw', 'square'],
  },
  {
    id: 'filtered',
    label: 'Filtered wavetable',
    min: FILTERED_MIN,
    max: FILTERED_MAX,
    ticks: ['sine', 'tri', 'saw', 'square'],
  },
];

/** Which family a stored value belongs to. @returns {'wavetable'|'filtered'} */
export function familyOf(value) {
  return value >= FILTERED_MIN ? 'filtered' : 'wavetable';
}

export function familyFor(id) {
  return TIMBRE_FAMILIES.find((f) => f.id === id) || TIMBRE_FAMILIES[0];
}

/** Where a filtered value sits among its four shapes — the morph of morph(). */
function filteredMorph(value) {
  const pos = Math.min(3, Math.max(0, (value - FILTERED_MIN) / 100));
  const lo = Math.min(2, Math.floor(pos));
  return { lo, frac: pos - lo };
}

/**
 * Naive shape functions, for the preview only.
 *
 * What you actually hear is band-limited (see render-worker.js), but an ideal
 * square reads as a square at a glance, whereas a band-limited one at this size
 * is mostly Gibbs ringing. The picture is an affordance for choosing a shape,
 * not an oscilloscope.
 */
const SHAPE_FNS = [
  (x) => Math.sin(2 * Math.PI * x),
  (x) => 4 * Math.abs(x - Math.floor(x + 0.5)) - 1,
  (x) => 2 * (x - Math.floor(x + 0.5)),
  (x) => (x % 1 < 0.5 ? 1 : -1),
];

/** Where a slider position sits between two shapes. */
function morph(value) {
  const pos = Math.min(3, Math.max(0, value / 100));
  const lo = Math.min(2, Math.floor(pos));
  return { lo, frac: pos - lo };
}

/* ------------------------------------------------------------------ *
 * The filtered wavetable — justidraw's oscillator, over four shapes
 *
 * From src/audio.lua, verbatim:
 *
 *   synth_saw     accum += 2π·delta;  s = amp·sin(accum + 2·pout)
 *                 pout = (pout + s) · 0.5
 *   synth_square  accum += 2π·delta;  s = amp·sin(accum + 2·pout·pout)
 *                 pout = (pout + s) · 0.5
 *
 * A sine phase-modulated by a low-passed copy of its own output — the physical
 * model being a resonator driven hard enough to fold, rather than a wavetable
 * read at a rate. Three things follow from that, and all three are the reason
 * the family exists:
 *
 *   The modulation index is driven by pout, and pout tracks the output, which
 *   is amp-scaled. So a quiet partial is very nearly a pure sine and a loud one
 *   folds into a bright buzz, continuously, from the one amplitude envelope.
 *   That is the loudness-timbre relationship, and it is not an added shaper —
 *   it falls out of the recursion. It transfers exactly, because score.js maps
 *   a justidraw vertex through the same amp_curve(w) = w² the app's own voices
 *   use, so `amp` here is the number `v.amp` would have been there.
 *
 *   `pout = (pout + s)·0.5` is a one-pole low-pass on the feedback path — the
 *   "filtered" in every one of these names. It is what stops the fold from
 *   running away into noise, and it is why the shapes stay distinguishable
 *   instead of collapsing into the same mush.
 *
 *   Squaring pout makes the modulation even-symmetric, which cancels the even
 *   harmonics. That single term is the whole difference between justidraw's
 *   saw and its square.
 *
 * Which gives the two dimensions the family is spanned over — how hard it is
 * driven, and how even-symmetric the drive is:
 *
 *   index = drive · ((1 - even)·pout + even·pout²)
 *
 * justidraw pins two of the four stations exactly: saw is drive 2 / even 0,
 * which reduces to 2·pout, and square is drive 2 / even 1, which reduces to
 * 2·pout². Neither is approximated — the expression *is* those, at those
 * settings. The two justidraw does not have are placed on the same axes:
 *
 *   sine      drive 0. No feedback, so no folding, so a sine — which is also
 *             exactly justidraw's own synth_sine, arrived at rather than
 *             special-cased.
 *   triangle  even 1 like the square, so odd harmonics only, at a quarter of
 *             its drive. Chosen by measurement, not taste: at drive 0.5 the
 *             harmonics come out 1, 0, 0.094, 0, 0.022, which is the 1/n²
 *             falloff that makes a triangle a triangle rather than the 1/n
 *             that makes a square, in the same proportion to this oscillator's
 *             own square as an ideal triangle stands to an ideal square.
 *
 * The one thing not taken literally is the pole. 0.5 is a per-sample
 * coefficient, and justidraw is always at 44.1 kHz where it works out to a
 * corner around 4.87 kHz; a browser handed 48 kHz would get a different filter
 * from the same constant. FILTERED.pole holds the corner instead of the
 * coefficient, so what is preserved is the sound rather than the digit.
 * ------------------------------------------------------------------ */

/**
 * (drive, even) at each of the four stations. The middle two are interpolated
 * through on the way between, so the slider crosses shapes rather than
 * jumping between them — as it does in the wavetable family.
 */
const FILTERED_NODES = [
  { drive: 0, even: 1 }, // sine — undriven, so `even` has nothing to act on
  { drive: 0.5, even: 1 }, // triangle — odd harmonics, gently
  { drive: 2, even: 0 }, // saw — justidraw's synth_saw, exactly
  { drive: 2, even: 1 }, // square — justidraw's synth_square, exactly
];

export const FILTERED = {
  /**
   * The feedback low-pass coefficient at this sample rate.
   *
   * a = 0.5^(44100/sr), which is exactly 0.5 at justidraw's own rate and the
   * same corner frequency everywhere else: a = e^(-2π·fc/sr) rearranges to
   * this, with fc = -ln(0.5)·44100/2π ≈ 4866 Hz.
   */
  pole: (sr) => Math.pow(0.5, 44100 / sr),

  /** Where a value sits on the two axes, crossfaded between its neighbours. */
  shape: (value) => {
    const { lo, frac } = filteredMorph(value);
    const a = FILTERED_NODES[lo];
    const b = FILTERED_NODES[Math.min(3, lo + 1)];
    return {
      drive: a.drive + frac * (b.drive - a.drive),
      even: a.even + frac * (b.even - a.even),
    };
  },

  /** index = drive·((1 - even)·pout + even·pout²) — see the header above. */
  index: (pout, drive, even) => drive * (pout + even * (pout * pout - pout)),

  /**
   * How much of the modulation index survives at this frequency: all of it up
   * to sr/8, none of it by sr/4.
   *
   * The one departure from justidraw, and it is a departure from the setting
   * rather than from the algorithm. Phase-feedback modulation makes harmonics
   * without limit, which is fine in an app whose lines are drawn in the range
   * a hand draws in, and is not fine here: a phonorealism score carries
   * partials to 19 kHz, and every harmonic those generated above Nyquist would
   * fold straight back down into the region the performer is tuning against.
   * The wavetable path band-limits for exactly this reason (see the mip levels
   * in render-worker.js) and a feedback oscillator cannot, so the index is
   * taken off instead — which is to say a partial too high to be folded
   * without aliasing is left as the sine it already almost is.
   *
   * Both ends are where the harmonics run out rather than where a sweep
   * sounded best. sr/8 is the highest fundamental whose 4th harmonic still
   * fits under Nyquist, and up to there nothing is touched at all — 6 kHz at
   * 48 kHz, which is above everything anyone notates, so for all musical
   * material the recursion is justidraw's sample for sample. sr/4 is where
   * even the 2nd harmonic no longer fits, and a fold that cannot produce one
   * true harmonic can only produce false ones.
   */
  taper: (freq, sr) => {
    const lo = sr / 8;
    const hi = sr / 4;
    if (freq <= lo) return 1;
    if (freq >= hi) return 0;
    const u = (freq - lo) / (hi - lo);
    return 1 - u * u * (3 - 2 * u);
  },
};

/**
 * One settled cycle of the filtered oscillator, normalised for drawing.
 *
 * A feedback oscillator has no closed form to sample the way SHAPE_FNS are
 * sampled, so the picture is made by running the real recursion and keeping
 * the last period, once the feedback has stopped changing what comes out.
 *
 * Two constants have to be chosen because the shape genuinely depends on them.
 * The reference frequency matters because the feedback filter has a fixed
 * corner, so the same oscillator is brighter low and duller high; 220.5 Hz is
 * a musically ordinary place to look at it, and divides 44100 into exactly 200
 * samples so the cycle closes on itself with no phase drift across the settling
 * passes. The reference amplitude matters more, since amplitude is what drives
 * the fold at all — drawn at 0.9 the glyph shows the shape at full cry, which
 * is the shape worth putting on a button. Quieter, it would be a sine, and
 * every filtered setting would be drawn identically.
 */
const FILTERED_PREVIEW_AMP = 0.9;
const FILTERED_PREVIEW_SAMPLES = 200;
const filteredCycles = new Map();

function filteredCycle(value) {
  // Quantised so a dragged slider reuses cycles instead of building one per
  // pixel; a step of 4 over the 300-wide range is finer than the change is
  // visible at this size.
  const key = Math.round(value / 4) * 4;
  const hit = filteredCycles.get(key);
  if (hit) return hit;

  const { drive, even } = FILTERED.shape(key);
  const n = FILTERED_PREVIEW_SAMPLES;
  const step = TWO_PI / n;
  const pole = 0.5; // justidraw's own coefficient, at justidraw's own rate
  const cycle = new Float32Array(n);
  let accum = 0;
  let pout = 0;
  // Eight periods in, the recursion has settled; the last pass over the buffer
  // is the one that survives.
  for (let i = 0; i < n * 8; i++) {
    accum += step;
    const s = FILTERED_PREVIEW_AMP * Math.sin(accum + FILTERED.index(pout, drive, even));
    pout = pole * pout + (1 - pole) * s;
    cycle[i % n] = s;
  }

  let max = 0;
  for (let i = 0; i < n; i++) max = Math.max(max, Math.abs(cycle[i]));
  if (max > 0) for (let i = 0; i < n; i++) cycle[i] /= max;
  filteredCycles.set(key, cycle);
  return cycle;
}

/**
 * The wave a timbre value draws as, as a function of cycles elapsed — one
 * source for both painters below, so the on-screen chip and the printed one
 * cannot come from different curves.
 */
function waveFn(value) {
  if (familyOf(value) === 'filtered') {
    const cycle = filteredCycle(value);
    const n = cycle.length;
    return (u) => cycle[(((Math.floor(u * n) % n) + n) % n)];
  }
  const { lo, frac } = morph(value);
  const a = SHAPE_FNS[lo];
  if (frac === 0) return a;
  const b = SHAPE_FNS[Math.min(3, lo + 1)];
  return (u) => a(u) + frac * (b(u) - a(u));
}

/** What to call a timbre setting: a shape, or how far between two of them. */
export function timbreName(value) {
  if (familyOf(value) === 'filtered') {
    const { lo, frac } = filteredMorph(value);
    if (frac < 0.02) return FILTERED_NAMES[lo];
    if (frac > 0.98) return FILTERED_NAMES[lo + 1];
    // Only the first is given the family in full: "Filtered triangle →
    // Filtered saw 40%" says "filtered" twice about one wave that never stops
    // being filtered.
    const to = FILTERED_NAMES[lo + 1].replace('Filtered ', '');
    return `${FILTERED_NAMES[lo]} → ${to} ${Math.round(frac * 100)}%`;
  }
  const { lo, frac } = morph(value);
  if (frac < 0.02) return SHAPE_NAMES[lo];
  if (frac > 0.98) return SHAPE_NAMES[lo + 1];
  return `${SHAPE_NAMES[lo]} → ${SHAPE_NAMES[lo + 1]} ${Math.round(frac * 100)}%`;
}

/**
 * Paint the chosen wave into a w x h box on any 2D context, at (x, y). The
 * piece both the Playback timbre drawer's own preview and a timbre flag's
 * on-score icon share, so a flag's chip is a picture of the exact shape it
 * will re-synthesise rather than a generic marker.
 * @param {CanvasRenderingContext2D} g
 * @param {number} value 0..TIMBRE_MAX
 */
export function paintTimbreGlyph(
  g, x, y, w, h, value,
  { line = '#4da3ff', axis = '#232a33', pad = 8, cycles = 2, glow = 6, axisLine = true } = {}
) {
  const wave = waveFn(value);
  const midY = y + h / 2;

  if (axisLine) {
    g.strokeStyle = axis;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, midY + 0.5);
    g.lineTo(x + w, midY + 0.5);
    g.stroke();
  }

  g.strokeStyle = line;
  g.lineWidth = 2;
  g.lineJoin = 'round';
  g.shadowColor = line;
  g.shadowBlur = glow;
  g.beginPath();
  for (let px = 0; px <= w; px++) {
    const u = (px / w) * cycles;
    const py = midY - wave(u) * (h / 2 - pad);
    if (px === 0) g.moveTo(x + px, py);
    else g.lineTo(x + px, py);
  }
  g.stroke();
  g.shadowBlur = 0;
}

/**
 * The same wave `paintTimbreGlyph` strokes, as an SVG path's `d` attribute.
 *
 * The print exporter has no 2D context to paint into — it emits SVG — so this
 * walks the identical sample points through the same shape functions rather
 * than re-deriving the curve, which is what keeps a flag's printed icon from
 * ever drifting out of sync with the one drawn on screen.
 * @param {number} value 0..TIMBRE_MAX
 */
export function timbreGlyphPath(x, y, w, h, value, { pad = 8, cycles = 2 } = {}) {
  const wave = waveFn(value);
  const midY = y + h / 2;
  let d = '';
  for (let px = 0; px <= w; px++) {
    const u = (px / w) * cycles;
    const py = midY - wave(u) * (h / 2 - pad);
    d += `${px === 0 ? 'M' : 'L'}${(x + px).toFixed(2)} ${py.toFixed(2)} `;
  }
  return d.trim();
}

/**
 * Draw two cycles of the chosen wave into a canvas, sizing it for the display.
 * @param {HTMLCanvasElement} canvas
 * @param {number} value 0..TIMBRE_MAX
 */
export function drawTimbreWave(canvas, value, { line = '#4da3ff', axis = '#232a33' } = {}) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  paintTimbreGlyph(g, 0, 0, w, h, value, { line, axis });
}

/* ------------------------------------------------------------------ *
 * The picker
 *
 * A family dropdown, a slider over that family's range, the row of names under
 * it, a label and the drawn wave — assembled here rather than in either tab.
 *
 * The Play tab sets the timbre a part is re-synthesised in; the Write tab sets
 * the timbre a flag placed on the score will change it to. Those are different
 * jobs, but they are choices from the same list, and a list written out twice
 * is a list that eventually says two different things — a shape offered where
 * a flag is placed and missing where playback is set would be a flag that
 * cannot be reached, or worse, one that plays as something else. So both build
 * the control from TIMBRE_FAMILIES through this, and correspondence is a
 * property of there being one implementation rather than of remembering.
 * ------------------------------------------------------------------ */

/**
 * @param {object} els the drawer's own elements
 *        family  <select> for the family — its options are written here
 *        slider  <input type="range"> — its bounds follow the family
 *        ticks   the row of names under the slider
 *        label   optional, gets timbreName()
 *        canvas  optional, gets the drawn wave
 * @param {object} opts
 *        value     what to start on
 *        onInput   every movement, for a live label and a redraw
 *        onChange  on release, for the work too expensive to do per pixel
 *        line/axis colours for the drawn wave
 */
export function createTimbrePicker(els, opts = {}) {
  const { family, slider, ticks, label, canvas } = els;
  const { onInput, onChange, line = '#7ee0c0', axis = '#222a34' } = opts;

  family.innerHTML = '';
  for (const f of TIMBRE_FAMILIES) {
    const o = document.createElement('option');
    o.value = f.id;
    o.textContent = f.label;
    family.append(o);
  }

  let value = opts.value ?? 0;
  /**
   * Where each family was left. Switching away and back returns to the shape
   * that was being worked on rather than to the foot of the range — the two
   * families are alternatives, not a single continuum, so leaving one is not
   * a reason to forget it.
   */
  const last = { wavetable: 0, filtered: FILTERED_MIN };

  function paint() {
    const f = familyFor(family.value);
    slider.min = f.min;
    slider.max = f.max;
    slider.value = value;
    if (ticks.dataset.family !== f.id) {
      ticks.dataset.family = f.id;
      ticks.innerHTML = '';
      for (const t of f.ticks) {
        const s = document.createElement('span');
        s.textContent = t;
        ticks.append(s);
      }
    }
    if (label) label.textContent = timbreName(value);
    if (canvas) drawTimbreWave(canvas, value, { line, axis });
  }

  function setValue(v, notify) {
    value = v;
    last[familyOf(v)] = v;
    family.value = familyOf(v);
    paint();
    if (notify) onInput?.(value);
  }

  family.onchange = () => {
    setValue(last[familyFor(family.value).id], true);
    onChange?.(value);
  };
  slider.oninput = () => setValue(parseFloat(slider.value), true);
  slider.onchange = () => onChange?.(value);

  setValue(value, false);

  return {
    /** Bring the control to a value from elsewhere — a selected flag, a part. */
    set: (v) => setValue(v, false),
    get: () => value,
    /** Redraw against whatever the surroundings now are. */
    refresh: paint,
  };
}
