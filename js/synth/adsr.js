/* =====================================================================
 *  THE ADSR EDITOR
 * =====================================================================
 *
 * Drawn in the same scheme as the wave above it — an axis line, one glowing
 * stroke, no chrome — because the two are answering the same question about
 * the same note and a different idiom for each would read as two unrelated
 * instruments. What the wave does for the shape of a cycle, this does for the
 * shape of a note.
 *
 * The envelope is drawn as it is heard: the four segments in proportion to
 * their real durations, with the sustain drawn as a held stretch whose length
 * is a constant rather than a setting — a sustain lasts as long as the key is
 * held, which is not a number the editor has. So the picture is "a note held
 * about long enough to reach sustain", and the three times keep their true
 * proportions against each other inside it.
 *
 * The handles ARE the parameters. There is no slider under this: the corner
 * between attack and decay is the attack time and the peak, the corner after
 * decay is the sustain level, and the foot of the release is the release
 * time. Dragging the thing itself is the shortest path between wanting a
 * longer attack and having one.
 * ------------------------------------------------------------------ */

/** The furthest each time may be dragged, in seconds. */
export const LIMITS = { a: 2, d: 2, r: 4 };

/** The drawn width given to the held part of the note, in "seconds" of x. */
const SUSTAIN_SPAN = 0.6;

const HANDLE_R = 4.5;

/** Total x the curve spans, so the four segments can be laid out in scale. */
function span(e) {
  return e.a + e.d + SUSTAIN_SPAN + e.r;
}

/**
 * The three corners, in canvas coordinates. One source for the drawing and
 * the hit test, so a handle can never be drawn anywhere but where it is
 * grabbed.
 */
function points(e, w, h, pad) {
  const x0 = pad, x1 = w - pad, y0 = pad, y1 = h - pad;
  const sx = (x1 - x0) / span(e);
  const y = (v) => y1 - v * (y1 - y0);
  const peak = { x: x0 + e.a * sx, y: y0 };
  const sus = { x: peak.x + e.d * sx, y: y(e.s) };
  const hold = { x: sus.x + SUSTAIN_SPAN * sx, y: y(e.s) };
  const end = { x: hold.x + e.r * sx, y: y1 };
  return { start: { x: x0, y: y1 }, peak, sus, hold, end, x0, x1, y0, y1, sx };
}

export function drawAdsr(canvas, e, {
  line = '#7ee0c0', axis = '#222a34', grid = '#1b222b', pad = 10, active = null,
} = {}) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr; canvas.height = h * dpr;
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const p = points(e, w, h, pad);

  // The floor the release lands on, and the ceiling the attack reaches.
  g.strokeStyle = axis;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, p.y1 + 0.5); g.lineTo(w, p.y1 + 0.5);
  g.stroke();
  g.strokeStyle = grid;
  g.beginPath();
  g.moveTo(0, p.y0 + 0.5); g.lineTo(w, p.y0 + 0.5);
  g.stroke();

  // The stretch where the key is still down, marked off from the release so
  // the two halves of the envelope are legible as what you do and what
  // happens after.
  g.strokeStyle = grid;
  g.setLineDash([2, 3]);
  g.beginPath();
  g.moveTo(p.hold.x + 0.5, p.y0); g.lineTo(p.hold.x + 0.5, p.y1);
  g.stroke();
  g.setLineDash([]);

  g.strokeStyle = line;
  g.lineWidth = 2;
  g.lineJoin = 'round';
  g.shadowColor = line;
  g.shadowBlur = 6;
  g.beginPath();
  g.moveTo(p.start.x, p.start.y);
  g.lineTo(p.peak.x, p.peak.y);
  g.lineTo(p.sus.x, p.sus.y);
  g.lineTo(p.hold.x, p.hold.y);
  g.lineTo(p.end.x, p.end.y);
  g.stroke();
  g.shadowBlur = 0;

  for (const [name, pt] of [['a', p.peak], ['s', p.sus], ['r', p.end]]) {
    g.beginPath();
    g.arc(pt.x, pt.y, HANDLE_R, 0, Math.PI * 2);
    g.fillStyle = name === active ? line : '#12161c';
    g.strokeStyle = line;
    g.lineWidth = 1.6;
    g.fill();
    g.stroke();
  }
  return p;
}

/**
 * Make a canvas editable.
 *
 * The peak handle carries attack on x; the sustain handle carries decay on x
 * and the sustain level on y — two settings on one corner because that corner
 * IS both of them, and splitting it into two grips would put a handle where
 * the envelope has no corner. The last handle carries release.
 */
export function attachAdsrEditor(canvas, get, set, opts = {}) {
  const pad = opts.pad ?? 10;
  let active = null;
  const redraw = () => drawAdsr(canvas, get(), { ...opts, active });

  const at = (ev) => {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top, w: r.width, h: r.height };
  };

  canvas.addEventListener('pointerdown', (ev) => {
    const q = at(ev);
    const p = points(get(), q.w, q.h, pad);
    let best = null, bd = 18 * 18;
    for (const [name, pt] of [['a', p.peak], ['s', p.sus], ['r', p.end]]) {
      const d = (pt.x - q.x) ** 2 + (pt.y - q.y) ** 2;
      if (d < bd) { bd = d; best = name; }
    }
    if (!best) return;
    active = best;
    try { canvas.setPointerCapture(ev.pointerId); } catch (err) {}
    ev.preventDefault();
    redraw();
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (!active) return;
    const q = at(ev);
    const e = get();
    const p = points(e, q.w, q.h, pad);
    /* Every drag is read as a time in seconds off the same x scale the curve
     * was drawn with, so the handle stays under the pointer. The scale itself
     * shifts as the times change — the curve always fills the box — which is
     * why this recomputes rather than caching a scale at pointerdown. */
    const next = { ...e };
    if (active === 'a') {
      next.a = clamp((q.x - p.x0) / p.sx, 0, LIMITS.a);
    } else if (active === 's') {
      next.d = clamp((q.x - p.peak.x) / p.sx, 0, LIMITS.d);
      next.s = clamp((p.y1 - q.y) / (p.y1 - p.y0), 0, 1);
    } else {
      next.r = clamp((q.x - p.hold.x) / p.sx, 0, LIMITS.r);
    }
    set(next);
    redraw();
  });

  const done = (ev) => {
    if (!active) return;
    active = null;
    try { canvas.releasePointerCapture(ev.pointerId); } catch (err) {}
    redraw();
  };
  canvas.addEventListener('pointerup', done);
  canvas.addEventListener('pointercancel', done);

  return { redraw };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
