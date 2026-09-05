/* =====================================================================
 *  TRIADS — the lifted pane
 * =====================================================================
 *
 * The same field as a surface: height is the value, so a concordance is a
 * summit and the contour map next to it is that summit seen from above.
 *
 * ITS OWN SCENE.  The tetrahedron's renderer is left completely alone. Sharing
 * it would mean sharing a camera whose framing is wrong for a triangle, an
 * OrbitControls the tetrahedron's Play mode switches off, and a key handler
 * that turns the whole scene — and in "Both" the two would have to be on
 * screen at the same time regardless. A second context is the cheap answer.
 *
 * PICKING IS ARITHMETIC, NOT SEARCH.  Isoharmonics finds the chord under the
 * pointer by projecting every hundredth mesh vertex to the screen and taking
 * the nearest, which is slow, misses by up to a hundred vertices, and needs
 * PyOpenGL for the projection. The surface here is a height field over a known
 * triangle, so the ray is intersected with the surface directly by three.js
 * and the hit point IS the chord: its x and y are the two intervals, exactly,
 * with no search and no tolerance.
 * ------------------------------------------------------------------ */

import * as THREE from 'https://unpkg.com/three@0.126.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.126.0/examples/jsm/controls/OrbitControls.js';

import {
    centsToShape, shapeToCents, clampCents, equaveCents,
    sampleField, normalise, SQRT3_2,
} from './triad-geometry.js';
import {
    triadRelief, triadDots, triadLabels, triadSnap, triadFill, triadLines,
    triadContours, cursor,
} from './triad-state.js';
import { currentTriads, currentField, complexityRange } from './triad-surface.js';
import { colormapFn, onLight, contourSegments } from './triad-2d.js';
import { rotationSpeed, autoRotate, autoRotateDir } from '../globals.js';

/** The triangle is drawn one unit on a side, centred on the origin. */
const SIDE = 3.0;

let host = null;
let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let onGesture = null;

let surface = null;      // the mesh, or the flat plate when there is no field
let lattice = null;      // the JI dots
let labels = null;       // the JI labels, as sprites
let lines = null;        // the contour lines, laid on the surface
let marker = null;       // the cursor

let dragging = false;
let opts = { equaveRatio: 2, baseSize: 1, scalingFactor: 2, enableSize: true, enableColor: true };

/** Shape coordinates (and a height) → the scene's own space. */
function place(gx, gy, z = 0) {
    return new THREE.Vector3(
        (gx - 0.5) * SIDE,
        z,
        -(gy * SQRT3_2 - SQRT3_2 / 2) * SIDE,
    );
}

/** And back — the inverse, which is the whole of picking. */
function unplace(p) {
    return {
        gx: p.x / SIDE + 0.5,
        gy: (-p.z / SIDE + SQRT3_2 / 2) / SQRT3_2,
    };
}

export function attach3D(el, gestureHandler) {
    host = el;
    onGesture = gestureHandler;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);
    /* Only a direction — frameCamera works out how far back it has to be once
       the pane has a size and the relief has a height. */
    camera.position.set(0, 2.6, 4.2);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    host.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.minDistance = 1.2;
    controls.maxDistance = 24;

    /* A relief needs raking light to read as a relief at all; a flat plate
       needs none. Both are lit the same way so that switching models does not
       change what the colours look like. */
    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const key = new THREE.DirectionalLight(0xffffff, 0.75);
    key.position.set(2.5, 4, 2);
    scene.add(key);

    marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 20, 14),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    marker.visible = false;
    scene.add(marker);

    bindPointer();
    resize();

    return { draw, resize, rebuild, render, renderer: () => renderer };
}

export function resize() {
    if (!renderer || !host) return;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    frameCamera();
}

/**
 * Pull the camera back to exactly hold the surface, and no further.
 *
 * The pane is not a fixed shape — in "Both" it is half the width it is on its
 * own — so a distance that framed the triangle in one crops it in the other.
 * The distance is therefore solved rather than guessed: the eight corners of
 * the box the surface lives in are put into camera space for the direction
 * currently being looked from, and each one says how far back the camera would
 * have to be for it to clear both edges of the frustum. The furthest such
 * demand wins.
 *
 * A bounding sphere would be simpler and would waste most of the pane: a
 * triangle with a low relief is a wide flat thing, and the sphere that holds
 * it is mostly empty air above and below.
 *
 * Only the distance and the target are set. The DIRECTION is left alone, so a
 * surface the user has turned stays turned when the pane resizes.
 */
function frameCamera() {
    if (!camera || !controls) return;
    const half = SIDE / 2;
    const depth = (SIDE * SQRT3_2) / 2;
    const lift = triadRelief * SIDE;

    /* Aim at the middle of the body of the thing rather than at the ground
       plane, or a tall relief sits in the top half of the pane with the
       bottom half empty. */
    const target = new THREE.Vector3(0, lift / 2, 0);

    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(0, 2.6, 4.2);
    dir.normalize();

    const forward = dir.clone().negate();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    if (!Number.isFinite(right.x)) right.set(1, 0, 0);
    const camUp = new THREE.Vector3().crossVectors(right, forward).normalize();

    const vfov = (camera.fov * Math.PI) / 180;
    const tanV = Math.tan(vfov / 2);
    const tanH = tanV * camera.aspect;

    let distance = camera.near + 0.1;
    for (const sx of [-1, 1]) {
        for (const sy of [0, 1]) {
            for (const sz of [-1, 1]) {
                const corner = new THREE.Vector3(sx * half, sy * lift, sz * depth).sub(target);
                const along = corner.dot(forward);
                const x = Math.abs(corner.dot(right));
                const y = Math.abs(corner.dot(camUp));
                distance = Math.max(distance, along + x / tanH, along + y / tanV);
            }
        }
    }

    controls.target.copy(target);
    camera.position.copy(target).addScaledVector(dir, distance * 1.06);
    camera.updateProjectionMatrix();
    controls.update();
}

/* ---------------------------------------------------------------------
 *  Building the scene
 *
 *  Separated from drawing because it is the expensive half: a 420-square grid
 *  is a hundred thousand vertices, and it only changes when the field, the
 *  relief, the colormap or the lattice does.
 * ------------------------------------------------------------------ */

let builtKey = '';
let builtRelief = null;

export function rebuild(o, force = false) {
    if (!scene) return;
    opts = o;
    const field = currentField();
    const E = equaveCents(o.equaveRatio);
    const key = JSON.stringify([
        field ? [field.w, field.h, field.min, field.max] : null,
        triadRelief, triadFill, triadLines, triadContours, triadDots, triadLabels,
        o.equaveRatio, o.baseSize, o.scalingFactor, o.enableSize, o.enableColor,
        colormapFn().name || '', onLight(), currentTriads().length,
    ]);
    if (!force && key === builtKey) return;
    const reliefChanged = builtRelief !== triadRelief;
    builtKey = key;
    builtRelief = triadRelief;

    scene.background = new THREE.Color(onLight() ? 0xffffff : 0x000000);
    marker.material.color.set(onLight() ? 0x111111 : 0xffffff);

    for (const item of [surface, lattice, labels, lines]) {
        if (item) { scene.remove(item); disposeDeep(item); }
    }
    surface = lattice = labels = lines = null;

    surface = field ? buildSurface(field) : buildPlate();
    scene.add(surface);

    if (field && triadLines) { lines = buildContourLines(field); if (lines) scene.add(lines); }
    if (triadDots) { lattice = buildLattice(E, o); if (lattice) scene.add(lattice); }
    if (triadLabels) { labels = buildLabels(E, o); if (labels) scene.add(labels); }

    if (reliefChanged) frameCamera();
}

function disposeDeep(root) {
    root.traverse?.((n) => {
        n.geometry?.dispose?.();
        if (n.material) {
            const mats = Array.isArray(n.material) ? n.material : [n.material];
            for (const m of mats) { m.map?.dispose?.(); m.dispose?.(); }
        }
    });
    root.geometry?.dispose?.();
    root.material?.dispose?.();
}

/** The height a field value is lifted to. */
function heightOf(field, v) {
    return normalise(field, v) * triadRelief * SIDE;
}

function buildSurface(field) {
    const { w, h } = field;
    const positions = [];
    const colors = [];
    const index = new Int32Array(w * h).fill(-1);
    const map = colormapFn();
    const flat = !triadFill;

    let n = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const v = field.z[y * w + x];
            if (!(v === v)) continue;
            const p = place(x / (w - 1), y / (h - 1), heightOf(field, v));
            positions.push(p.x, p.y, p.z);
            /* With Fill off the surface keeps its shape but loses its shading,
               so the contour lines on it are the only thing carrying value —
               which is exactly what Lines-without-Fill means in the flat pane. */
            const c = flat
                ? (onLight() ? { r: .88, g: .89, b: .92 } : { r: .16, g: .17, b: .21 })
                : map(normalise(field, v));
            colors.push(c.r, c.g, c.b);
            index[y * w + x] = n++;
        }
    }
    if (!n) return buildPlate();

    const tris = [];
    for (let y = 0; y < h - 1; y++) {
        for (let x = 0; x < w - 1; x++) {
            const a = index[y * w + x], b = index[y * w + x + 1];
            const c = index[(y + 1) * w + x + 1], d = index[(y + 1) * w + x];
            if (a < 0 || b < 0 || c < 0 || d < 0) continue;
            tris.push(a, b, c, a, c, d);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(tris);
    geo.computeVertexNormals();

    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
        vertexColors: true, side: THREE.DoubleSide, flatShading: false,
    }));
}

/** No model: the triangle itself, so the lattice has something to sit on. */
function buildPlate() {
    const geo = new THREE.BufferGeometry();
    const [a, b, c] = [place(0, 0), place(1, 0), place(0.5, 1)];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(
        [a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z], 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
        color: onLight() ? 0xf2f3f6 : 0x0b0c10, side: THREE.DoubleSide,
    }));
}

/**
 * The contour lines, drawn on the surface rather than under it.
 *
 * Lifted a hair above the height they mark so they are not swallowed by the
 * very triangles they are level with — the same job a polygon offset does, in
 * the one place it is needed.
 */
function buildContourLines(field) {
    const segs = contourSegments(field, triadContours);
    if (!segs.length) return null;
    const pts = [];
    const cols = [];
    const map = colormapFn();
    const lift = 0.004 * SIDE;
    for (let i = 0; i < segs.length; i += 5) {
        for (const [gx, gy] of [[segs[i], segs[i + 1]], [segs[i + 2], segs[i + 3]]]) {
            const v = sampleField(field, gx, gy);
            const p = place(gx, gy, (v === v ? heightOf(field, v) : 0) + lift);
            pts.push(p.x, p.y, p.z);
            const c = triadFill
                ? (onLight() ? { r: 0, g: 0, b: 0 } : { r: 1, g: 1, b: 1 })
                : map(segs[i + 4]);
            cols.push(c.r, c.g, c.b);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: triadFill ? 0.35 : 0.95,
    }));
}

/** Where a triad sits on the surface — on the field if there is one. */
function liftTriad(t, E, field) {
    const { gx, gy } = centsToShape(t.c1, t.c2, E);
    const v = field ? sampleField(field, gx, gy) : NaN;
    const z = (v === v ? heightOf(field, v) : 0) + 0.012 * SIDE;
    return place(gx, gy, z);
}

function latticeColor(t, range, o) {
    if (!o.enableColor) return onLight() ? { r: .07, g: .07, b: .07 } : { r: 1, g: 1, b: 1 };
    const span = range.hi - range.lo;
    const norm = span > 1e-12 ? (t.complexity - range.lo) / span : 0.5;
    return colormapFn()(Math.min(1, Math.max(0, (1 - norm) * (o.scalingFactor / 2))));
}

function buildLattice(E, o) {
    const triads = currentTriads();
    if (!triads.length) return null;
    const field = currentField();
    const range = complexityRange();
    const span = range.hi - range.lo;

    const pos = [];
    const cols = [];
    const sizes = [];
    for (const t of triads) {
        if (t.c1 + t.c2 > E + 1e-6) continue;
        const p = liftTriad(t, E, field);
        pos.push(p.x, p.y, p.z);
        const c = latticeColor(t, range, o);
        cols.push(c.r, c.g, c.b);
        const norm = span > 1e-12 ? (t.complexity - range.lo) / span : 0.5;
        sizes.push(o.enableSize ? (1 + (1 - norm) * (o.scalingFactor - 1)) : 1);
    }
    if (!pos.length) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    /* One Points object rather than one sphere each: a 15-limit set is a few
       hundred dots and a 27-limit one is tens of thousands. */
    return new THREE.Points(geo, new THREE.PointsMaterial({
        size: 0.035 * o.baseSize * SIDE / 3, vertexColors: true, sizeAttenuation: true,
    }));
}

const labelCache = new Map();

function labelSprite(text, color) {
    const key = `${text}|${color}`;
    let tex = labelCache.get(key);
    if (!tex) {
        const c = document.createElement('canvas');
        const g = c.getContext('2d');
        const size = 40;
        g.font = `${size}px monospace`;
        c.width = Math.ceil(g.measureText(text).width);
        c.height = Math.ceil(size * 1.35);
        g.font = `${size}px monospace`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = color;
        g.fillText(text, c.width / 2, c.height / 2);
        tex = new THREE.CanvasTexture(c);
        tex.userData = { aspect: c.width / c.height };
        labelCache.set(key, tex);
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.userData.aspect = tex.userData.aspect;
    return sprite;
}

function buildLabels(E, o) {
    const triads = currentTriads();
    if (!triads.length) return null;
    const field = currentField();
    const range = complexityRange();
    const group = new THREE.Group();

    /* A label is a sprite with a texture, and ten thousand of those is a
       texture upload per chord. The simplest are the ones worth naming, so
       past a threshold only those get names — which is also the order they
       are wanted in. */
    const CAP = 900;
    const shown = triads.length <= CAP
        ? triads
        : triads.slice(triads.length - CAP);

    for (const t of shown) {
        if (t.c1 + t.c2 > E + 1e-6) continue;
        const c = latticeColor(t, range, o);
        const css = `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
        const sprite = labelSprite(t.label, css);
        const p = liftTriad(t, E, field);
        sprite.position.set(p.x, p.y + 0.05, p.z);
        const s = 0.12 * o.baseSize;
        sprite.scale.set(s * sprite.userData.aspect, s, 1);
        group.add(sprite);
    }
    return group.children.length ? group : null;
}

/* ---------------------------------------------------------------------
 *  Drawing
 * ------------------------------------------------------------------ */

export function draw(o) {
    opts = o;
    if (!renderer) return;
    rebuild(o);

    if (cursor.live) {
        const E = equaveCents(o.equaveRatio);
        const field = currentField();
        const { gx, gy } = centsToShape(cursor.c1, cursor.c2, E);
        const v = field ? sampleField(field, gx, gy) : NaN;
        const p = place(gx, gy, (v === v ? heightOf(field, v) : 0) + 0.05);
        marker.position.copy(p);
        marker.visible = true;
    } else {
        marker.visible = false;
    }
}

/** One frame. The orchestrator's loop calls this only while the pane is up. */
export function render() {
    if (!renderer || !scene || !camera) return;
    controls.update();

    /* The same Motion setting the tetrahedron turns on, applied to the object
       rather than the camera so that the pointer still lands where it looks
       like it lands while the surface is turning. */
    if (autoRotate && surface) {
        const dir = autoRotateDir === 'ArrowRight' ? -1 : 1;
        const axis = (autoRotateDir === 'ArrowUp' || autoRotateDir === 'ArrowDown') ? 'x' : 'y';
        const sign = autoRotateDir === 'ArrowDown' ? -1 : dir;
        for (const item of [surface, lattice, labels, lines, marker]) {
            if (item) item.rotation[axis] += rotationSpeed * sign;
        }
    }
    renderer.render(scene, camera);
}

/* ---------------------------------------------------------------------
 *  The gesture
 *
 *  Shift is the orbit modifier, so the plain drag belongs to the music. That
 *  is Isoharmonics' arrangement and it is the right way round: the surface is
 *  an instrument first and a diagram second.
 * ------------------------------------------------------------------ */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function bindPointer() {
    const el = renderer.domElement;
    el.style.touchAction = 'none';

    el.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0 || ev.shiftKey) return;   // Shift orbits
        const hit = pick(ev);
        if (!hit) return;
        controls.enabled = false;
        dragging = true;
        el.setPointerCapture(ev.pointerId);
        ev.preventDefault();
        onGesture?.('down', hit);
    });

    el.addEventListener('pointermove', (ev) => {
        if (!dragging) return;
        ev.preventDefault();
        const hit = pick(ev);
        if (hit) onGesture?.('move', hit);
    });

    const up = (ev) => {
        if (!dragging) return;
        dragging = false;
        controls.enabled = true;
        try { el.releasePointerCapture(ev.pointerId); } catch (e) {}
        onGesture?.('up', null);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
}

/**
 * The chord under the pointer.
 *
 * The surface is hit first, because on a tall relief the visible summit is not
 * above the triangle position it belongs to and only a real intersection gets
 * that right. If the ray misses the surface — over the sky, or through a hole
 * in the mask — it is dropped onto the base plane instead, so a drag that runs
 * off the top of a peak carries on rather than stopping.
 */
function pick(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);

    let point = null;
    if (surface) {
        const hits = raycaster.intersectObject(surface, false);
        if (hits.length) point = hits[0].point.clone();
    }
    if (!point) {
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const p = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(plane, p)) return null;
        point = p;
    }

    /* The rotation is on the objects, so a turned surface reports a hit in
       world space that has to be brought back into the triangle's own frame
       before it can be read as two intervals. */
    if (surface && (surface.rotation.x || surface.rotation.y)) {
        point.applyQuaternion(surface.quaternion.clone().invert());
    }

    const E = equaveCents(opts.equaveRatio);
    const { gx, gy } = unplace(point);
    const raw = shapeToCents(gx, gy, E);
    const c = clampCents(raw.c1, raw.c2, E);

    if (triadSnap > 0 && (triadDots || triadLabels)) {
        /* Snapping in the lifted pane is measured in cents rather than in
           pixels: a dot's distance on screen here depends on how the surface
           happens to be turned, which is not something the chord should. The
           conversion keeps the two panes feeling like one setting. */
        const tol = (triadSnap / 260) * E;
        let best = null, bestD = tol;
        for (const t of currentTriads()) {
            const d = Math.hypot(t.c1 - c.c1, t.c2 - c.c2);
            if (d <= bestD) { bestD = d; best = t; }
        }
        if (best) return { c1: best.c1, c2: best.c2, label: best.label, snapped: true };
    }
    return { c1: c.c1, c2: c.c2, label: null, snapped: false };
}

/** The canvas, for the PNG exporter. */
export function domElement() { return renderer ? renderer.domElement : null; }
