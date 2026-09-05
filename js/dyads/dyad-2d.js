/* =====================================================================
 *  DYADS — the plot
 * =====================================================================
 *
 * One pane and no second view, because there is nothing for a second view to
 * disagree about: a dyad has one degree of freedom, so the picture is a curve
 * and a curve says where AND how deep in the same mark. The triangle needs a
 * contour map and a lifted surface side by side precisely because it cannot.
 *
 * WHAT IS DRAWN, BOTTOM TO TOP.  The ground, the ruler, the curve — shaded
 * under and stroked over — then the JI lattice stemmed up to it, then the
 * measured listeners, then the cursor. Everything is placed from the two-line
 * mapping in dyad-geometry.js, so a curve index, a screen pixel and an
 * interval are the same point counted three ways and the exporter can emit the
 * whole picture as real vectors.
 *
 * THE VERTICAL AXIS IS TWO DIFFERENT AXES.  With Ratings off it is the model's
 * own range, normalised, and the only honest thing to say about it is which
 * end is which. With Ratings on it is a consonance rating from 0 to 1: the
 * curve is put through the weighted fit in dyad-data.js and drawn as the
 * model's PREDICTION, against the ratings themselves with the spread the
 * listeners produced. That is the one arrangement in which harmonic entropy,
 * sensory dissonance and the Tenney norm can be compared rather than merely
 * looked at in turn.
 * ------------------------------------------------------------------ */

import {
    fitPlot, axisCents, centsTicks, valueAtCents, normalise,
} from './dyad-geometry.js';
import {
    dyadFill, dyadLine, dyadDots, dyadLabels, dyadSnap, dyadRatings,
    dyadSpan, cursor,
} from './dyad-state.js';
import {
    currentDyads, currentCurve, complexityRange, modelName, ratedComplexity,
} from './dyad-curve.js';
import { RATINGS, fitRatings } from './dyad-data.js';
import { currentLayoutMode } from '../globals.js';
import { colormapAt, isLightGround, groundCss } from '../calculations/color-mapping.js';

/** The colour layout the whole app is currently set to. */
export function colormap() { return colormapAt(currentLayoutMode); }
/** Its ramp — what the fill, the marks and the curve are coloured by. */
export function colormapFn() { return colormap().ramp; }
/** Whether that layout's ground is light, which every other colour follows. */
export function onLight() { return isLightGround(colormap().ground); }
/** The ground itself — cream, blush and sage as readily as black or white. */
export function groundColor() { return colormap().ground; }

let canvas = null;
let ctx = null;
let fit = null;
let onGesture = null;

/* The panel settings the last paint was made with. The pointer handlers need
   the axis to turn a pixel into an interval, and an event carries no arguments
   — so the drawer leaves them here rather than every caller passing them
   twice. */
let opts = { equaveRatio: 2, baseSize: 1, scalingFactor: 2, enableSize: true, enableColor: true };

export function attach2D(el, gestureHandler) {
    canvas = el;
    ctx = canvas.getContext('2d');
    onGesture = gestureHandler;
    bindPointer();
    return { draw, resize, hitTest, geometry: () => fit };
}

export function resize() {
    if (!canvas) return;
    const parent = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fit = fitPlot(w, h);
}

/* ---------------------------------------------------------------------
 *  Which vertical axis is in force
 *
 *  Worked out once per paint and handed to everything that draws, so the
 *  curve, the lattice stems, the ratings and the cursor cannot come to
 *  disagree about what a height means.
 *
 *  There are two independent questions here and four answers between them.
 *
 *  WHAT IS BEING MEASURED. Either one of the three continuous models, which
 *  has a value at every point of the axis and is therefore drawn as a curve;
 *  or the Complexity drawer's own measure, which has a value only AT the
 *  ratios and is therefore drawn as the height of the lattice and nothing
 *  else. Both are real answers to "how complex is this interval", and putting
 *  them on the same axis under the same switch is the point of the mode.
 *
 *  WHAT THE HEIGHT MEANS. With Ratings off it is the measure's own range,
 *  normalised, and the only honest thing to say about it is which end is
 *  which — the units of harmonic entropy and of the Wilson norm have no
 *  relation whatever. With Ratings on it is a consonance rating from 0 to 1:
 *  whichever measure is up is put through the weighted fit in dyad-data.js and
 *  drawn as its PREDICTION, against the ratings themselves with the spread the
 *  listeners produced. That is the one arrangement in which all nine measures
 *  can be compared rather than merely looked at in turn.
 * ------------------------------------------------------------------ */

/**
 * @returns {{curved: boolean, fitted: boolean, at: (c:number)=>number,
 *            ofDyad: (d:object)=>number, place: (v:number)=>number,
 *            lo: number, hi: number, title: string, ticksInside: boolean,
 *            ticks: Array<[number,string]>, r2: number|null, n: number}}
 *   `at` is the curve's height 0..1 at an interval, NaN when there is no
 *   curve; `ofDyad` is the height of one lattice mark, which is defined in
 *   every case.
 */
export function verticalAxis(o) {
    const curve = currentCurve();
    const curved = !!curve;
    const C = axisCents(o.equaveRatio, dyadSpan);

    /* The measure at each rated ratio, which is what the fit is made from.
       A curve is read off at the ratio's cents; a discrete measure is looked
       up in the table Python computed from the ratios' own numbers, because
       several of them are outside the current limit and have no lattice mark
       to be read off. */
    const ratedValues = curved
        ? RATINGS.map((r) => (r.cents > C + 1e-6 ? NaN : valueAtCents(curve, r.cents, C)))
        : ratedComplexity(o.complexityMethod);

    const range = complexityRange();
    const norm = (x) => {
        const span = range.hi - range.lo;
        return span > 1e-12 ? (x - range.lo) / span : 0.5;
    };

    if (dyadRatings) {
        const model = fitRatings(ratedValues, C);
        /* The rating axis is drawn a little beyond 0 and 1: a fitted line is
           not obliged to stay inside the range it was fitted to, and clipping
           the prediction where it leaves would hide exactly the places the
           measure is worst. */
        const lo = -0.08, hi = 1.08;
        const place = (v) => (v - lo) / (hi - lo);
        const predict = (x) => (model && x === x ? place(model.a + model.b * x) : NaN);
        return {
            curved,
            fitted: !!model,
            at: (c) => (curved ? predict(valueAtCents(curve, c, C)) : NaN),
            ofDyad: (d) => (curved ? predict(valueAtCents(curve, d.c, C)) : predict(d.complexity)),
            place,
            lo, hi,
            title: 'consonance rating',
            ticks: [[place(0), '0'], [place(0.5), '.5'], [place(1), '1']],
            ticksInside: false,
            r2: model ? model.r2 : null,
            n: model ? model.n : 0,
        };
    }

    /* The measure's own range. A discrete measure counts UPWARD with
       complexity, so it is inverted here to keep "concordant is high" true of
       every axis this plot can be set to — the three continuous models already
       return it that way round. */
    const title = curved ? modelName() : `${o.complexityMethod} norm`;
    return {
        curved,
        fitted: false,
        at: (c) => (curved ? normalise(curve, valueAtCents(curve, c, C)) : NaN),
        ofDyad: (d) => (curved
            ? normalise(curve, valueAtCents(curve, d.c, C))
            : 0.06 + 0.9 * (1 - norm(d.complexity))),
        place: (v) => v,
        lo: 0, hi: 1,
        title,
        /* The units are the measure's own and mean nothing next to another
           measure's, so the axis is marked as a DIRECTION rather than as a
           quantity — and a word is too wide for the margin a number fits in,
           so these two are set inside the box. The Ratings overlay is where
           numbers become comparable, and where the margin is wanted again. */
        ticks: curved ? [[0, 'discordant'], [1, 'concordant']]
                      : [[0, 'complex'], [1, 'simple']],
        ticksInside: true,
        r2: null,
        n: 0,
    };
}

/* ---------------------------------------------------------------------
 *  Drawing
 * ------------------------------------------------------------------ */

const rgbOf = (c) => `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;

/**
 * @param {object} o the settings the drawer reads out of the panel:
 *        equaveRatio, enableSize, enableColor, baseSize, scalingFactor
 */
export function draw(o) {
    if (!ctx || !fit) return;
    opts = o;
    const w = canvas.clientWidth, h = canvas.clientHeight;

    ctx.clearRect(0, 0, w, h);
    /* The layout's own ground, not a black-or-white guess: the bright layouts
       sit on tinted paper, and a pane painted hard white behind them would
       show the tint as a rectangle floating on a lamp. */
    ctx.fillStyle = groundCss(groundColor());
    ctx.fillRect(0, 0, w, h);

    const C = axisCents(o.equaveRatio, dyadSpan);
    const axis = verticalAxis(o);

    drawFrame(o, C, axis);
    drawCurve(o, C, axis);
    drawLattice(o, C, axis);
    if (dyadRatings) drawRatings(o, C, axis);
    drawCursor(o, C, axis);
}

const ink = (a) => (onLight() ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`);

/** The box, the cents ruler along the bottom, and whatever the y axis is. */
function drawFrame(o, C, axis) {
    const { x0, x1, y0, y1 } = fit;
    const { step, ticks } = centsTicks(C);

    ctx.lineWidth = 1;
    ctx.font = '10px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';

    /* Verticals every tick, labelled every third — a ruler you can count
       along without one that shouts over the curve. */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ticks.forEach((c, i) => {
        const [x] = fit.toPx(c / C, 0);
        const major = i % 3 === 0;
        ctx.strokeStyle = ink(major ? 0.16 : 0.08);
        ctx.beginPath();
        ctx.moveTo(x, y0); ctx.lineTo(x, y1);
        ctx.stroke();
        if (major || step >= 200) {
            ctx.fillStyle = ink(0.55);
            ctx.fillText(String(Math.round(c)), x, y0 + 7);
        }
    });

    ctx.fillStyle = ink(0.45);
    ctx.fillText('cents', (x0 + x1) / 2, y0 + 24);

    /* The horizontals are the y axis's own marks, which is why they come from
       it rather than being counted here: an axis of ratings has real numbers
       on it and an axis of model units has only a direction. */
    ctx.textAlign = axis.ticksInside ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    for (const [v, label] of axis.ticks) {
        const [, y] = fit.toPx(0, v);
        if (y < y1 - 1 || y > y0 + 1) continue;
        if (!axis.ticksInside) {
            ctx.strokeStyle = ink(0.12);
            ctx.beginPath();
            ctx.moveTo(x0, y); ctx.lineTo(x1, y);
            ctx.stroke();
        }
        ctx.fillStyle = ink(0.55);
        /* Nudged off the edge it is nearest, so a word set inside the box at
           the very top or the very bottom is not half over the frame. */
        const inset = axis.ticksInside ? (v > 0.5 ? 9 : -9) : 0;
        ctx.fillText(label, axis.ticksInside ? x0 + 6 : x0 - 7, y + inset);
    }

    ctx.strokeStyle = ink(onLight() ? 0.45 : 0.35);
    ctx.strokeRect(x0, y1, x1 - x0, y0 - y1);

    /* The axis title runs up the left edge, which is where a reader looks for
       what the height means and is the only place it fits without crowding
       the plot. */
    ctx.save();
    ctx.translate(14, (y0 + y1) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink(0.5);
    ctx.fillText(axis.title, 0, 0);
    ctx.restore();
}

/**
 * The measure itself.
 *
 * Shaded under and stroked over, independently. The shading is coloured by
 * HEIGHT rather than by position, so the ramp says the same thing the height
 * does and the two readings reinforce each other — which is what makes a
 * colour layout mean something on a curve at all.
 */
function drawCurve(o, C, axis) {
    const curve = currentCurve();
    if (!curve) return;
    const { x0, x1, y0, y1 } = fit;
    const map = colormapFn();

    /* One sample per pixel column. The model is computed at 1600 samples and
       the pane is rarely wider than that, so this is the finer of the two
       grids either way and there is nothing to gain by walking the coarser. */
    const cols = Math.max(2, Math.round(x1 - x0));
    const ys = new Float64Array(cols);
    const vs = new Float64Array(cols);
    for (let i = 0; i < cols; i++) {
        const t = i / (cols - 1);
        vs[i] = axis.at(t * C);
        ys[i] = y0 - Math.min(1, Math.max(0, vs[i])) * (y0 - y1);
    }

    const path = new Path2D();
    path.moveTo(x0, ys[0]);
    for (let i = 1; i < cols; i++) path.lineTo(x0 + i, ys[i]);

    if (dyadFill) {
        const area = new Path2D(path);
        area.lineTo(x1, y0);
        area.lineTo(x0, y0);
        area.closePath();
        ctx.save();
        ctx.clip(area);
        /* Column by column through the ramp. A gradient object would be
           tidier and would also be a lie: the ramp is not linear in the value,
           so its stops would have to be sampled anyway. */
        for (let i = 0; i < cols; i++) {
            const v = Math.min(1, Math.max(0, vs[i]));
            const c = map(v === v ? v : 0);
            ctx.fillStyle = rgbOf(c);
            ctx.fillRect(x0 + i, y1, 1.02, y0 - y1);
        }
        ctx.restore();
    }

    if (dyadLine) {
        ctx.strokeStyle = dyadFill ? ink(0.75) : rgbOf(map(0.72));
        ctx.lineWidth = dyadFill ? 1.2 : 1.8;
        ctx.lineJoin = 'round';
        ctx.stroke(path);
    }
}

/** Isoharmonics' rule: a longer label is drawn smaller, so it stays legible. */
function labelSize(label) {
    const digits = Math.max(3, (label.match(/\d/g) || []).length);
    return Math.max(4.5, 11 * Math.pow(0.79370046571, digits - 3));
}

function dyadColor(d, range, enableColor, scaling) {
    if (!enableColor) return onLight() ? '#111' : '#fff';
    const span = range.hi - range.lo;
    const norm = span > 1e-12 ? (d.complexity - range.lo) / span : 0.5;
    const v = Math.min(1, Math.max(0, (1 - norm) * (scaling / 2)));
    return rgbOf(colormapFn()(v));
}

/**
 * The just intervals, stemmed up to the curve.
 *
 * A stem rather than a bare dot because the mark has to say two things at
 * once: WHERE the interval is, which is a position along the ruler, and WHAT
 * THE MODEL SAYS ABOUT IT, which is a height. A dot floating at the height
 * would leave the reader measuring back down to the axis by eye.
 *
 * Labels are placed simplest-first and any that would collide with one already
 * placed is dropped. A 13-limit over two equaves is a hundred intervals, and
 * without this the important names are the ones buried: 3/2 would be overdrawn
 * by 27/16 for no better reason than that it came later in the list.
 */
function drawLattice(o, C, axis) {
    if (!dyadDots && !dyadLabels) return;
    const dyads = currentDyads();
    if (!dyads.length) return;

    const { y0, y1 } = fit;
    const range = complexityRange();
    const span = range.hi - range.lo;
    const base = Math.max(1.2, 3.4 * o.baseSize);

    /* The axis knows how tall a mark is under every setting — read off a
       curve, or taken from the mark's own complexity when the measure is one
       of the discrete six. A mark whose height cannot be worked out at all
       stands on the floor rather than vanishing. */
    const heightOf = (d) => {
        const v = axis.ofDyad(d);
        return v === v ? Math.min(1, Math.max(0, v)) : 0.06;
    };

    const placed = [];
    const simplestFirst = dyads.slice().sort((a, b) => a.complexity - b.complexity);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    /* Two passes: the stems and dots in the set's own order, so the simplest
       are painted last and land on top; then the labels simplest-first, so the
       simplest are the ones that survive the collision test. */
    for (const d of dyads) {
        if (d.c > C + 1e-6) continue;
        const [x] = fit.toPx(d.c / C, 0);
        const y = y0 - heightOf(d) * (y0 - y1);
        const color = dyadColor(d, range, o.enableColor, o.scalingFactor);

        if (dyadDots) {
            let r = base;
            if (o.enableSize) {
                const norm = span > 1e-12 ? (d.complexity - range.lo) / span : 0.5;
                r = base * (1 + (1 - norm) * (o.scalingFactor - 1));
            }
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.5;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y0); ctx.lineTo(x, y);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, Math.max(0.6, r), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    if (!dyadLabels) return;
    for (const d of simplestFirst) {
        if (d.c > C + 1e-6) continue;
        const size = labelSize(d.label) * o.baseSize;
        if (size < 4) continue;
        const [x] = fit.toPx(d.c / C, 0);
        const y = y0 - heightOf(d) * (y0 - y1);

        ctx.font = `${size.toFixed(1)}px monospace`;
        const half = ctx.measureText(d.label).width / 2 + 2;
        /* The unison sits on the left edge and the equave on the right, so
           their names would hang half outside the frame if they were simply
           centred on the mark. Nudged in, which is the one place a label is
           allowed not to be centred on what it names. */
        const lx = Math.min(fit.x1 - half, Math.max(fit.x0 + half, x));
        const top = y - (dyadDots ? base + 2 : 0);
        if (placed.some((p) => Math.abs(p.x - lx) < p.half + half
                            && Math.abs(p.y - top) < size + 2)) continue;
        placed.push({ x: lx, half, y: top });

        ctx.fillStyle = dyadColor(d, range, o.enableColor, o.scalingFactor);
        ctx.fillText(d.label, lx, top);
    }
}

/**
 * The measured listeners.
 *
 * A point at the mean and a bar at one standard deviation either side, in the
 * ink colour rather than through the colormap: these are not a value the
 * colormap is a scale of, they are the thing the whole plot is being judged
 * against, and they must not read as one more layer of the model.
 */
function drawRatings(o, C, axis) {
    const { y0, y1 } = fit;
    const at = (v) => y0 - axis.place(v) * (y0 - y1);

    /* Drawn twice: a wider stroke in the ground colour, then the mark itself
       over it. The fill under these runs the whole colormap — a point can land
       on hard yellow or on deep indigo — and a single-coloured mark is
       illegible against one end or the other whichever colour it is given. The
       halo makes it legible against both without tinting it, which matters
       because these are the one thing on the plot that is NOT a value the
       colormap is a scale of. */
    const bars = [];
    for (const r of RATINGS) {
        if (r.cents > C + 1e-6) continue;
        const [x] = fit.toPx(r.cents / C, 0);
        const yhi = at(Math.min(axis.hi, r.mean + r.sd));
        const ylo = at(Math.max(axis.lo, r.mean - r.sd));
        bars.push([x, at(r.mean), ylo, yhi]);
    }

    for (const pass of [0, 1]) {
        ctx.strokeStyle = pass === 0 ? groundCss(groundColor()) : ink(0.85);
        ctx.fillStyle = pass === 0 ? groundCss(groundColor()) : ink(0.95);
        ctx.lineWidth = pass === 0 ? 3.2 : 1.1;
        for (const [x, ym, ylo, yhi] of bars) {
            ctx.beginPath();
            ctx.moveTo(x, ylo); ctx.lineTo(x, yhi);
            ctx.moveTo(x - 3, ylo); ctx.lineTo(x + 3, ylo);
            ctx.moveTo(x - 3, yhi); ctx.lineTo(x + 3, yhi);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(x, ym, pass === 0 ? 3.9 : 2.6, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

/**
 * Where the pointer is, and what is there.
 *
 * The readout is on the plot rather than only in the notation panel because
 * the number the mode is about — what this measure says about THIS interval —
 * has nowhere else to appear.
 */
function drawCursor(o, C, axis) {
    if (!cursor.live) return;
    const { y0, y1, x0, x1 } = fit;
    const [x] = fit.toPx(Math.min(1, Math.max(0, cursor.c / C)), 0);
    const line = onLight() ? '#111' : '#fff';

    ctx.strokeStyle = line;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y0); ctx.lineTo(x, y1);
    ctx.stroke();

    const v = axis.at(cursor.c);
    if (v === v) {
        const y = y0 - Math.min(1, Math.max(0, v)) * (y0 - y1);
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.stroke();
    }

    const curve = currentCurve();
    const raw = curve ? valueAtCents(curve, cursor.c, C) : NaN;
    const parts = [`${Math.round(cursor.c)}¢`];
    if (axis.fitted && v === v) parts.push(`${(axis.lo + v * (axis.hi - axis.lo)).toFixed(2)} predicted`);
    else if (raw === raw) parts.push(raw.toFixed(3));

    const text = parts.join('  ·  ');
    ctx.font = '11px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
    const wide = ctx.measureText(text).width;
    /* Flipped to the other side near the right edge, so the readout never
       runs off the pane the drag has just reached the end of. */
    const left = x + 8 + wide + 8 > x1 ? x - 8 - wide - 8 : x + 8;

    ctx.fillStyle = onLight() ? 'rgba(255,255,255,.86)' : 'rgba(0,0,0,.72)';
    ctx.fillRect(left, y1 + 6, wide + 8, 18);
    ctx.strokeStyle = ink(0.25);
    ctx.lineWidth = 1;
    ctx.strokeRect(left, y1 + 6, wide + 8, 18);
    ctx.fillStyle = line;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + 4, y1 + 15);
}

/* ---------------------------------------------------------------------
 *  The gesture
 *
 *  Pointer events with capture, exactly as the triangle takes them: a drag
 *  that leaves the pane keeps sounding and keeps being followed, so running
 *  off the edge slides along it instead of cutting the note off.
 * ------------------------------------------------------------------ */
function bindPointer() {
    canvas.style.touchAction = 'none';

    canvas.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        canvas.setPointerCapture(ev.pointerId);
        ev.preventDefault();
        onGesture?.('down', locate(ev));
    });

    canvas.addEventListener('pointermove', (ev) => {
        if (!canvas.hasPointerCapture?.(ev.pointerId)) return;
        ev.preventDefault();
        onGesture?.('move', locate(ev));
    });

    const up = (ev) => {
        if (!canvas.hasPointerCapture?.(ev.pointerId)) return;
        canvas.releasePointerCapture(ev.pointerId);
        onGesture?.('up', null);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
}

function locate(ev) {
    const r = canvas.getBoundingClientRect();
    return hitTest(ev.clientX - r.left, ev.clientY - r.top);
}

/**
 * A point in this pane's pixels, as an interval.
 *
 * Only the horizontal is read: the height is the model's answer, not an input,
 * so a drag anywhere in the box is a drag along the axis. That is deliberate —
 * it means the whole pane is playable rather than only the hairline of the
 * curve itself.
 *
 * Snapping is done in PIXELS rather than in cents, so it means the same thing
 * at every axis width: the question a hand is asking is "am I near that mark",
 * and a mark is a fixed size on screen.
 */
export function hitTest(px, py, o = opts) {
    if (!fit) return null;
    const C = axisCents(o?.equaveRatio ?? 2, dyadSpan);
    const [t] = fit.toUnit(px, py);
    const c = Math.min(C, Math.max(0, t * C));

    if (dyadSnap > 0 && (dyadDots || dyadLabels)) {
        const snapped = nearestDyad(px, C);
        if (snapped) return { c: snapped.c, label: snapped.label, snapped: true };
    }
    return { c, label: null, snapped: false };
}

function nearestDyad(px, C) {
    let best = null, bestD = dyadSnap;
    for (const d of currentDyads()) {
        if (d.c > C + 1e-6) continue;
        const [x] = fit.toPx(d.c / C, 0);
        const dist = Math.abs(x - px);
        if (dist <= bestD) { bestD = dist; best = d; }
    }
    return best;
}
