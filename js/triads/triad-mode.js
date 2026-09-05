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
 * so two WebGL contexts are never both drawing. Dyads has no loop at all: see
 * dyad-mode.js, where nothing moves unless something changed.
 * ------------------------------------------------------------------ */

import {
    appMode, registerMode, layout, setStatus, letStatusPaint,
} from '../app-mode.js';
import {
    triadView, setTriadView, triadModel, setTriadModel,
    triadPivot, setTriadPivot, cursor, setCursor, setCursorLive,
} from './triad-state.js';
import { attach2D, draw as draw2D, resize as resize2D, invalidate as invalidate2D } from './triad-2d.js';
import {
    attach3D, draw as draw3D, resize as resize3D, render as render3D,
    rebuild as rebuild3D, fitView as fit3D,
} from './triad-3d.js';
import {
    generateTriadSet, generateField, currentField, currentTriads, clearField,
    fieldIsStale,
} from './triad-surface.js';
import {
    triadNoteOn, triadMove, triadNoteOff, triadAllOff, rebindPivot,
    resetPivotFreq, spellTriad,
} from './triad-audio.js';
import { currentTimbre } from '../globals.js';
import { readPanel } from '../utils/read-panel.js';
import { estimateWork, sayWork, WORK_BUDGET } from '../calculations/work-estimate.js';

const $ = (id) => document.getElementById(id);

let pane2d = null;
let pane3d = null;
let loop = 0;
let dirty = true;

/** Repaint on the next frame. Everything that changes the picture calls this. */
export function invalidate({ rebuild = false } = {}) {
    if (rebuild) invalidate2D();
    dirty = true;
}

/* The limit, the equave, the complexity measure and the two display channels
   are read from the same place all three modes read them; see read-panel.js.
   Re-exported because the exporter reaches for it here, where it used to
   live. */
export { readPanel };

/* ---------------------------------------------------------------------
 *  Setting up
 * ------------------------------------------------------------------ */
export function initTriads() {
    pane2d = attach2D($('triad-canvas'), gesture);
    pane3d = attach3D($('triad-3d-pane'), gesture);

    registerMode('triads', {
        title: 'Triads',
        /* Which of the two panes are up is this mode's own setting, so the
           stage is told by the mode rather than the mode by the stage. */
        view: () => triadView,
        resize: () => { resize2D(); resize3D(); dirty = true; },
        enter: enterTriads,
        leave: () => { triadAllOff(); setCursorLive(false); },
    });

    applyView();
    new ResizeObserver(() => { layout(); }).observe($('stage'));
    window.addEventListener('resize', layout);

    if (!loop) loop = requestAnimationFrame(frame);
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
 *  Coming and going
 *
 *  What used to be switchMode here. With a third mode the switch stopped
 *  being "the other one" and moved to app-mode.js, which knows only what
 *  every mode has in common; this is what THIS mode does when it is the one
 *  being asked for.
 * ------------------------------------------------------------------ */

/**
 * Everything the triangle needs on the way up.
 *
 * The set first and then the model, in that order and not in parallel: the
 * model is drawn over the lattice, and both are Pyodide on the page's own
 * thread, so they could not overlap anyway. Whichever model the panel opens
 * with is the one that gets built — there is no press to wait for.
 */
export async function bootTriads() {
    await refreshSet();
    rebuild3D(readPanel(), true);
    fit3D();
    await generateSurface(triadModel);
}

/**
 * The same, on every later arrival.
 *
 * The set is rebuilt because the limit may have moved while another mode was
 * up, and the lifted pane is refitted because it may have had no width at all
 * to measure itself against until this instant. refreshSet only rebuilds the
 * JI dots; a field model still needs its own pass, or one selected before the
 * first visit sits unbuilt until some other control happens to schedule one.
 */
async function enterTriads() {
    await refreshSet();
    rebuild3D(readPanel(), true);
    fit3D();
    if (triadModel !== 'blank') await generateSurface(triadModel);
    dirty = true;
}

/**
 * Regenerate the JI triads from the panel.
 *
 * @param {boolean} force run even if the set is over the work budget — what ↵
 *        means. See work-estimate.js: three voices grow more slowly than four,
 *        but a mistyped limit still asks for billions.
 * @returns {Promise<boolean>} false if it declined, so the caller knows the
 *        foot is already saying why.
 */
export async function refreshSet(force = false) {
    if (appMode !== 'triads') return true;
    const o = readPanel();

    const work = await estimateWork(o, 3);
    if (!force && work > WORK_BUDGET) {
        setStatus(`${sayWork(work)} triads — press ↵ to generate anyway`);
        return false;
    }

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
       it is a wrong diagram. It used to be dropped with a note asking for
       Generate to be pressed again; there is no Generate now, so it is simply
       rebuilt. Dropping the surface and leaving the triangle blank would be
       the panel undoing a setting the user did not touch. */
    if (fieldIsStale(o.equaveRatio)) {
        clearField();
        invalidate({ rebuild: true });
        await generateSurface(triadModel);
        return true;
    }

    setStatus(describeSet());
    invalidate({ rebuild: true });
    rebuild3D(o, true);
    return true;
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
        invalidate({ rebuild: true });
        rebuild3D(readPanel(), true);
        setStatus(describeSet());
        return;
    }

    const o = readPanel();
    setStatus('generating…', true);
    await letStatusPaint();

    const res = await generateField(model, { equaveRatio: o.equaveRatio, timbre: currentTimbre });

    if (!res.ok) {
        setStatus(res.error || 'could not generate');
    } else if (res.cached) {
        setStatus(describeSet());
    } else {
        setStatus(`${describeSet()} · ${(res.ms / 1000).toFixed(1)}s`);
    }
    invalidate({ rebuild: true });
    rebuild3D(o, true);
    fit3D();
}

/** What the panel has produced, as the foot says it. */
function describeSet() {
    const n = currentTriads().length;
    const model = triadModel === 'he' ? 'harmonic entropy'
        : triadModel === 'sethares' ? 'sethares' : null;
    return model && currentField()
        ? `${n} triads · ${model}`
        : `${n} triads`;
}

/* ---------------------------------------------------------------------
 *  Things the panel does to the mode
 * ------------------------------------------------------------------ */

export function applyView(view) {
    if (view) setTriadView(view);
    layout();
    if (triadView !== 'topo') {
        rebuild3D(readPanel(), true);
        /* The pane has this instant been given a width it did not have, so the
           surface is framed against the size it is actually going to be drawn
           at rather than the zero it was measuring a moment ago. */
        fit3D();
    }
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
