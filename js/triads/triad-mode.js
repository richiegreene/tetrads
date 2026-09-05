/* =====================================================================
 *  TRIADS — the mode itself
 * =====================================================================
 *
 * What holds the two panes, the panel and the sound together.
 *
 * ONE CURSOR.  The 2D pane and the 3D pane both report gestures here and
 * neither of them plays anything or draws its own marker from its own idea of
 * where the pointer is. They hand this module a chord; it puts that chord in
 * `cursor`, sends it to the voices, and asks both panes to draw. Side by side
 * they therefore cannot disagree: dragging on the contour map moves the bead
 * on the surface, dragging on the surface moves the crosshair on the map, and
 * exactly one triad is sounding either way.
 *
 * ONE LOOP.  Both panes are painted from a single requestAnimationFrame, and
 * only while the mode is up. The tetrahedron's own loop keeps running — it has
 * always owned itself — but it is told to stop rendering while it is hidden,
 * so two WebGL contexts are never both drawing.
 * ------------------------------------------------------------------ */

import {
    appMode, setAppMode, triadView, setTriadView, triadModel, setTriadModel,
    triadPivot, setTriadPivot, cursor, setCursor, setCursorLive,
} from './triad-state.js';
import { attach2D, draw as draw2D, resize as resize2D, invalidate as invalidate2D } from './triad-2d.js';
import { attach3D, draw as draw3D, resize as resize3D, render as render3D, rebuild as rebuild3D } from './triad-3d.js';
import {
    generateTriadSet, generateField, currentField, currentTriads, clearField,
    fieldIsStale,
} from './triad-surface.js';
import {
    triadNoteOn, triadMove, triadNoteOff, triadAllOff, rebindPivot,
    resetPivotFreq, spellTriad,
} from './triad-audio.js';
import { currentTimbre, currentLayoutMode } from '../globals.js';
import { setLayoutMode } from '../calculations/tetrahedron-updater.js';
import { onWindowResize } from '../components/three-visualizer.js';
import { stopChord } from '../components/audio-engine.js';

const $ = (id) => document.getElementById(id);

let pane2d = null;
let pane3d = null;
let loop = 0;
let dirty = true;

/* Which colour layout was on when Triads was entered. The triangle shades
   itself at paint time, so a colormap change there is only a repaint — but
   the tetrahedron bakes its colours into sprites AND takes its ground from
   the layout, so one chosen while it was hidden has to be applied to it
   properly on the way back. Otherwise Tetrads returns with the White ramp
   drawn on a black ground. */
let layoutOnEntry = null;

/** Repaint on the next frame. Everything that changes the picture calls this. */
export function invalidate({ rebuild = false } = {}) {
    if (rebuild) invalidate2D();
    dirty = true;
}

/* ---------------------------------------------------------------------
 *  Reading the panel
 *
 *  The limit, the equave, the complexity measure and the two display channels
 *  are the same inputs the tetrahedron is built from — read here rather than
 *  mirrored, so there is no second copy to fall out of step.
 * ------------------------------------------------------------------ */
export function readPanel() {
    const raw = $('limitValue').value;
    let limitValue = raw;
    let virtualFundamentalFilter = null;

    if (raw.includes('/')) {
        const [head, tail] = raw.split('/');
        limitValue = head.trim();
        const filter = tail.trim();
        virtualFundamentalFilter = [];
        if (filter.includes('...')) {
            const [a, b] = filter.split('...');
            const start = parseInt(a), end = parseInt(b);
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = start; i <= end; i++) virtualFundamentalFilter.push(i);
            }
        } else {
            virtualFundamentalFilter = filter.split('.')
                .map((n) => parseInt(n.trim())).filter((n) => !isNaN(n));
        }
    }

    return {
        limitType: $('limitType').value,
        limitValue,
        maxExponent: $('maxExponent').value,
        virtualFundamentalFilter,
        equaveRatio: parseFloat($('equaveRatio').value) || 2,
        complexityMethod: $('complexityMethod').value,
        hideUnisonVoices: $('hideUnisonVoices').checked,
        omitOctaves: $('omitOctaves').checked,
        baseSize: parseFloat($('baseSize').value),
        scalingFactor: parseFloat($('scalingFactor').value),
        enableSize: $('enableSize').checked,
        enableColor: $('enableColor').checked,
    };
}

/* ---------------------------------------------------------------------
 *  Setting up
 * ------------------------------------------------------------------ */
export function initTriads() {
    pane2d = attach2D($('triad-canvas'), gesture);
    pane3d = attach3D($('triad-3d-pane'), gesture);

    applyView();
    new ResizeObserver(() => { layout(); }).observe($('stage'));
    window.addEventListener('resize', layout);

    if (!loop) loop = requestAnimationFrame(frame);
}

/** Lay the panes out for the current view and tell both what size they are. */
export function layout() {
    const stage = $('stage');
    if (stage) stage.dataset.view = appMode === 'triads' ? triadView : 'tetra';
    resize2D();
    resize3D();
    onWindowResize();
    dirty = true;
}

function frame() {
    loop = requestAnimationFrame(frame);
    if (appMode !== 'triads') return;

    const showing2d = triadView === 'topo' || triadView === 'both';
    const showing3d = triadView === '3d' || triadView === 'both';

    if (dirty) {
        const o = readPanel();
        if (showing2d) draw2D(o);
        if (showing3d) draw3D(o);
        dirty = false;
    }
    /* The lifted pane has damping and can be spinning, so it is asked for a
       frame every frame; the flat one only redraws when something changed. */
    if (showing3d) render3D();
}

/* ---------------------------------------------------------------------
 *  Gestures
 * ------------------------------------------------------------------ */
function gesture(kind, hit) {
    if (kind === 'up') {
        setCursorLive(false);
        triadNoteOff();
        dirty = true;
        return;
    }
    if (!hit) return;

    setCursor(hit.c1, hit.c2);
    setCursorLive(true);
    const label = hit.label || spellTriad(hit.c1, hit.c2).label;

    if (kind === 'down') triadNoteOn(hit.c1, hit.c2, label);
    else triadMove(hit.c1, hit.c2, label);

    dirty = true;
}

/* ---------------------------------------------------------------------
 *  Switching modes
 * ------------------------------------------------------------------ */

/**
 * Show one app or the other.
 *
 * Everything that sounds is let go on the way across. The two modes address
 * the same synth voices by the same ids — a tetrad's bass and a triad's bass
 * are voice 0 — so a mode change while something is held would leave a note
 * down with nothing left able to lift it.
 */
export async function switchMode(mode) {
    if (mode === appMode) return;
    stopChord();
    triadAllOff();
    setCursorLive(false);
    setAppMode(mode);

    document.body.dataset.mode = mode;
    for (const el of document.querySelectorAll('[data-mode]')) {
        el.classList.toggle('mode-off', el.dataset.mode !== mode);
    }
    for (const b of document.querySelectorAll('#mode-seg button')) {
        b.classList.toggle('on', b.dataset.v === mode);
    }
    for (const h of document.querySelectorAll('.drawer h1 .mode-name')) {
        h.textContent = mode === 'triads' ? 'Triads' : 'Tetrads';
    }

    layout();
    if (mode === 'triads') {
        layoutOnEntry = currentLayoutMode;
        await refreshSet();
        rebuild3D(readPanel(), true);
    } else {
        if (layoutOnEntry !== null && layoutOnEntry !== currentLayoutMode) {
            await setLayoutMode(currentLayoutMode);
        }
        layoutOnEntry = null;
    }
    dirty = true;
}

/** Regenerate the JI triads from the panel. Cheap; safe to call on any change. */
export async function refreshSet() {
    if (appMode !== 'triads') return;
    const o = readPanel();
    await generateTriadSet({
        limitType: o.limitType,
        limitValue: o.limitValue,
        maxExponent: o.maxExponent,
        virtualFundamentalFilter: o.virtualFundamentalFilter,
        equaveRatio: o.equaveRatio,
        complexityMethod: o.complexityMethod,
        hideUnisonVoices: o.hideUnisonVoices,
        omitOctaves: o.omitOctaves,
    });
    /* An equave change does not rescale the picture, it changes which chords
       are in it — so a field computed for the old one is not stale styling,
       it is a wrong diagram, and it goes rather than being redrawn. */
    if (fieldIsStale(o.equaveRatio)) {
        /* Pressed rather than set, so the model picker's own handler runs and
           the parameters on screen go back to matching the model that is
           actually loaded. */
        $('triad-model-seg').querySelector('button[data-v="blank"]')?.click();
        setStatus(`${currentTriads().length} triads · equave changed, regenerate the model`);
    } else {
        setStatus(`${currentTriads().length} triads`);
    }

    invalidate({ rebuild: true });
    rebuild3D(o, true);
}

/**
 * Build the surface.
 *
 * Its own press rather than a side effect of a slider, because it is the one
 * thing in the app that can take a second: Pyodide runs on the page's thread,
 * so a model that regenerated on every keystroke would freeze the panel it was
 * being typed into.
 */
export async function generateSurface(model) {
    setTriadModel(model);
    if (model === 'blank') {
        clearField();
        setStatus('no model');
        invalidate({ rebuild: true });
        rebuild3D(readPanel(), true);
        return;
    }

    const o = readPanel();
    setStatus('generating…', true);
    /* Two frames before the work starts: one to paint the status, one for the
       browser to actually show it. Pyodide blocks everything after this. */
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const res = await generateField(model, { equaveRatio: o.equaveRatio, timbre: currentTimbre });

    if (!res.ok) {
        setStatus(res.error || 'could not generate');
    } else if (res.cached) {
        setStatus(model === 'he' ? 'harmonic entropy' : 'sethares');
    } else {
        const name = model === 'he' ? 'harmonic entropy' : 'sethares';
        setStatus(`${name} · ${(res.ms / 1000).toFixed(1)}s`);
    }
    invalidate({ rebuild: true });
    rebuild3D(o, true);
}

function setStatus(text, busy = false) {
    const el = $('triad-status');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('busy', busy);
}

/* ---------------------------------------------------------------------
 *  Things the panel does to the mode
 * ------------------------------------------------------------------ */

export function applyView(view) {
    if (view) setTriadView(view);
    layout();
    if (triadView !== 'topo') rebuild3D(readPanel(), true);
    dirty = true;
}

export function applyPivot(index) {
    /* Rebound before the setting moves, so the new pivot inherits the pitch
       the OLD arrangement gave that voice — which is the pitch it is actually
       sounding at this instant. */
    rebindPivot(index);
    setTriadPivot(index);
}

export function resetReference() { resetPivotFreq(); }

export { currentField, currentTriads };
