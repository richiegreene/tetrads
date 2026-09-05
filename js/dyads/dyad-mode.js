/* =====================================================================
 *  DYADS — the mode itself
 * =====================================================================
 *
 * What holds the pane, the panel and the sound together, on the triangle's own
 * terms one dimension down.
 *
 * WHY THERE IS NO RENDER LOOP.  Triads runs a requestAnimationFrame the whole
 * time it is up, because its lifted pane has damping and can still be spinning
 * when nothing has changed. Nothing here moves on its own: the plot is a
 * function of the panel and the cursor, and both of them only change when
 * something happens. So a paint is SCHEDULED by whatever changed and the frame
 * is asked for once, which is a loop that costs nothing while you are reading
 * rather than one that costs a frame a frame forever.
 *
 * ONE CURSOR, AND IT IS ONE NUMBER. The whole mode turns on a dyad having a
 * single degree of freedom: the pane reports an interval in cents, this module
 * puts it in `cursor`, sends it to the two voices and asks for a repaint. The
 * triangle needs a paragraph about keeping two panes from disagreeing; here
 * there is nothing to disagree.
 * ------------------------------------------------------------------ */

import {
    appMode, registerMode, setStatus, letStatusPaint,
} from '../app-mode.js';
import {
    dyadModel, setDyadModel, dyadSpan, dyadRatings, setDyadPivot,
    setCursor, setCursorLive,
} from './dyad-state.js';
import { attach2D, draw as draw2D, resize as resize2D, verticalAxis } from './dyad-2d.js';
import {
    generateDyadSet, generateCurve, currentCurve, currentDyads, clearCurve,
    curveIsStale, modelShortName, loadRatedComplexity,
} from './dyad-curve.js';
import {
    dyadNoteOn, dyadMove, dyadNoteOff, dyadAllOff, rebindPivot, resetPivotFreq,
    spellDyad,
} from './dyad-audio.js';
import { readPanel } from '../utils/read-panel.js';
import { axisRatio } from './dyad-geometry.js';
import { currentTimbre } from '../globals.js';
import { estimateWork, sayWork, WORK_BUDGET } from '../calculations/work-estimate.js';

const $ = (id) => document.getElementById(id);

let frame = 0;

/** Repaint on the next frame. Everything that changes the picture calls this. */
export function invalidate() {
    if (frame || appMode !== 'dyads') return;
    frame = requestAnimationFrame(() => {
        frame = 0;
        if (appMode === 'dyads') draw2D(readPanel());
    });
}

/* ---------------------------------------------------------------------
 *  Setting up
 * ------------------------------------------------------------------ */
export function initDyads() {
    attach2D($('dyad-canvas'), gesture);
    registerMode('dyads', {
        title: 'Dyads',
        view: () => 'dyad',
        resize: () => { resize2D(); invalidate(); },
        enter: enterDyads,
        leave: () => { dyadAllOff(); setCursorLive(false); },
    });
}

/**
 * Everything the plot needs on the way up.
 *
 * The set first and then the curve, in that order and not in parallel: the
 * lattice is stemmed to the curve, and both are Pyodide on the page's own
 * thread, so they could not overlap anyway. Whichever model the panel opens
 * with is the one that gets built — there is no press to wait for.
 */
async function enterDyads() {
    await refreshSet();
    await generateModel(dyadModel);
}

/* ---------------------------------------------------------------------
 *  Gestures
 * ------------------------------------------------------------------ */
function gesture(kind, hit) {
    if (kind === 'up') {
        setCursorLive(false);
        dyadNoteOff();
        invalidate();
        return;
    }
    if (!hit) return;

    setCursor(hit.c);
    setCursorLive(true);
    const label = hit.label || spellDyad(hit.c).label;

    if (kind === 'down') dyadNoteOn(hit.c, label);
    else dyadMove(hit.c, label);

    invalidate();
}

/* ---------------------------------------------------------------------
 *  Regenerating
 * ------------------------------------------------------------------ */

/**
 * Regenerate the JI dyads from the panel.
 *
 * @param {boolean} force run even if the set is over the work budget — what ↵
 *        means. Two voices grow far more slowly than four, so this practically
 *        never fires here; it is asked anyway so that a mistyped limit says the
 *        same thing in every mode.
 * @returns {Promise<boolean>} false if it declined, so the caller knows the
 *        foot is already saying why.
 */
export async function refreshSet(force = false) {
    if (appMode !== 'dyads') return true;
    const o = readPanel();
    const ax = axisRatio(o.equaveRatio, dyadSpan);

    const work = await estimateWork(o, 2);
    if (!force && work > WORK_BUDGET) {
        setStatus(`${sayWork(work)} dyads — press ↵ to generate anyway`);
        return false;
    }

    /* The rated ratios' complexity under whatever measure is now chosen, so
       that a fit is available the moment Ratings is switched on. Cached
       forever per measure — see loadRatedComplexity — so this is one Python
       call the first time each of the six is selected and nothing after. */
    await loadRatedComplexity(o.complexityMethod);

    await generateDyadSet({
        limitType: o.limitType,
        limitValue: o.limitValue,
        maxExponent: o.maxExponent,
        virtualFundamentalFilter: o.virtualFundamentalFilter,
        axisRatio: ax,
        complexityMethod: o.complexityMethod,
        hideUnisonVoices: o.hideUnisonVoices,
        omitOctaves: o.omitOctaves,
    });

    /* An equave or span change does not rescale the picture, it changes how
       wide the axis is and therefore where every peak lands — so a curve
       computed for the old one is not stale styling, it is a wrong diagram.
       Rebuilt rather than dropped: leaving the plot blank would be the panel
       undoing a setting the user did not touch. */
    if (curveIsStale(ax)) {
        clearCurve();
        invalidate();
        await generateModel(dyadModel);
        return true;
    }

    setStatus(describeSet());
    invalidate();
    return true;
}

/**
 * Build the curve.
 *
 * Fast enough — tens of milliseconds, against the surface's second and a half
 * — that it could run on every keystroke without anyone noticing. It goes
 * through the same settle timer anyway, because a panel where one slider
 * applies instantly and the next waits a beat is a panel that feels broken in
 * a way nobody can point at.
 */
export async function generateModel(model) {
    setDyadModel(model);
    if (model === 'discrete') {
        clearCurve();
        invalidate();
        setStatus(describeSet());
        return;
    }

    const o = readPanel();
    setStatus('generating…', true);
    await letStatusPaint();

    const res = await generateCurve(model, {
        axisRatio: axisRatio(o.equaveRatio, dyadSpan),
        timbre: currentTimbre,
    });

    if (!res.ok) setStatus(res.error || 'could not generate');
    else setStatus(describeSet());
    invalidate();
}

/**
 * What the panel has produced, as the foot says it.
 *
 * With the ratings up this is where the fit goes, and it is the most useful
 * line in the app: R-squared against thirty-eight measured listeners is the
 * one number that says whether the curve you are looking at is describing
 * anything. Switch models and watch it move.
 */
function describeSet() {
    const o = readPanel();
    const n = currentDyads().length;
    /* Which measure is being reported has to name the discrete case by the
       Complexity drawer's own choice, and has to say that it is the discrete
       one: Tenney at the ratios and Tenney made continuous are two different
       measures that fit the listeners differently, and a foot that called both
       of them "Tenney" would be hiding the most interesting comparison the
       mode can make. */
    const model = currentCurve()
        ? modelShortName()
        : `${o.complexityMethod} at ratios`;
    const head = `${n} dyads · ${model}`;
    if (!dyadRatings) return head;

    const axis = verticalAxis(o);
    if (axis.r2 === null) return `${head} · ratings`;
    return `${head} · R² ${axis.r2.toFixed(3)} · ${axis.n} rated`;
}

/** Say it again without regenerating — what a display toggle needs. */
export function restate() { setStatus(describeSet()); }

/* ---------------------------------------------------------------------
 *  Things the panel does to the mode
 * ------------------------------------------------------------------ */

export function applyPivot(index) {
    /* Rebound before the setting moves, so the new pivot inherits the pitch
       the OLD arrangement gave that voice — which is the pitch it is actually
       sounding at this instant. */
    rebindPivot(index);
    setDyadPivot(index);
}

export function resetReference() { resetPivotFreq(); }

export { currentCurve, currentDyads };
