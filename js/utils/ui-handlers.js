/* =====================================================================
 *  THE PANEL
 * =====================================================================
 *
 * Three drawers behind one rail, in Xenachord Designer's own idiom, and the
 * split between them is by what a control is FOR rather than by what it acts
 * on:
 *
 *   Complexity Measures  which tetrads exist at all
 *   Display              what is done with the ones that do
 *   Play                 what they sound like
 *
 * Update and Play sit under all three, in the panel's foot, because every
 * drawer can change what the next press generates and a button that vanished
 * with its drawer would have to be gone looking for.
 * ------------------------------------------------------------------ */

import {
    enableNotation, notationType, enableSlide, slideDuration, playbackMode,
    rotationSpeed, setRotationSpeed, autoRotate, setAutoRotate,
    notationDisplay, isClickPlayModeActive, isShiftHeld, currentLayoutMode,
    setEnableNotation, setNotationType, setEnableSlide, setSlideDuration, setPlaybackMode,
    setSagittalPrecision, setSagittalEvo, setCurrentLayoutMode,
    setCurrentPivotVoiceIndex, setIsClickPlayModeActive, setCurrentlyHovered,
    setLastPlayedFrequencies, setLastPlayedRatios,
    controls,
    mpePressure, setMpePressure
} from '../globals.js';
import { stopChord, setTimbre, setAdsr } from '../components/audio-engine.js';
import { updateTetrahedron, setLayoutMode, LAYOUT_GROUNDS } from '../calculations/tetrahedron-updater.js';
import { exportToSVG, downloadSVG, exportToPNG, exportToCSV } from './data-export.js';
import { saveTriadSVG, saveTriadPNG, exportTriadCSV } from '../triads/triad-export.js';
import { plasmaColormap, viridisColormap, greyscaleColormap, greyscaleBlackColormap } from '../calculations/color-mapping.js';
import { initMidiOutput, sendMpePressure, mpeChannels } from '../midi/midi-output.js';
import { createTimbrePicker, FILTERED_MIN } from '../synth/timbre.js';
import { attachAdsrEditor } from '../synth/adsr.js';
import { setCurrentTimbre } from '../globals.js';
import {
    appMode, triadModel, setTriadModel, setTriadFill, setTriadLines,
    setTriadContours, setTriadRelief, setTriadDots, setTriadLabels,
    setTriadSnap, setTriadGlide, heParams, smParams,
} from '../triads/triad-state.js';
import {
    switchMode, refreshSet, generateSurface, applyView, applyPivot,
    invalidate as invalidateTriads, resetReference, layout as layoutStage,
} from '../triads/triad-mode.js';

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
 *  A layout is a ramp and the ground it is drawn on, in the order
 *  currentLayoutMode counts them. The chips are painted by sampling the very
 *  functions the scene colours itself with, so the swatch is the map rather
 *  than a picture of it — add a colormap and the panel gets it right without
 *  a second table being kept in step.
 * ------------------------------------------------------------------ */
const COLORMAPS = [
    { name: 'Plasma',   fn: plasmaColormap,
      title: 'Perceptually uniform, dark blue through magenta to yellow.' },
    { name: 'Viridis',  fn: viridisColormap,
      title: 'Perceptually uniform, deep violet through green to yellow.' },
    { name: 'Black',    fn: greyscaleBlackColormap,
      title: 'Greyscale on a black ground: the simplest tetrads come out brightest.' },
    { name: 'White',    fn: greyscaleColormap,
      title: 'Greyscale on a white ground: the simplest tetrads come out darkest — the layout to print.' },
];

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
 *  rotationSpeed is radians per frame, and it spans two orders of magnitude —
 *  0.001 barely creeps, 0.1 is a blur — so the slider is exponential over it.
 *  Linear, the whole usable range would sit in the first two millimetres.
 *  [ and ] step it by 10% either way, which is a fixed number of slider
 *  positions on an exponential scale and a wildly varying one on a linear.
 * ------------------------------------------------------------------ */
const ROT_MIN = 0.001, ROT_MAX = 0.1;
const rotToSlider = (v) => Math.round(100 * Math.log(v / ROT_MIN) / Math.log(ROT_MAX / ROT_MIN));
const sliderToRot = (t) => ROT_MIN * Math.pow(ROT_MAX / ROT_MIN, t / 100);
/** Radians per frame, said as degrees per second at 60fps — what you see. */
const rotLabel = (v) => `${Math.round(v * 60 * 180 / Math.PI)}\u00b0/s`;

export function setupUIEventListeners() {
    const updateButton = $('updateButton');

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
    seg('mode-seg', (v) => { switchMode(v); });
    document.body.dataset.mode = 'tetrads';

    /* ---------------- Complexity Measures ---------------- */
    const limitTypeSelect = $('limitType');
    const primeLimitOptions = $('prime-limit-options');
    primeLimitOptions.style.display = limitTypeSelect.value === 'Prime' ? 'block' : 'none';
    limitTypeSelect.addEventListener('change', (event) => {
        primeLimitOptions.style.display = event.target.value === 'Prime' ? 'block' : 'none';
    });

    /* ---------------- Display ---------------- */
    const layoutDisplay = $('layoutDisplay');
    seg('layout-seg', (v) => { layoutDisplay.value = v; updateButton.click(); });

    toggleSeg('channel-seg', () => updateButton.click());

    /* ---------------- the colormap chips ---------------- */
    const mapsEl = $('colormap-seg');
    COLORMAPS.forEach((m, i) => {
        const b = document.createElement('button');
        b.className = 'map' + (i === currentLayoutMode ? ' on' : '');
        b.dataset.v = String(i);
        b.dataset.ground = LAYOUT_GROUNDS[i] === 0xffffff ? 'light' : 'dark';
        b.title = m.title;
        b.innerHTML = `<span class="ramp"></span>${m.name}`;
        b.querySelector('.ramp').style.background = rampCss(m.fn);
        mapsEl.append(b);
    });

    /**
     * Light one chip and take the scene to it. The seg and ⇧⌘L share this.
     *
     * The tetrahedron bakes its colours into sprites at build time, so a new
     * ramp means regenerating the set. The triangle keeps its field as
     * numbers and is only shaded at paint time, so the same press there is a
     * repaint — which is the point of not asking a plotting library for a
     * picture in the first place.
     */
    const applyColormap = (index) => {
        for (const b of mapsEl.querySelectorAll('button')) {
            b.classList.toggle('on', b.dataset.v === String(index));
        }
        if (appMode === 'triads') {
            setCurrentLayoutMode(index);
            invalidateTriads({ rebuild: true });
        } else {
            setLayoutMode(index);
        }
    };
    seg('colormap-seg', (v) => applyColormap(parseInt(v)));

    for (const id of ['baseSize', 'scalingFactor']) {
        $(id).addEventListener('input', () => updateButton.click());
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
     * Choosing shows that model's parameters and nothing more. The field is
     * not built until Generate, so you can set a model up before paying for
     * it — and Blank takes effect at once, because it costs nothing. */
    const modelParams = { he: $('he-params'), sethares: $('sm-params') };
    const resRow = $('triad-res-row'), resInput = $('triadResolution');
    const showModelParams = (model) => {
        for (const [name, el] of Object.entries(modelParams)) {
            el.classList.toggle('mode-off', name !== model);
        }
        const needsGrid = model !== 'blank';
        resRow.style.display = needsGrid ? 'flex' : 'none';
        resInput.style.display = needsGrid ? 'block' : 'none';
        $('triad-generate').disabled = false;
    };
    seg('triad-model-seg', (v) => {
        setTriadModel(v);
        showModelParams(v);
        if (v === 'blank') generateSurface('blank');
    });
    showModelParams('blank');

    $('triad-generate').addEventListener('click', () => generateSurface(triadModel));

    /* The model's own numbers. They change what the NEXT generate produces,
       so none of them redraws anything on its own. */
    press('heSpread', 'he-spread-v', (v) => { heParams.spread = v; }, (v) => `${v} ¢`);
    press('heNLimit', 'he-n-v', (v) => { heParams.nLimit = v; }, (v) => `${v}`);
    press('heAlpha', 'he-alpha-v', (v) => { heParams.alpha = v; }, (v) => v.toFixed(1));
    press('smPartials', 'sm-partials-v', (v) => { smParams.partials = v; }, (v) => `${v}`);
    press('smStep', 'sm-step-v', (v) => { smParams.step = v; }, (v) => v.toFixed(3));
    press('smRamp', 'sm-ramp-v', (v) => { smParams.ramp = v; }, (v) => v.toFixed(1));
    press('triadResolution', 'triad-res-v', (v) => {
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
        triadDots: (on) => { setTriadDots(on); invalidateTriads(); },
        triadLabels: (on) => { setTriadLabels(on); invalidateTriads(); },
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
    const notationTypeInput = $('notationType');
    const notationOptions = $('notation-options');
    const sagittalOptions = $('sagittal-options');

    const showSagittalOptions = () => {
        sagittalOptions.style.display = notationTypeInput.value === 'sagittal' ? 'block' : 'none';
    };

    $('enableNotation').addEventListener('change', (event) => {
        setEnableNotation(event.target.checked);
        notationOptions.style.display = event.target.checked ? 'block' : 'none';
        if (!event.target.checked && notationDisplay) notationDisplay.style.display = 'none';
    });

    seg('notation-seg', (v) => {
        notationTypeInput.value = v;
        setNotationType(v);
        showSagittalOptions();
    });
    showSagittalOptions();

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
            onInput: (v) => { S.timbre = v; setTimbre(v); setCurrentTimbre(v); },
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
       the tetrahedron or a picture of the triangle, the tetrads or the triads.
       The three key commands below go through these same three functions, so
       a shortcut and a button cannot come to save different things. */
    const saveSVG = () => (appMode === 'triads'
        ? saveTriadSVG() : downloadSVG(exportToSVG(), 'tetrads-export.svg'));
    const savePNG = () => (appMode === 'triads'
        ? saveTriadPNG() : exportToPNG('tetrads-export.png'));
    const saveCSV = () => (appMode === 'triads' ? exportTriadCSV() : exportToCSV());

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

    updateButton.addEventListener('click', async () => {
        /* One press, two sets. Both modes are built from the same limit,
           equave and complexity measure, so Update means the same thing in
           each — regenerate what is on screen from what the drawers say. */
        if (appMode === 'triads') { await refreshSet(); return; }

        const newLimitType = $('limitType').value;
        const newLimitValueInput = $('limitValue').value;
        let newLimitValue = newLimitValueInput;
        let newVirtualFundamentalFilter = null;

        if (newLimitValueInput.includes('/')) {
            const parts = newLimitValueInput.split('/');
            newLimitValue = parts[0].trim();
            const filterStr = parts[1].trim();

            newVirtualFundamentalFilter = [];
            if (filterStr.includes('...')) {
                const rangeParts = filterStr.split('...');
                const start = parseInt(rangeParts[0]);
                const end = parseInt(rangeParts[1]);
                if (!isNaN(start) && !isNaN(end)) {
                    for (let i = start; i <= end; i++) newVirtualFundamentalFilter.push(i);
                }
            } else {
                newVirtualFundamentalFilter = filterStr.split('.').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
            }
        }

        const newMaxExponent = $('maxExponent').value;
        const newEquaveRatio = parseFloat($('equaveRatio').value);
        const newComplexityMethod = $('complexityMethod').value;
        const newHideUnisonVoices = $('hideUnisonVoices').checked;
        const newOmitOctaves = $('omitOctaves').checked;
        const newBaseSize = parseFloat($('baseSize').value);
        const newScalingFactor = parseFloat($('scalingFactor').value);
        const newEnableSize = $('enableSize').checked;
        const newEnableColor = $('enableColor').checked;
        const newLayoutDisplay = $('layoutDisplay').value;

        await updateTetrahedron(
            newLimitType, newLimitValue, newMaxExponent, newVirtualFundamentalFilter, newEquaveRatio, newComplexityMethod,
            newHideUnisonVoices, newOmitOctaves, newBaseSize, newScalingFactor,
            newEnableSize, newEnableColor, newLayoutDisplay
        );
    });

    /* ---------------- keyboard ---------------- */

    /* S, A and T hold a voice, exactly as S/A/T/B do in Tetrads — where the
     * tetrahedron's own key handler owns them (see three-visualizer.js, which
     * stands down in this mode). A press while a field is focused is a letter
     * being typed into it, not a pivot. */
    document.addEventListener('keydown', (event) => {
        if (appMode !== 'triads' || event.metaKey || event.ctrlKey || event.altKey) return;
        const tag = event.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        const index = TRIAD_PARTS[event.key.toUpperCase()];
        if (index === undefined) return;
        event.preventDefault();
        pickTriadPivot(index);
    });

    document.addEventListener('keydown', (event) => {
        const tagName = event.target.tagName;
        if (event.key === 'Enter' && tagName !== 'INPUT' && tagName !== 'TEXTAREA') {
            event.preventDefault();
            updateButton.click();
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
            applyColormap((currentLayoutMode + 1) % COLORMAPS.length);
        }
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toUpperCase() === 'S') {
            event.preventDefault();
            saveCSV();
        }
        // Spacebar puts the next chord back on the fixed base frequency.
        if (event.key === ' ' && event.target.tagName !== 'INPUT') {
            event.preventDefault();
            setLastPlayedFrequencies([]);
            setLastPlayedRatios([]);
            resetReference();
        }
    });
}
