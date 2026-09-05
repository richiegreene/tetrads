/* =====================================================================
 *  THE PANEL
 * =====================================================================
 *
 * Four drawers behind one rail, in Xenachord Designer's own idiom, and the
 * split between them is by what a control is FOR rather than by what it acts
 * on:
 *
 *   Complexity Measures  which chords exist at all
 *   Display              what is done with the ones that do
 *   Play                 what they sound like
 *   Export               who else gets them
 *
 * The same four in all three modes, because all three ask the same questions
 * of the same set — which is why the mode switch sits ABOVE them rather than
 * inside one. What is genuinely particular to one mode is marked `data-mode`
 * in the markup and appears with it; see applyModeClasses in app-mode.js.
 *
 * The foot sits under all four, because every drawer can change what the next
 * generation produces and a readout that vanished with its drawer would have
 * to be gone looking for.
 * ------------------------------------------------------------------ */

import {
    enableNotation, notationSpelling, enableSlide, slideDuration, playbackMode,
    rotationSpeed, setRotationSpeed, autoRotate, setAutoRotate,
    notationDisplay, isClickPlayModeActive, isShiftHeld, currentLayoutMode,
    setEnableNotation, setNotationShowRatio, setNotationShowCents, setNotationShowDeviation,
    setNotationSpelling, setEnableSlide, setSlideDuration, setPlaybackMode,
    setSagittalPrecision, setSagittalEvo, setCurrentLayoutMode,
    setCurrentPivotVoiceIndex, setIsClickPlayModeActive, setCurrentlyHovered,
    setLastPlayedFrequencies, setLastPlayedRatios,
    controls,
    mpePressure, setMpePressure
} from '../globals.js';
import { stopChord, setTimbre, setAdsr } from '../components/audio-engine.js';
import { updateTetrahedron, setLayoutMode, LAYOUT_GROUNDS } from '../calculations/tetrahedron-updater.js';
import { onWindowResize } from '../components/three-visualizer.js';
import { exportToSVG, downloadSVG, exportToPNG, exportToCSV } from './data-export.js';
import { saveTriadSVG, saveTriadPNG, exportTriadCSV } from '../triads/triad-export.js';
import { saveDyadSVG, saveDyadPNG, exportDyadCSV } from '../dyads/dyad-export.js';
import {
    colormaps, colormapAt, COLORMAP_COUNT, constantColors, setConstantColor,
    isLightGround, groundCss,
} from '../calculations/color-mapping.js';
import { estimateWork, sayWork, WORK_BUDGET } from '../calculations/work-estimate.js';
import { initMidiOutput, sendMpePressure, mpeChannels } from '../midi/midi-output.js';
import { createTimbrePicker, FILTERED_MIN } from '../synth/timbre.js';
import { attachAdsrEditor } from '../synth/adsr.js';
import { setCurrentTimbre } from '../globals.js';
import {
    appMode, registerMode, switchMode, layout as layoutStage, setStatus as showStatus,
    letStatusPaint,
} from '../app-mode.js';
import {
    triadModel, triadDots, triadLabels, setTriadModel, setTriadFill, setTriadLines,
    setTriadContours, setTriadRelief, setTriadDots, setTriadLabels,
    setTriadSnap, setTriadGlide, setTriadGloss, heParams, smParams,
} from '../triads/triad-state.js';
import {
    refreshSet, generateSurface, applyView, applyPivot,
    invalidate as invalidateTriads, resetReference,
} from '../triads/triad-mode.js';
import {
    dyadModel, dyadDots, dyadLabels, setDyadModel, setDyadFill, setDyadLine,
    setDyadLineWidth, setDyadRelief, setDyadGrid, setDyadDots, setDyadLabels,
    setDyadSnap, setDyadGlide, setDyadSpan, setDyadResolution,
    dheParams, dsmParams, dtnParams,
} from '../dyads/dyad-state.js';
import {
    refreshSet as refreshDyadSet, generateModel as generateDyadModel,
    invalidate as invalidateDyads,
    applyPivot as applyDyadPivot, resetReference as resetDyadReference,
} from '../dyads/dyad-mode.js';

const $ = (id) => document.getElementById(id);

export function updateMpePressureSliderUI() {
    const mpePressureSlider = $('mpePressureSlider');
    if (mpePressureSlider) mpePressureSlider.value = mpePressure;
}

/* ---------------------------------------------------------------------
 *  The synth's settings, kept where the app it came from keeps them
 *
 *  Same store shape and same defaults as Xenachord's play.js, under a key of
 *  this app's own — the two are separate instruments that happen to be built
 *  the same way, so a shape chosen here does not reach over and change one
 *  chosen there.
 * ------------------------------------------------------------------ */
const STORE = 'tetrads.synth.v1';
const S = {
    timbre: FILTERED_MIN + 200,          // filtered saw, the default
    adsr: { a: 0.016, d: 0.067, s: 0.38, r: 0.544 },
};
try { Object.assign(S, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) {}
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) {} };

const LINE = '#7ee0c0', AXIS = '#222a34';

/**
 * Wire a row of segmented buttons to a hidden input, so a `.seg` reads back
 * like the `<select>` it replaced and nothing downstream has to know the
 * difference.
 */
function seg(segId, onPick) {
    const el = $(segId);
    if (!el) return;
    el.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button');
        if (!btn || !el.contains(btn)) return;
        for (const b of el.querySelectorAll('button')) b.classList.toggle('on', b === btn);
        onPick(btn.dataset.v, btn);
    });
}

/* ---------------------------------------------------------------------
 *  The colour layouts
 *
 *  The list itself lives in color-mapping.js, beside the ramps — the chips are
 *  painted by sampling the very functions the scene colours itself with, so a
 *  swatch is the map rather than a picture of it, and adding a colour is one
 *  edit rather than three kept in step by hand.
 * ------------------------------------------------------------------ */

/**
 * A material layout's swatch: the material, lit.
 *
 * A ramp swatch would be a lie about a layout whose surface is one colour, so
 * the chip shows what the surface will actually look like — the body colour
 * with the key light's highlight where the key light is, which is the same
 * top-left as the scene's own.
 */
function materialCss(mat) {
    const hex = (c) => '#' + c.toString(16).padStart(6, '0');
    return `radial-gradient(circle at 30% 26%, ${hex(mat.specular)} 0%, `
        + `${hex(mat.color)} 46%, rgba(0,0,0,.55) 100%)`;
}

/** A colormap as a CSS gradient, sampled at enough stops to read as smooth. */
function rampCss(fn, stops = 12) {
    const parts = [];
    for (let i = 0; i < stops; i++) {
        /* Left to right is simple to complex, which is the direction the
           scene reads in: the update scales an INVERTED complexity, so a
           simple chord lands at the top of the ramp. */
        const c = fn(1 - i / (stops - 1));
        parts.push(`rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}) ${(i / (stops - 1) * 100).toFixed(1)}%`);
    }
    return `linear-gradient(90deg, ${parts.join(', ')})`;
}

/**
 * The same row of buttons, but each one its own switch.
 *
 * A `.seg` normally asks which of these, and lights one. Size and Color are
 * not a choice of one — a set can be sized and coloured, either or neither —
 * so this variant lights them independently and keeps a hidden checkbox in
 * step, which is what the rest of the app reads. Drawn identically to the
 * choosing kind on purpose: they are the same press on the same kind of
 * thing, and the difference is one you learn by pressing once.
 */
function toggleSeg(segId, onToggle) {
    const el = $(segId);
    if (!el) return;
    el.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button');
        if (!btn || !el.contains(btn)) return;
        const box = $(btn.dataset.v);
        const on = !btn.classList.contains('on');
        btn.classList.toggle('on', on);
        if (box) box.checked = on;
        onToggle?.(btn.dataset.v, on);
    });
}

/**
 * A pair of independent switches, like toggleSeg — but reporting rather than
 * writing to a hidden checkbox.
 *
 * Tetrads' Size and Color are backed by real checkboxes because the update
 * path reads the DOM. Triads' pairs are backed by module state instead, so
 * there is nothing to keep in step and the seg simply says what changed.
 */
function flagSeg(segId, flags) {
    const el = $(segId);
    if (!el) return;
    el.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button');
        if (!btn || !el.contains(btn)) return;
        const on = !btn.classList.contains('on');
        btn.classList.toggle('on', on);
        flags[btn.dataset.v]?.(on);
    });
}

/**
 * A slider that shows its own value.
 *
 * Every press in the Triads drawers is a number with a unit, and a number you
 * can only find by dragging to see what happens is not a setting you can
 * return to. Same idiom as Motion and Slide above, factored out because
 * Triads adds ten of them.
 */
function press(id, valueId, apply, format) {
    const input = $(id);
    const out = $(valueId);
    if (!input) return () => {};
    const show = () => {
        const v = parseFloat(input.value);
        if (out) out.textContent = format(v);
        return v;
    };
    input.addEventListener('input', () => apply(show()));
    show();
    return show;
}

/* ---------------------------------------------------------------------
 *  Motion
 *
 *  rotationSpeed is radians per frame, and the slider spans 0.5-20 deg/s —
 *  a range wide enough that it is exponential over it, not linear.
 *  Linear, the whole usable range would sit in the first two millimetres.
 *  [ and ] step it by 10% either way, which is a fixed number of slider
 *  positions on an exponential scale and a wildly varying one on a linear.
 * ------------------------------------------------------------------ */
const ROT_MIN = 0.5 * Math.PI / (180 * 60), ROT_MAX = 20 * Math.PI / (180 * 60);
const rotToSlider = (v) => Math.round(100 * Math.log(v / ROT_MIN) / Math.log(ROT_MAX / ROT_MIN));
const sliderToRot = (t) => ROT_MIN * Math.pow(ROT_MAX / ROT_MIN, t / 100);
/** Radians per frame, said as degrees per second at 60fps — what you see. */
const rotLabel = (v) => `${Math.round(v * 60 * 180 / Math.PI)}\u00b0/s`;

/* ---------------------------------------------------------------------
 *  Applying itself
 *
 *  There is no Update button and no Generate button: every control applies
 *  itself. What makes that safe rather than unusable is that the work is
 *  DEFERRED rather than immediate.
 *
 *  Pyodide has no worker to run in — it runs on the page's own thread — so
 *  regenerating a set is a few hundred milliseconds during which nothing on
 *  the page moves, including the slider being dragged. Doing that on every
 *  intermediate value of a drag would make the panel unusable, and doing it on
 *  every keystroke of "13" would generate the 1-limit on the way.
 *
 *  So a change does not run the work, it SCHEDULES it: the timer restarts on
 *  every change and the work happens once, a beat after you stop. Two kinds
 *  are tracked separately because they cost differently and are triggered by
 *  different controls — the SET (which chords exist) and the MODEL (the
 *  surface under the triangle) — and a request for both runs both, in that
 *  order, since the model is drawn over whatever the set is.
 * ------------------------------------------------------------------ */

/** How long to wait for the hand to stop. Long enough to cover a drag's
 *  frame-by-frame stream, short enough that a deliberate change feels applied
 *  rather than pending. */
const SETTLE_MS = 260;

let settleTimer = 0;
let pendingSet = false;
let pendingModel = false;
let pendingForce = false;   // ↵: run it even if it is over budget
let lastChangeAt = 0;
let running = false;
let applyNow = null;   // filled in below, once the drawers can be read

/**
 * Ask for work, and let it happen once the panel goes quiet.
 * @param {'set'|'model'|'both'} kind
 */
function scheduleApply(kind, force = false) {
    if (kind === 'set' || kind === 'both') pendingSet = true;
    if (kind === 'model' || kind === 'both') pendingModel = true;
    if (force) pendingForce = true;
    lastChangeAt = performance.now();
    arm(SETTLE_MS);
}

function arm(ms) {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
        /* The clock, not the timer, decides whether things have gone quiet.
         *
         * A generation blocks the thread for a few hundred milliseconds, and
         * everything queued behind it — including this timer — is delivered
         * late and all at once when it lets go. A timer that simply ran on
         * firing would therefore treat a starved beat as a silence and
         * regenerate in the middle of a drag that never paused. Asking how
         * long it has actually been since the last change makes starvation
         * harmless: it just re-arms for the remainder. */
        const quiet = performance.now() - lastChangeAt;
        if (quiet < SETTLE_MS - 8) { arm(SETTLE_MS - quiet); return; }
        applyNow?.();
    }, ms);
}

export function setupUIEventListeners() {

    /* ---------------- the rail ----------------
     * Pressing the mode you are already in shuts the drawer and gives the
     * viewport its width back; pressing another switches to it. */
    const panel = $('panel');
    const setMode = (name) => {
        for (const d of panel.querySelectorAll('.drawer'))
            d.classList.toggle('hidden', d.dataset.drawer !== name);
        for (const b of panel.querySelectorAll('.rail-btn[data-drawer]'))
            b.setAttribute('aria-expanded', String(b.dataset.drawer === name));
        panel.classList.toggle('open', !!name);
    };
    for (const btn of panel.querySelectorAll('.rail-btn[data-drawer]')) {
        btn.addEventListener('click', () => {
            const open = btn.getAttribute('aria-expanded') === 'true'
                && panel.classList.contains('open');
            setMode(open ? null : btn.dataset.drawer);
        });
    }

    /* ---------------- which app you are in ----------------
     * Pinned above the drawers. switchMode does the visible half — hiding the
     * controls of the mode you are not in, retitling the drawers, laying the
     * stage out — and lets go of anything that is sounding on the way across,
     * because both modes address the same synth voices by the same ids. */
    /* Complexity channels size and colour a triad's dots and a dyad's marks
       as much as a tetrad's points, but with the lattice itself invisible —
       neither Dots nor Labels on — there is nothing left for them or for Omit
       to act on, so they go dark together. */
    const channelFieldset = $('channel-fieldset');
    const omitFieldset = $('omit-fieldset');
    const limitFieldset = $('limit-fieldset');
    const complexityFieldset = $('complexity-fieldset');
    const updateChannelVisibility = () => {
        const latticeEmpty = (appMode === 'triads' && !triadDots && !triadLabels)
                          || (appMode === 'dyads' && !dyadDots && !dyadLabels);
        channelFieldset.classList.toggle('mode-off', latticeEmpty);
        omitFieldset.classList.toggle('mode-off', latticeEmpty);
        limitFieldset.classList.toggle('mode-off', latticeEmpty);
        complexityFieldset.classList.toggle('mode-off', latticeEmpty);
    };

    /* Limit, Complexity, Complexity channels and Omit all decide what the
       lattice is and shows, so in the two gestural modes they live inside that
       mode's Lattice fieldset rather than as siblings of it. Moved rather than
       duplicated: each is the one control the rest of the app already reads by
       id, and Tetrads gets them back, in their old places, the moment the mode
       does. */
    const latticeHosts = {
        triads: $('triad-lattice-fieldset'),
        dyads: $('dyad-lattice-fieldset'),
    };
    const latticeGroup = [limitFieldset, complexityFieldset, channelFieldset, omitFieldset];
    const latticeHomes = latticeGroup.map((el) => [el, el.parentNode, el.nextSibling]);
    const placeLatticeGroup = (mode) => {
        const host = latticeHosts[mode];
        if (host) {
            for (const el of latticeGroup) host.appendChild(el);
        } else {
            for (const [el, parent, next] of latticeHomes) parent.insertBefore(el, next);
        }
    };

    seg('mode-seg', (v) => { switchMode(v); placeLatticeGroup(v); updateChannelVisibility(); });
    /* Seeded rather than assumed: the app opens in Triads, so the lattice
       group starts where Triads keeps it and the channels start hidden or not
       according to whether the lattice is actually showing. */
    placeLatticeGroup(appMode);
    updateChannelVisibility();

    /* ---------------- Complexity Measures ---------------- */
    const limitTypeSelect = $('limitType');
    const primeLimitOptions = $('prime-limit-options');
    primeLimitOptions.style.display = limitTypeSelect.value === 'Prime' ? 'block' : 'none';
    limitTypeSelect.addEventListener('change', (event) => {
        primeLimitOptions.style.display = event.target.value === 'Prime' ? 'block' : 'none';
    });

    /* Everything that decides WHICH CHORDS EXIST. The equave is in the list
       twice over: it changes the set, and it changes what the triangle's
       corners mean — so a surface computed for the old one is not stale
       styling but a wrong diagram, and it is rebuilt rather than kept. */
    for (const id of ['limitType', 'complexityMethod']) {
        $(id).addEventListener('change', () => scheduleApply('set'));
    }
    for (const id of ['limitValue', 'maxExponent']) {
        $(id).addEventListener('input', () => scheduleApply('set'));
    }
    $('equaveRatio').addEventListener('input', () => scheduleApply('both'));
    toggleSeg('omit-seg', () => scheduleApply('set'));

    /* ---------------- Display ---------------- */
    const layoutDisplay = $('layoutDisplay');
    seg('layout-seg', (v) => { layoutDisplay.value = v; scheduleApply('set'); });

    /**
     * A shared display control has moved.
     *
     * In Tetrads the colours and sizes are baked into the sprites, so this is
     * a regeneration; in Triads and Dyads they are read at paint time, so the
     * same press is only a repaint. That difference is the whole argument for
     * keeping the fields as numbers rather than asking a plotting library for
     * a picture, and it is stated once here rather than at each of the four
     * places that need it.
     */
    const restyle = ({ rebuild = false } = {}) => {
        if (appMode === 'triads') invalidateTriads({ rebuild });
        else if (appMode === 'dyads') invalidateDyads();
        else scheduleApply('set');
    };

    toggleSeg('channel-seg', () => restyle({ rebuild: true }));

    /* ---------------- the colormap chips ----------------
     * Painted by sampling the very functions the scene colours itself with, so
     * a swatch is the map rather than a picture of it. Rebuilt rather than
     * restyled when a constant's colour changes, because its ramp, its
     * highlight and its ambient are all derived from that colour. */
    const mapsEl = $('colormap-seg');

    const paintChips = () => {
        mapsEl.textContent = '';
        colormaps().forEach((m, i) => {
            const b = document.createElement('button');
            b.className = 'map' + (i === currentLayoutMode ? ' on' : '');
            b.dataset.v = String(i);
            b.dataset.ground = isLightGround(m.ground) ? 'light' : 'dark';
            /* The chip is drawn on the ground the layout is drawn on, which is
               the whole reason two greyscales read as two layouts rather than
               as one gradient twice — and now also why Bone reads as paper. */
            b.style.background = groundCss(m.ground);
            if (m.material) b.dataset.kind = 'material';
            b.title = m.title;

            const ramp = document.createElement('span');
            ramp.className = 'ramp';
            ramp.style.background = m.material ? materialCss(m.material) : rampCss(m.ramp);
            b.append(ramp);

            if (m.constant) {
                /* The swatch IS the setting, so it lives on the chip rather
                   than in a row underneath: there are two constants and they
                   remember separate colours, and a single picker somewhere
                   else could not say which one it was about. */
                const row = document.createElement('span');
                row.className = 'const-row';
                const picker = document.createElement('input');
                picker.type = 'color';
                picker.value = groundCss(constantColors[m.constant]);
                picker.title = 'The colour the light is applied to';
                /* The press underneath selects the layout; the picker must not
                   also toggle it on the way to opening. */
                picker.addEventListener('click', (ev) => ev.stopPropagation());
                picker.addEventListener('input', () => {
                    setConstantColor(m.constant, parseInt(picker.value.slice(1), 16));
                    paintChips();
                    if (currentLayoutMode === i) applyColormap(i);
                });
                row.append(picker, document.createTextNode(m.name));
                b.append(row);
            } else {
                b.append(document.createTextNode(m.name));
            }
            mapsEl.append(b);
        });
    };

    /**
     * Day mode, when the view is in day mode.
     *
     * Xenachord Designer's own arrangement, and its own tokens: when the
     * viewport goes light the rail and the drawer go with it, because a dark
     * panel against a light view is a bezel with a lamp behind it. The whole
     * chrome reads off the same custom properties, so overriding them on
     * `body.bright` recolours the subtree without a second stylesheet.
     *
     * Which layouts are light is a luminance test rather than a list: the
     * bright ones sit on cream, blush and sage as well as on hard white, and
     * a constant's ground is whatever its column's is.
     */
    const applyBrightMode = (index) => {
        document.body.classList.toggle('bright', isLightGround(colormapAt(index).ground));
    };

    /**
     * Light one chip and take the scene to it. The seg and ⇧⌘L share this.
     *
     * The tetrahedron bakes its colours into sprites at build time, so a new
     * ramp means regenerating the set. The triangle keeps its field as numbers
     * and the plot keeps its curve as numbers, so the same press in either of
     * those is a repaint — which is the point of not asking a plotting library
     * for a picture in the first place.
     */
    const applyColormap = (index) => {
        for (const b of mapsEl.querySelectorAll('button')) {
            b.classList.toggle('on', b.dataset.v === String(index));
        }
        applyBrightMode(index);
        if (appMode === 'tetrads') {
            setLayoutMode(index);
        } else {
            setCurrentLayoutMode(index);
            restyle({ rebuild: true });
        }
    };
    paintChips();
    applyBrightMode(currentLayoutMode);
    seg('colormap-seg', (v) => applyColormap(parseInt(v)));

    for (const id of ['baseSize', 'scalingFactor']) {
        $(id).addEventListener('input', () => restyle({ rebuild: true }));
    }

    /* ---------------------------------------------------------------------
     *  Triads
     *
     *  Everything below only exists while the triangle is up. Two rules keep
     *  it honest: nothing here writes a setting the tetrahedron also reads,
     *  and nothing here regenerates the model except the Generate press —
     *  Pyodide runs on this thread, so a slider that recomputed a surface
     *  would freeze the panel it was being dragged in.
     * ------------------------------------------------------------------ */

    /* ---- which model is under the triangle ----
     * Choosing one shows that model's parameters and builds it, a beat later.
     * Which one is selected at startup is read off the markup rather than
     * duplicated here: the lit chip is the single statement of it, so the
     * panel and the state cannot open disagreeing about what is loaded. */
    const modelParams = { he: $('he-params'), sethares: $('sm-params') };
    const resRow = $('triad-res-row'), resInput = $('triadResolution');
    const showModelParams = (model) => {
        for (const [name, el] of Object.entries(modelParams)) {
            el.classList.toggle('mode-off', name !== model);
        }
        const needsGrid = model !== 'blank';
        resRow.style.display = needsGrid ? 'flex' : 'none';
        resInput.style.display = needsGrid ? 'block' : 'none';
    };
    seg('triad-model-seg', (v) => {
        setTriadModel(v);
        showModelParams(v);
        scheduleApply('model');
    });
    const bootModel = $('triad-model-seg').querySelector('button.on')?.dataset.v || 'blank';
    setTriadModel(bootModel);
    showModelParams(bootModel);

    /* The model's own numbers. Each one rebuilds the field a beat after the
       hand comes off it — a drag sends a value a frame, and the settle timer
       is what turns that stream into one computation at the end of it. */
    const modelPress = (id, valueId, apply, format) =>
        press(id, valueId, (v) => { apply(v); scheduleApply('model'); }, format);

    modelPress('heSpread', 'he-spread-v', (v) => { heParams.spread = v; }, (v) => `${v} ¢`);
    modelPress('heNLimit', 'he-n-v', (v) => { heParams.nLimit = v; }, (v) => `${v}`);
    modelPress('heAlpha', 'he-alpha-v', (v) => { heParams.alpha = v; }, (v) => v.toFixed(1));
    modelPress('smPartials', 'sm-partials-v', (v) => { smParams.partials = v; }, (v) => `${v}`);
    modelPress('smStep', 'sm-step-v', (v) => { smParams.step = v; }, (v) => v.toFixed(3));
    modelPress('smRamp', 'sm-ramp-v', (v) => { smParams.ramp = v; }, (v) => v.toFixed(1));
    modelPress('triadResolution', 'triad-res-v', (v) => {
        heParams.resolution = v; smParams.resolution = v;
    }, (v) => `${v}`);

    /* ---- how the field is drawn ----
     * These change the picture and nothing else, so they redraw immediately.
     * Fill and Lines are independent: a field can be shaded, contoured, both,
     * or neither with only the lattice left. */
    seg('triad-view-seg', (v) => applyView(v));
    flagSeg('triad-surface-seg', {
        triadFill: (on) => { setTriadFill(on); invalidateTriads({ rebuild: true }); },
        triadLines: (on) => { setTriadLines(on); invalidateTriads({ rebuild: true }); },
    });
    flagSeg('triad-lattice-seg', {
        triadDots: (on) => { setTriadDots(on); invalidateTriads(); updateChannelVisibility(); },
        triadLabels: (on) => { setTriadLabels(on); invalidateTriads(); updateChannelVisibility(); },
    });

    press('triadContours', 'contours-v',
        (v) => { setTriadContours(v); invalidateTriads({ rebuild: true }); },
        (v) => `${v}`);
    press('triadRelief', 'relief-v',
        (v) => { setTriadRelief(v / 100); invalidateTriads(); },
        (v) => `${Math.round(v)}%`);
    press('triadSnap', 'snap-v',
        (v) => { setTriadSnap(v); },
        (v) => (v > 0 ? `${Math.round(v)} px` : 'off'));

    /* Gloss repaints rather than regenerates: it changes how the surface is
       lit, not what the surface is. The 2D shade is cached per gloss value,
       which is what `rebuild` clears. */
    press('triadGloss', 'gloss-v',
        (v) => { setTriadGloss(v / 100); invalidateTriads({ rebuild: true }); },
        (v) => `${Math.round(v)}%`);

    /* ---- how the three voices follow the hand ----
     * The one control that is the whole difference from the app this mode
     * comes from: the attack happens once, on the way down, and this is only
     * how far behind the pointer the pitch is allowed to be afterwards. */
    press('triadGlide', 'triad-glide-v',
        (v) => setTriadGlide(v / 1000),
        (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`));

    /* ---- the pivot, on Tetrads' own terms ----
     * Four voices there, three here, and everything else about it identical:
     * the initial of the part is both the label and the key that selects it.
     * Button and shortcut go through one function so the two cannot come to
     * disagree about which voice is being held — the same arrangement
     * updatePivotButtonSelection gives the tetrahedron. */
    const TRIAD_PARTS = { S: 2, A: 1, T: 0 };
    const triadPivotSeg = $('triad-pivot-seg');

    const pickTriadPivot = (index) => {
        for (const b of triadPivotSeg.querySelectorAll('button')) {
            b.classList.toggle('on', b.dataset.v === String(index));
        }
        applyPivot(index);
    };

    triadPivotSeg.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button');
        if (btn && triadPivotSeg.contains(btn)) pickTriadPivot(parseInt(btn.dataset.v));
    });

    /* ---------------------------------------------------------------------
     *  Dyads
     *
     *  Everything below only exists while the plot is up. The same two rules
     *  keep it honest as in Triads: nothing here writes a setting another mode
     *  also reads, and nothing here recomputes except through the settle timer.
     *
     *  The second rule matters less than it does over there — a curve is a line
     *  and costs tens of milliseconds where a surface is a grid and costs a
     *  second and a half — but a panel where one slider applies instantly and
     *  the next waits a beat is a panel that feels broken in a way nobody can
     *  point at. So the plot waits too.
     * ------------------------------------------------------------------ */

    /* ---- which measure is the curve ----
     * Choosing one shows that model's parameters and builds it, a beat later.
     * Which one is selected at startup is read off the markup rather than
     * duplicated here, so the panel and the state cannot open disagreeing. */
    const dyadModelParams = { he: $('dhe-params'), sethares: $('dsm-params'), tenney: $('dtn-params') };
    const dyadResRow = $('dyad-res-row'), dyadResInput = $('dyadResolution');
    const showDyadModelParams = (model) => {
        for (const [name, el] of Object.entries(dyadModelParams)) {
            el.classList.toggle('mode-off', name !== model);
        }
        /* Resolution is how finely a CURVE is sampled and Fill and Line are
           how one is drawn, so both mean nothing when the measure has values
           only at the ratios and there is no curve to draw. They go together,
           in the two drawers they respectively live in. */
        const needsCurve = model !== 'discrete';
        dyadResRow.style.display = needsCurve ? 'flex' : 'none';
        dyadResInput.style.display = needsCurve ? 'block' : 'none';
        $('dyad-curve-fieldset').classList.toggle('no-curve', !needsCurve);
    };
    seg('dyad-model-seg', (v) => {
        setDyadModel(v);
        showDyadModelParams(v);
        scheduleApply('model');
    });
    const bootDyadModel = $('dyad-model-seg').querySelector('button.on')?.dataset.v || 'discrete';
    setDyadModel(bootDyadModel);
    showDyadModelParams(bootDyadModel);

    /* The models' own numbers, each rebuilding the curve a beat after the hand
       comes off it. */
    const dyadModelPress = (id, valueId, apply, format) =>
        press(id, valueId, (v) => { apply(v); scheduleApply('model'); }, format);

    dyadModelPress('dheSpread', 'dhe-spread-v', (v) => { dheParams.spread = v; }, (v) => `${v} ¢`);
    dyadModelPress('dheNLimit', 'dhe-n-v', (v) => { dheParams.nLimit = v; }, (v) => `${v}`);
    dyadModelPress('dheAlpha', 'dhe-alpha-v', (v) => { dheParams.alpha = v; }, (v) => v.toFixed(1));
    dyadModelPress('dsmPartials', 'dsm-partials-v', (v) => { dsmParams.partials = v; }, (v) => `${v}`);
    dyadModelPress('dsmRamp', 'dsm-ramp-v', (v) => { dsmParams.ramp = v; }, (v) => v.toFixed(1));
    dyadModelPress('dtnSoftness', 'dtn-soft-v', (v) => { dtnParams.softness = v; }, (v) => `${v} ¢`);
    dyadModelPress('dtnDepth', 'dtn-depth-v', (v) => { dtnParams.depth = v; }, (v) => `${v}`);
    dyadModelPress('dyadResolution', 'dyad-res-v', (v) => setDyadResolution(v), (v) => `${v}`);

    /* The span is in the Complexity drawer rather than in Display for the
       reason the limit is: it does not rescale the picture, it decides which
       intervals are in it — and it is the one axis setting the plot owns, the
       equave itself belonging to all three modes at once. */
    press('dyadSpan', 'dyad-span-v',
        (v) => { setDyadSpan(v); scheduleApply('both'); },
        (v) => (v === 1 ? '1 equave' : `${v} equaves`));

    /* ---- how the curve is drawn ----
     * Everything here changes the picture and nothing else, so it all redraws
     * at once. There is no model to recompute: the curve is held as numbers
     * and every one of these is a decision about how to put those numbers on
     * a page. */
    flagSeg('dyad-curve-seg', {
        dyadFill: (on) => { setDyadFill(on); invalidateDyads(); },
        dyadLine: (on) => { setDyadLine(on); invalidateDyads(); },
    });
    press('dyadLineWidth', 'dyad-width-v',
        (v) => { setDyadLineWidth(v); invalidateDyads(); },
        (v) => `${v.toFixed(1)} px`);

    /* Grid changes the MARGINS as well as what is drawn in them — with no
       ruler and no labels there is nothing for the borders to hold — so the
       pane has to be measured again rather than merely repainted. */
    flagSeg('dyad-grid-seg', {
        dyadGrid: (on) => { setDyadGrid(on); layoutStage(); invalidateDyads(); },
    });
    press('dyadRelief', 'dyad-relief-v',
        (v) => { setDyadRelief(v / 100); invalidateDyads(); },
        (v) => `${Math.round(v)}%`);

    flagSeg('dyad-lattice-seg', {
        dyadDots: (on) => { setDyadDots(on); invalidateDyads(); updateChannelVisibility(); },
        dyadLabels: (on) => { setDyadLabels(on); invalidateDyads(); updateChannelVisibility(); },
    });

    press('dyadSnap', 'dyad-snap-v',
        (v) => { setDyadSnap(v); },
        (v) => (v > 0 ? `${Math.round(v)} px` : 'off'));

    press('dyadGlide', 'dyad-glide-v',
        (v) => setDyadGlide(v / 1000),
        (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`));

    /* ---- the pivot, over two voices ----
     * The same press the other two modes get, one row shorter. S and T are
     * both the labels and the keys, and switching while a dyad is sounding is
     * silent: the incoming pivot inherits the pitch that voice already has. */
    const DYAD_PARTS = { S: 1, T: 0 };
    const dyadPivotSeg = $('dyad-pivot-seg');

    const pickDyadPivot = (index) => {
        for (const b of dyadPivotSeg.querySelectorAll('button')) {
            b.classList.toggle('on', b.dataset.v === String(index));
        }
        applyDyadPivot(index);
    };

    dyadPivotSeg.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button');
        if (btn && dyadPivotSeg.contains(btn)) pickDyadPivot(parseInt(btn.dataset.v));
    });

    /* ---------------- Motion ----------------
     * The slider and the [ ] keys are the same setting, so both go through
     * showRotation and neither can get ahead of the other. */
    const rotSlider = $('rotationSpeed');
    const showRotation = () => {
        rotSlider.value = rotToSlider(rotationSpeed);
        $('rotation-v').textContent = rotLabel(rotationSpeed);
    };
    rotSlider.addEventListener('input', () => {
        setRotationSpeed(sliderToRot(parseFloat(rotSlider.value)));
        $('rotation-v').textContent = rotLabel(rotationSpeed);
    });
    showRotation();

    const autoRotateButton = $('autoRotate');
    autoRotateButton.addEventListener('click', () => {
        setAutoRotate(!autoRotate);
        autoRotateButton.classList.toggle('latched', autoRotate);
    });

    /* three-visualizer's own key handler is what actually changes the speed
     * — it owns the scene — so the panel follows it rather than duplicating
     * the arithmetic. Reading on keyup catches the whole of a held repeat. */
    window.addEventListener('keyup', (ev) => {
        if ('[]{}'.includes(ev.key)) showRotation();
    });

    /* ---------------- Notation ---------------- */
    const notationOptions = $('notation-options');
    const sagittalOptions = $('sagittal-options');

    /* Sagittal's own precision/flavour controls matter whenever Sagittal is
       the standing spelling preference. */
    const showSagittalOptions = () => {
        sagittalOptions.style.display = notationSpelling === 'sagittal' ? 'block' : 'none';
    };

    toggleSeg('notation-enable-seg', (v, on) => {
        setEnableNotation(on);
        notationOptions.style.display = on ? 'block' : 'none';
        if (!on && notationDisplay) notationDisplay.style.display = 'none';
    });

    /* HEJI/Sagittal is a standing preference, independent of which readouts
       are switched on below — it decides only which spelling those use. */
    seg('notation-spelling-seg', (v) => {
        setNotationSpelling(v);
        showSagittalOptions();
    });
    showSagittalOptions();

    /* Ratio, Cents and 12EDO are independent rather than a choice of one:
       any combination can be shown, so this is a flag pair like Fill/Lines,
       not a seg. */
    flagSeg('notation-format-seg', {
        notationShowRatio: (on) => setNotationShowRatio(on),
        notationShowCents: (on) => setNotationShowCents(on),
        notationShowDeviation: (on) => setNotationShowDeviation(on),
    });

    $('sagittalPrecision').addEventListener('change', (e) => setSagittalPrecision(e.target.value));
    seg('sagittal-flavour', (v) => setSagittalEvo(v === 'evo'));

    /* ---------------- Play: output ---------------- */
    const playbackModeSelect = $('playbackMode');
    const midiOutputSelect = $('midiOutputSelect');
    const mpePressureRow = $('mpe-pressure-row');
    const mpePressureSlider = $('mpePressureSlider');
    if (mpePressureSlider) mpePressureSlider.value = mpePressure;

    const updateMpePressureSliderVisibility = () => {
        const isMpePlayback = playbackModeSelect.value === 'mpe-midi' || playbackModeSelect.value === 'both';
        const isMidiOutputSelected = midiOutputSelect
            && midiOutputSelect.value !== 'No devices found' && midiOutputSelect.value !== '';
        if (mpePressureRow) {
            mpePressureRow.style.display = (isMpePlayback && isMidiOutputSelected) ? 'block' : 'none';
        }
    };

    playbackModeSelect.addEventListener('change', async (event) => {
        const selectedMode = event.target.value;
        setPlaybackMode(selectedMode);
        const midiDeviceSelectorDiv = $('midi-device-selector');
        if (selectedMode === 'mpe-midi' || selectedMode === 'both') {
            await initMidiOutput();
            if (midiDeviceSelectorDiv) midiDeviceSelectorDiv.style.display = 'block';
        } else if (midiDeviceSelectorDiv) {
            midiDeviceSelectorDiv.style.display = 'none';
        }
        updateMpePressureSliderVisibility();
    });

    if (midiOutputSelect) {
        midiOutputSelect.addEventListener('change', updateMpePressureSliderVisibility);
    }
    updateMpePressureSliderVisibility();

    if (mpePressureSlider) {
        mpePressureSlider.addEventListener('input', (event) => {
            const newPressure = parseInt(event.target.value);
            setMpePressure(newPressure);
            mpeChannels.forEach(channel => sendMpePressure(channel, newPressure));
        });
    }

    /* ---------------- Play: voice leading ---------------- */
    const enableSlideCheckbox = $('enableSlide');
    const slideDurationRow = $('slide-duration-row');
    const slideDurationInput = $('slideDuration');
    slideDurationRow.style.display = enableSlideCheckbox.checked ? 'block' : 'none';
    enableSlideCheckbox.addEventListener('change', (event) => {
        setEnableSlide(event.target.checked);
        slideDurationRow.style.display = event.target.checked ? 'block' : 'none';
    });
    const showSlide = () => {
        $('slide-v').textContent = `${parseFloat(slideDurationInput.value).toFixed(2)} s`;
    };
    slideDurationInput.addEventListener('input', (event) => {
        setSlideDuration(parseFloat(event.target.value));
        showSlide();
    });
    showSlide();

    seg('pivot-seg', (v, btn) => setCurrentPivotVoiceIndex(parseInt(btn.dataset.pivotIndex)));

    /* ---------------- Play: the synth ----------------
     * Xenachord's own picker and ADSR editor, built from the same modules, so
     * the two apps cannot come to offer different shapes. */
    const picker = createTimbrePicker(
        { family: $('s-family'), slider: $('s-timbre'), ticks: $('s-ticks'),
          label: $('s-label'), canvas: $('s-wave') },
        {
            value: S.timbre,
            line: LINE,
            axis: AXIS,
            /* Also recorded in globals: Triads' Sethares surface is computed
               from the partials of whatever wave is currently loaded, so the
               model has to be able to ask. */
            onInput: (v) => {
                S.timbre = v; setTimbre(v); setCurrentTimbre(v);
                /* Sethares is a statement about a spectrum, so the surface —
                   and the curve — are out of date the moment the wave changes.
                   Nothing happens while any other model is up, or none. */
                if ((appMode === 'triads' && triadModel === 'sethares')
                 || (appMode === 'dyads' && dyadModel === 'sethares')) scheduleApply('model');
            },
            onChange: save,
        },
    );

    /** The four numbers under the curve, in the units they are set in. */
    function showAdsr() {
        const e = S.adsr;
        const ms = (v) => (v >= 1 ? `${v.toFixed(2)} s` : `${Math.round(v * 1000)} ms`);
        $('s-a').textContent = `A ${ms(e.a)}`;
        $('s-d').textContent = `D ${ms(e.d)}`;
        $('s-s').textContent = `S ${Math.round(e.s * 100)}%`;
        $('s-r').textContent = `R ${ms(e.r)}`;
    }

    const adsrEditor = attachAdsrEditor(
        $('s-adsr'),
        () => S.adsr,
        (next) => { S.adsr = next; setAdsr(next); showAdsr(); save(); },
        { line: LINE, axis: AXIS },
    );

    setTimbre(S.timbre);
    setCurrentTimbre(S.timbre);
    setAdsr(S.adsr);
    showAdsr();

    /* The canvases have no size until they are laid out, and a drawer that is
     * hidden has none at all — so they are drawn again whenever they get one. */
    const ro = new ResizeObserver(() => { picker.refresh(); adsrEditor.redraw(); });
    ro.observe($('s-wave'));
    ro.observe($('s-adsr'));

    /* ---------------- Export ----------------
     * The same three exports the key commands have always run — the buttons
     * and the shortcuts call one function each, so neither can drift. */
    /* One press per format, and the mode decides what it means — a picture of
       the tetrahedron, of the triangle or of the plot, and the chords behind
       whichever it is. The three key commands below go through these same
       three functions, so a shortcut and a button cannot come to save
       different things. */
    const perMode = (dyads, triads, tetrads) => () => (
        appMode === 'dyads' ? dyads() : appMode === 'triads' ? triads() : tetrads());

    const saveSVG = perMode(saveDyadSVG, saveTriadSVG,
        () => downloadSVG(exportToSVG(), 'tetrads-export.svg'));
    const savePNG = perMode(saveDyadPNG, saveTriadPNG,
        () => exportToPNG('tetrads-export.png'));
    const saveCSV = perMode(exportDyadCSV, exportTriadCSV, exportToCSV);

    $('dl-svg').addEventListener('click', saveSVG);
    $('dl-png').addEventListener('click', savePNG);
    $('dl-csv').addEventListener('click', saveCSV);

    /* ---------------- the two presses ---------------- */
    const playButtonElement = $('playButton');
    if (playButtonElement) {
        playButtonElement.addEventListener('click', () => {
            setIsClickPlayModeActive(!isClickPlayModeActive);
            playButtonElement.classList.toggle('play-button-active', isClickPlayModeActive);
            if (controls) controls.enabled = !isClickPlayModeActive;
            if (!isClickPlayModeActive) {
                if (!isShiftHeld && controls) controls.enablePan = true;
                stopChord();
                setCurrentlyHovered(null);
            }
        });
    }

    /* ---------------------------------------------------------------------
     *  The runner
     *
     *  What Update and Generate Model used to do, on their own initiative.
     *  All three modes are built from the same limit, equave and complexity
     *  measure, so this means the same thing in each: bring what is on screen
     *  up to date with what the drawers say. Which mode is up decides only
     *  which generator is asked.
     * ------------------------------------------------------------------ */

    /** Rebuild the tetrahedron from the panel. */
    async function applyTetrads(force = false) {
        const raw = $('limitValue').value;
        let limitValue = raw;
        let virtualFundamentalFilter = null;

        if (raw.includes('/')) {
            const parts = raw.split('/');
            limitValue = parts[0].trim();
            const filterStr = parts[1].trim();
            virtualFundamentalFilter = [];
            if (filterStr.includes('...')) {
                const [a, b] = filterStr.split('...');
                const start = parseInt(a), stop = parseInt(b);
                if (!isNaN(start) && !isNaN(stop)) {
                    for (let i = start; i <= stop; i++) virtualFundamentalFilter.push(i);
                }
            } else {
                virtualFundamentalFilter = filterStr.split('.')
                    .map((n) => parseInt(n.trim())).filter((n) => !isNaN(n));
            }
        }

        /* A half-typed limit is not a limit. Without this, clearing the field
           to retype it would generate the empty set on the way through — which
           was invisible while a press was required and is not now. */
        if (!(parseFloat(limitValue) >= 1)) return false;
        const equaveRatio = parseFloat($('equaveRatio').value);
        if (!(equaveRatio > 1)) return false;

        /* And a mistyped one is not a limit either. See work-estimate.js: a
           slip that turns 13 into 1113 asks for a trillion chords, and in
           Pyodide that is a tab that never comes back. ↵ runs it anyway. */
        const o = { limitValue, equaveRatio, limitType: $('limitType').value,
                    maxExponent: $('maxExponent').value };
        const work = await estimateWork(o, 4);
        if (!force && work > WORK_BUDGET) {
            showStatus(`${sayWork(work)} tetrads — press ↵ to generate anyway`);
            return false;
        }

        await updateTetrahedron(
            $('limitType').value, limitValue, $('maxExponent').value,
            virtualFundamentalFilter, equaveRatio, $('complexityMethod').value,
            $('hideUnisonVoices').checked, $('omitOctaves').checked,
            parseFloat($('baseSize').value), parseFloat($('scalingFactor').value),
            $('enableSize').checked, $('enableColor').checked, $('layoutDisplay').value,
        );
        return true;
    }

    /**
     * Run whatever has been asked for, then run anything asked for while it
     * was running.
     *
     * The re-entrancy guard matters more than it looks: the work is not
     * interruptible, so a change made during it cannot be serviced until it
     * ends — and dropping that change would leave the picture disagreeing with
     * the panel, which is exactly the failure a self-applying panel must not
     * have. So it is remembered and the loop goes round again.
     */
    applyNow = async () => {
        clearTimeout(settleTimer);
        lastChangeAt = 0;
        if (running) return;
        running = true;
        try {
            while (pendingSet || pendingModel) {
                const wantSet = pendingSet, wantModel = pendingModel;
                const force = pendingForce;
                pendingSet = pendingModel = pendingForce = false;

                if (wantSet) {
                    showStatus('working…', true);
                    /* Two frames, so the status is actually on screen before
                       the thread is taken away to do the work. */
                    await letStatusPaint();
                    const done = appMode === 'dyads' ? await refreshDyadSet(force)
                        : appMode === 'triads' ? await refreshSet(force)
                        : await applyTetrads(force);
                    /* A refusal has already said why in the foot, so the
                       generic line below must not overwrite it. */
                    if (done === false) { showStatus($('panel-status').textContent); continue; }
                }
                if (wantModel) {
                    if (appMode === 'triads') await generateSurface(triadModel);
                    else if (appMode === 'dyads') await generateDyadModel(dyadModel);
                }
                if (appMode === 'tetrads') showStatus('tetrads');
            }
        } finally {
            running = false;
        }
    };

    /* ---------------- the tetrahedron, as a mode ----------------
     * Registered here rather than in a module of its own because this is where
     * applyTetrads lives, and its enter hook is that plus two pieces of
     * bookkeeping that only the tetrahedron needs:
     *
     *   IT IS NOT BUILT AT STARTUP. The app opens in Triads, and generating a
     *   set nobody has asked to see is several hundred milliseconds of a
     *   blocked thread on the way to a picture of something else. The first
     *   visit builds it.
     *
     *   A COLORMAP CHOSEN WHILE IT WAS HIDDEN has to be applied properly on
     *   the way back. The other two modes shade at paint time, so a ramp
     *   change there is a repaint; the tetrahedron bakes its colours into its
     *   sprites and takes its ground from the layout, so it is a rebuild.
     *   Recorded on the way OUT rather than on the way in, so it does not
     *   matter which of the other two modes you went to.
     */
    let tetradsBuilt = false;
    let layoutOnLeaving = null;

    registerMode('tetrads', {
        title: 'Tetrads',
        view: () => 'tetra',
        resize: onWindowResize,
        leave: () => { layoutOnLeaving = currentLayoutMode; },
        enter: async () => {
            if (!tetradsBuilt) {
                tetradsBuilt = true;
                showStatus('working…', true);
                await letStatusPaint();
                await applyTetrads(true);
            } else if (layoutOnLeaving !== null && layoutOnLeaving !== currentLayoutMode) {
                await setLayoutMode(currentLayoutMode);
            }
            layoutOnLeaving = null;
            showStatus('tetrads');
        },
    });

    /* ---------------- keyboard ---------------- */

    /* The initials hold a voice, exactly as S/A/T/B do in Tetrads — where the
     * tetrahedron's own key handler owns them (see three-visualizer.js, which
     * stands down in the other two modes). Three parts in the triangle and two
     * on the plot, from the same run of letters, so the key that holds the top
     * voice is S wherever you are. A press while a field is focused is a
     * letter being typed into it, not a pivot. */
    document.addEventListener('keydown', (event) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (appMode !== 'triads' && appMode !== 'dyads') return;
        const tag = event.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        const parts = appMode === 'triads' ? TRIAD_PARTS : DYAD_PARTS;
        const index = parts[event.key.toUpperCase()];
        if (index === undefined) return;
        event.preventDefault();
        if (appMode === 'triads') pickTriadPivot(index);
        else pickDyadPivot(index);
    });

    document.addEventListener('keydown', (event) => {
        const tagName = event.target.tagName;
        /* Nothing needs pressing any more, but a settle timer is still a
           short wait — so Enter means "don't wait", which is the nearest
           surviving sense of what it used to do. */
        if (event.key === 'Enter') {
            event.preventDefault();
            if (tagName === 'INPUT') event.target.blur();
            scheduleApply('set', true);   // ↵ overrides the budget
            applyNow?.();
        }
    });

    document.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toUpperCase() === 'E') {
            event.preventDefault();
            saveSVG();
        }
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toUpperCase() === 'L') {
            event.preventDefault();
            // Through the chips, so the panel keeps saying which layout is on.
            applyColormap((currentLayoutMode + 1) % COLORMAP_COUNT);
        }
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toUpperCase() === 'S') {
            event.preventDefault();
            saveCSV();
        }
        // Spacebar puts the next chord back on the fixed base frequency —
        // whichever mode's pivot is the one currently holding a pitch.
        if (event.key === ' ' && event.target.tagName !== 'INPUT') {
            event.preventDefault();
            setLastPlayedFrequencies([]);
            setLastPlayedRatios([]);
            resetReference();
            resetDyadReference();
        }
    });
}
