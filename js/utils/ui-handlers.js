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
    notationDisplay, isClickPlayModeActive, isShiftHeld,
    setEnableNotation, setNotationType, setEnableSlide, setSlideDuration, setPlaybackMode,
    setSagittalPrecision, setSagittalEvo,
    setCurrentPivotVoiceIndex, setIsClickPlayModeActive, setCurrentlyHovered,
    setLastPlayedFrequencies, setLastPlayedRatios,
    controls,
    mpePressure, setMpePressure
} from '../globals.js';
import { stopChord, setTimbre, setAdsr } from '../components/audio-engine.js';
import { updateTetrahedron, cycleLayoutMode } from '../calculations/tetrahedron-updater.js';
import { exportToSVG, downloadSVG, exportToCSV } from './data-export.js';
import { initMidiOutput, sendMpePressure, mpeChannels } from '../midi/midi-output.js';
import { createTimbrePicker, FILTERED_MIN } from '../synth/timbre.js';
import { attachAdsrEditor } from '../synth/adsr.js';

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

    for (const id of ['baseSize', 'scalingFactor']) {
        $(id).addEventListener('input', () => updateButton.click());
    }

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
    slideDurationInput.addEventListener('change', (event) => {
        setSlideDuration(parseFloat(event.target.value));
    });

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
            onInput: (v) => { S.timbre = v; setTimbre(v); },
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
    setAdsr(S.adsr);
    showAdsr();

    /* The canvases have no size until they are laid out, and a drawer that is
     * hidden has none at all — so they are drawn again whenever they get one. */
    const ro = new ResizeObserver(() => { picker.refresh(); adsrEditor.redraw(); });
    ro.observe($('s-wave'));
    ro.observe($('s-adsr'));

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
            downloadSVG(exportToSVG(), 'tetrads-export.svg');
        }
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toUpperCase() === 'L') {
            event.preventDefault();
            cycleLayoutMode();
        }
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toUpperCase() === 'S') {
            event.preventDefault();
            exportToCSV();
        }
        // Spacebar puts the next chord back on the fixed base frequency.
        if (event.key === ' ' && event.target.tagName !== 'INPUT') {
            event.preventDefault();
            setLastPlayedFrequencies([]);
            setLastPlayedRatios([]);
        }
    });
}
