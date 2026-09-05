/* =====================================================================
 *  TRIADS — the topological pane
 * =====================================================================
 *
 * The triangle drawn flat: the field as a shaded ground, as contour lines, or
 * as both, with the JI lattice over it and the cursor on top.
 *
 * WHY A CANVAS AND NOT A PICTURE.  Isoharmonics asks matplotlib for a PNG and
 * blits it. That settles the colours, the contour count and the resolution at
 * generation time, so changing any of them means recomputing the model — and
 * it puts the dots in a different coordinate system from the image they sit
 * on, which is why that app has to hunt for the corners of its own triangle
 * with a convex hull before it can lift the thing into 3D. Here the field is
 * kept as numbers and every mark on this canvas — the shading, the lines, the
 * dots, the labels, the cursor — is placed from the same three-line mapping in
 * triad-geometry.js. Recolouring is a repaint, not a regeneration, and the
 * exporter can emit real vectors because it is drawing from the same numbers
 * rather than tracing a bitmap.
 * ------------------------------------------------------------------ */

import {
    fitTriangle, centsToShape, shapeToCents, clampCents, equaveCents,
    sampleField, normalise, SQRT3_2,
} from './triad-geometry.js';
import {
    triadFill, triadLines, triadContours, triadDots, triadLabels, triadSnap,
    triadRelief, cursor,
} from './triad-state.js';
import { currentTriads, currentField, complexityRange } from './triad-surface.js';
import { currentLayoutMode } from '../globals.js';
import { colormapAt } from '../calculations/color-mapping.js';

/** The colour layout the whole app is currently set to. */
export function colormap() { return colormapAt(currentLayoutMode); }
/** Its ramp — what dots, contours and gradient shading are coloured by. */
export function colormapFn() { return colormap().ramp; }
/** Whether that layout is drawn on white, which every other colour follows. */
export function onLight() { return colormap().ground === 0xffffff; }
/** Its material, if it is a lit layout rather than a value-coloured one. */
export function colormapMaterial() { return colormap().material; }

let canvas = null;
let ctx = null;
let fit = null;
let onGesture = null;

/* The panel settings the last paint was made with. The pointer handlers need
   the equave to turn a pixel into a chord, and an event carries no arguments —
   so the drawer leaves them here rather than every caller passing them twice. */
let opts = { equaveRatio: 2, baseSize: 1, scalingFactor: 2, enableSize: true, enableColor: true };

/* The shaded ground, painted once per field-and-colormap at the field's own
   resolution and then scaled up. Repainting 150,000 pixels on every pointer
   move would cost more than everything else on the canvas together. */
let shade = null;
let shadeKey = '';

/* Contour segments in shape coordinates, likewise cached: marching squares
   over the whole grid is not a per-frame cost. */
let contours = null;
let contourKey = '';

export function attach2D(el, gestureHandler) {
    canvas = el;
    ctx = canvas.getContext('2d');
    onGesture = gestureHandler;
    bindPointer();
    return { draw, resize, invalidate, hitTest, geometry: () => fit };
}

/** Throw the cached paint away — a new field, a new colormap, a new level. */
export function invalidate() { shadeKey = ''; contourKey = ''; }

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
    fit = fitTriangle(w, h);
}

/* ---------------------------------------------------------------------
 *  The shaded ground
 * ------------------------------------------------------------------ */
function buildShade(field) {
    const key = `${field.w}x${field.h}|${currentLayoutMode}|${triadRelief}|${field.min}|${field.max}`;
    if (key === shadeKey && shade) return shade;

    const off = document.createElement('canvas');
    off.width = field.w;
    off.height = field.h;
    const octx = off.getContext('2d');
    const img = octx.createImageData(field.w, field.h);

    const material = colormapMaterial();
    if (material) paintHillshade(field, img, material);
    else paintRamp(field, img);

    octx.putImageData(img, 0, 0);
    shade = off;
    shadeKey = key;
    return shade;
}

/** Value becomes hue: the ordinary reading, and what most layouts do. */
function paintRamp(field, img) {
    const map = colormapFn();
    for (let y = 0; y < field.h; y++) {
        // Row 0 of the field is the baseline; row 0 of an image is the top.
        const src = (field.h - 1 - y) * field.w;
        for (let x = 0; x < field.w; x++) {
            const v = field.z[src + x];
            const o = (y * field.w + x) * 4;
            if (!(v === v)) { img.data[o + 3] = 0; continue; }
            const c = map(normalise(field, v));
            img.data[o] = Math.round(c.r * 255);
            img.data[o + 1] = Math.round(c.g * 255);
            img.data[o + 2] = Math.round(c.b * 255);
            img.data[o + 3] = 255;
        }
    }
}

/* The light, in the flat pane. Up and to the left, which is the convention
   every relief map is read by — reverse it and the eye turns every summit
   into a pit. Kept in step with the key light in the lifted pane, so the two
   panes are the same surface under the same lamp. */
const LIGHT = (() => {
    const v = [-0.55, 0.62, 0.56];
    const n = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / n, v[1] / n, v[2] / n];
})();

/**
 * The field as a lit surface seen from directly above.
 *
 * A material layout has one colour, so shading it by value would give a flat
 * plate. Instead the field's own slope is used: the gradient at each cell is a
 * surface normal, the normal is lit by the same lamp the 3D pane uses, and
 * what you get is the relief — the identical information, carried by light
 * rather than by hue. A ridge a ramp would flatten into one band of colour
 * shows up as a ridge, which is the whole reason for the layout.
 *
 * Relief scales the gradient, so the Display drawer's one control governs how
 * pronounced the surface is in BOTH panes.
 */
function paintHillshade(field, img, material) {
    const body = {
        r: ((material.color >> 16) & 255) / 255,
        g: ((material.color >> 8) & 255) / 255,
        b: (material.color & 255) / 255,
    };
    const spec = {
        r: ((material.specular >> 16) & 255) / 255,
        g: ((material.specular >> 8) & 255) / 255,
        b: (material.specular & 255) / 255,
    };
    const ambient = material.ambient ?? 0.3;
    const span = Math.max(1e-9, field.max - field.min);
    /* The gradient is per-cell, so a coarse grid has bigger steps for the same
       surface — normalising by the cell width keeps the lighting the same at
       every resolution. */
    const scale = (triadRelief * field.w) / 3;

    const at = (x, y) => {
        const cx = Math.min(field.w - 1, Math.max(0, x));
        const cy = Math.min(field.h - 1, Math.max(0, y));
        const v = field.z[cy * field.w + cx];
        return v === v ? (v - field.min) / span : NaN;
    };

    for (let y = 0; y < field.h; y++) {
        const row = field.h - 1 - y;
        for (let x = 0; x < field.w; x++) {
            const o = (y * field.w + x) * 4;
            const c = at(x, row);
            if (!(c === c)) { img.data[o + 3] = 0; continue; }

            /* Central differences, falling back to the centre where a
               neighbour is outside the triangle — otherwise every boundary
               cell would light as a cliff. */
            const l = at(x - 1, row), r = at(x + 1, row);
            const d = at(x, row - 1), u = at(x, row + 1);
            const dx = ((r === r ? r : c) - (l === l ? l : c)) * 0.5 * scale;
            const dy = ((u === u ? u : c) - (d === d ? d : c)) * 0.5 * scale;

            let nx = -dx, ny = 1, nz = -dy;
            const nl = Math.hypot(nx, ny, nz);
            nx /= nl; ny /= nl; nz /= nl;

            const lambert = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
            const diffuse = ambient + (1 - ambient) * lambert;

            /* Blinn-Phong, with the eye directly overhead — the half-vector is
               therefore fixed, which is what makes this cheap enough to run
               over every cell of the grid. */
            let hx = LIGHT[0], hy = LIGHT[1] + 1, hz = LIGHT[2];
            const hl = Math.hypot(hx, hy, hz);
            hx /= hl; hy /= hl; hz /= hl;
            const highlight = Math.pow(
                Math.max(0, nx * hx + ny * hy + nz * hz), material.shininess ?? 30);

            /* The same restraint the lit pane's material is given: specular
               is added on top of an already-lit body, so it is kept dim and
               tight or it clips whole slopes to flat white. */
            img.data[o] = Math.round(255 * Math.min(1, body.r * diffuse + spec.r * highlight));
            img.data[o + 1] = Math.round(255 * Math.min(1, body.g * diffuse + spec.g * highlight));
            img.data[o + 2] = Math.round(255 * Math.min(1, body.b * diffuse + spec.b * highlight));
            img.data[o + 3] = 255;
        }
    }
}

/* ---------------------------------------------------------------------
 *  Contours
 *
 *  Marching squares, in shape coordinates so a resize is free. Cells with a
 *  NaN corner are skipped outright rather than being given a fill value: the
 *  edge of the triangle is a cliff in the data, and a level line traced across
 *  it would be an artefact of the mask rather than a contour of the model.
 * ------------------------------------------------------------------ */
function buildContours(field, levels) {
    const key = `${field.w}x${field.h}|${levels}|${field.min}|${field.max}`;
    if (key === contourKey && contours) return contours;

    const segs = [];
    const span = field.max - field.min;
    if (!(span > 1e-12)) { contours = segs; contourKey = key; return segs; }

    const sx = 1 / (field.w - 1);
    const sy = 1 / (field.h - 1);

    for (let l = 1; l <= levels; l++) {
        const t = field.min + (span * l) / (levels + 1);
        for (let y = 0; y < field.h - 1; y++) {
            for (let x = 0; x < field.w - 1; x++) {
                const a = field.z[y * field.w + x];
                const b = field.z[y * field.w + x + 1];
                const c = field.z[(y + 1) * field.w + x + 1];
                const d = field.z[(y + 1) * field.w + x];
                if (!(a === a && b === b && c === c && d === d)) continue;

                const code = (a > t ? 1 : 0) | (b > t ? 2 : 0) | (c > t ? 4 : 0) | (d > t ? 8 : 0);
                if (code === 0 || code === 15) continue;

                const lerp = (p, q) => (t - p) / (q - p);
                const bottom = () => [(x + lerp(a, b)) * sx, y * sy];
                const right = () => [(x + 1) * sx, (y + lerp(b, c)) * sy];
                const top = () => [(x + lerp(d, c)) * sx, (y + 1) * sy];
                const left = () => [x * sx, (y + lerp(a, d)) * sy];

                const push = (p, q) => segs.push(p[0], p[1], q[0], q[1], l / (levels + 1));

                switch (code) {
                    case 1: case 14: push(left(), bottom()); break;
                    case 2: case 13: push(bottom(), right()); break;
                    case 3: case 12: push(left(), right()); break;
                    case 4: case 11: push(right(), top()); break;
                    case 6: case 9: push(bottom(), top()); break;
                    case 7: case 8: push(left(), top()); break;
                    /* The two saddles. Split them the same way every time —
                       either choice is defensible and an inconsistent one
                       leaves the map with contours that cross. */
                    case 5: push(left(), bottom()); push(right(), top()); break;
                    case 10: push(left(), top()); push(bottom(), right()); break;
                }
            }
        }
    }
    contours = segs;
    contourKey = key;
    return segs;
}

/* ---------------------------------------------------------------------
 *  The lattice
 * ------------------------------------------------------------------ */

/** Isoharmonics' rule: a longer label is drawn smaller, so the map stays legible. */
function labelSize(label) {
    const digits = Math.max(3, (label.match(/\d/g) || []).length);
    return Math.max(4.5, 11 * Math.pow(0.79370046571, digits - 3));
}

function triadColor(t, range, enableColor, scaling) {
    if (!enableColor) return onLight() ? '#111' : '#fff';
    const span = range.hi - range.lo;
    const norm = span > 1e-12 ? (t.complexity - range.lo) / span : 0.5;
    const v = Math.min(1, Math.max(0, (1 - norm) * (scaling / 2)));
    const c = colormapFn()(v);
    return `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
}

/* ---------------------------------------------------------------------
 *  Drawing
 * ------------------------------------------------------------------ */

/**
 * @param {object} o  the settings the drawer reads out of the panel:
 *        equaveRatio, enableSize, enableColor, baseSize, scalingFactor
 */
export function draw(o) {
    if (!ctx || !fit) return;
    opts = o;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const light = onLight();

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = light ? '#ffffff' : '#000000';
    ctx.fillRect(0, 0, w, h);

    const [v0, v1, v2] = fit.vertices();
    const path = new Path2D();
    path.moveTo(v0[0], v0[1]); path.lineTo(v1[0], v1[1]); path.lineTo(v2[0], v2[1]); path.closePath();

    const field = currentField();

    ctx.save();
    ctx.clip(path);

    if (field && triadFill) {
        const img = buildShade(field);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, fit.originX, fit.originY - fit.side * SQRT3_2,
                      fit.side, fit.side * SQRT3_2);
    } else {
        /* No field, or fill turned off: a plain ground, dark or light with the
           layout, so the lattice keeps the contrast it was coloured for. */
        ctx.fillStyle = light ? '#f2f3f6' : '#0b0c10';
        ctx.fill(path);
    }

    if (field && triadLines) {
        const segs = buildContours(field, triadContours);
        const map = colormapFn();
        ctx.lineWidth = 1.1;
        for (let i = 0; i < segs.length; i += 5) {
            const c = map(segs[i + 4]);
            ctx.strokeStyle = triadFill
                ? `rgba(${light ? '0,0,0' : '255,255,255'},0.30)`
                : `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
            const p0 = fit.toPx(segs[i], segs[i + 1]);
            const p1 = fit.toPx(segs[i + 2], segs[i + 3]);
            ctx.beginPath();
            ctx.moveTo(p0[0], p0[1]);
            ctx.lineTo(p1[0], p1[1]);
            ctx.stroke();
        }
    }

    ctx.restore();

    /* The outline last of the ground marks, so the shading cannot bleed past
       it and the triangle always reads as a closed shape. */
    ctx.strokeStyle = light ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.35)';
    ctx.lineWidth = 1;
    ctx.stroke(path);

    drawLattice(o);
    drawCursor(o);
}

function drawLattice(o) {
    if (!triadDots && !triadLabels) return;
    const triads = currentTriads();
    if (!triads.length) return;

    const E = equaveCents(o.equaveRatio);
    const range = complexityRange();
    const span = range.hi - range.lo;
    const base = Math.max(1.2, 3.6 * o.baseSize);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const t of triads) {
        if (t.c1 + t.c2 > E + 1e-6) continue;
        const { gx, gy } = centsToShape(t.c1, t.c2, E);
        const [x, y] = fit.toPx(gx, gy);
        const color = triadColor(t, range, o.enableColor, o.scalingFactor);

        if (triadDots) {
            let r = base;
            if (o.enableSize) {
                const norm = span > 1e-12 ? (t.complexity - range.lo) / span : 0.5;
                r = base * (1 + (1 - norm) * (o.scalingFactor - 1));
            }
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, Math.max(0.6, r), 0, Math.PI * 2);
            ctx.fill();
        }

        if (triadLabels) {
            const size = labelSize(t.label) * o.baseSize;
            if (size < 4) continue;
            ctx.font = `${size.toFixed(1)}px monospace`;
            ctx.fillStyle = color;
            ctx.fillText(t.label, x, triadDots ? y - base - size * 0.6 : y);
        }
    }
}

function drawCursor(o) {
    if (!cursor.live) return;
    const E = equaveCents(o.equaveRatio);
    const { gx, gy } = centsToShape(cursor.c1, cursor.c2, E);
    const [x, y] = fit.toPx(gx, gy);
    const ink = onLight() ? '#111' : '#fff';

    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 11, y); ctx.lineTo(x - 3, y);
    ctx.moveTo(x + 3, y); ctx.lineTo(x + 11, y);
    ctx.moveTo(x, y - 11); ctx.lineTo(x, y - 3);
    ctx.moveTo(x, y + 3); ctx.lineTo(x, y + 11);
    ctx.stroke();
}

/* ---------------------------------------------------------------------
 *  The gesture
 *
 *  Pointer events rather than mouse events, and with capture: a drag that
 *  leaves the canvas keeps sounding and keeps being followed, so running off
 *  the edge slides along it instead of cutting the note off. Isoharmonics
 *  stops the sound the moment the pointer leaves the triangle, which makes the
 *  edges of the map unplayable.
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

/** Where a pointer event is, in cents, clamped into the triangle. */
function locate(ev) {
    const r = canvas.getBoundingClientRect();
    return hitTest(ev.clientX - r.left, ev.clientY - r.top);
}

/**
 * A point in this pane's pixels, as a chord.
 *
 * Snapping is done in PIXELS rather than in cents so that it means the same
 * thing wherever you are on the triangle and whatever the equave is: the
 * question a hand is asking is "am I near that dot", and a dot is a fixed size
 * on screen.
 */
export function hitTest(px, py, o = opts) {
    if (!fit) return null;
    const [gx, gy] = fit.toShape(px, py);
    const E = equaveCents(o?.equaveRatio ?? 2);
    const raw = shapeToCents(gx, gy, E);
    const c = clampCents(raw.c1, raw.c2, E);

    if (triadSnap > 0 && (triadDots || triadLabels)) {
        const snapped = nearestTriad(px, py, E);
        if (snapped) return { ...snapped, snapped: true };
    }
    return { c1: c.c1, c2: c.c2, label: null, snapped: false };
}

function nearestTriad(px, py, E) {
    const triads = currentTriads();
    let best = null, bestD2 = triadSnap * triadSnap;
    for (const t of triads) {
        if (t.c1 + t.c2 > E + 1e-6) continue;
        const { gx, gy } = centsToShape(t.c1, t.c2, E);
        const [x, y] = fit.toPx(gx, gy);
        const d2 = (x - px) * (x - px) + (y - py) * (y - py);
        if (d2 <= bestD2) { bestD2 = d2; best = t; }
    }
    return best ? { c1: best.c1, c2: best.c2, label: best.label } : null;
}

/** The cached contour segments, for the SVG exporter. */
export function contourSegments(field, levels) {
    return field ? buildContours(field, levels) : [];
}
