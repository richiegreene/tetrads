
import {
    enableNotation, notationType, enableSlide, slideDuration, playbackMode,
    notationDisplay, playButton, pivotButtons, currentPivotVoiceIndex,
    isClickPlayModeActive, isShiftHeld,
    setEnableNotation, setNotationType, setEnableSlide, setSlideDuration, setPlaybackMode,
    setCurrentPivotVoiceIndex, setIsClickPlayModeActive, setCurrentlyHovered,
    controls
} from '../globals.js';
import { updateWaveform } from '../components/audio-engine.js';
import { updateTetrahedron, cycleLayoutMode } from '../calculations/tetrahedron-updater.js';
import { stopChord } from '../components/audio-engine.js';
import { exportToSVG, downloadSVG, exportToCSV, downloadCSV } from './data-export.js';

export function setupUIEventListeners() {
    const limitTypeSelect = document.getElementById('limitType');
    const primeLimitOptions = document.getElementById('prime-limit-options');
    const enableNotationCheckbox = document.getElementById('enableNotation');
    const notationTypeSelect = document.getElementById('notationType');
    const enableSlideCheckbox = document.getElementById('enableSlide');
    const slideDurationInput = document.getElementById('slideDuration');
    const timbreSlider = document.getElementById('timbreSlider');
    const baseSizeSlider = document.getElementById('baseSize');
    const scalingFactorSlider = document.getElementById('scalingFactor');
    const updateButton = document.getElementById('updateButton');
    const playButtonElement = document.getElementById('playButton');
    const pivotButtonsElements = document.querySelectorAll('.pivot-button');
    const settingsHeader = document.getElementById('settings-header');
    const settingsContent = document.getElementById('settings-content');
    const toggleIcon = settingsHeader.querySelector('.toggle-icon');
    const infoLink = document.getElementById('info-link');
    const playbackModeSelect = document.getElementById('playbackMode'); // Get new dropdown

    // Initial setup for prime limit options
    primeLimitOptions.style.display = limitTypeSelect.value === 'Prime' ? 'flex' : 'none';

    playbackModeSelect.addEventListener('change', (event) => {
        setPlaybackMode(event.target.value);
        // Optionally, add logic here to stop current browser audio if switching to MPE MIDI only
        // or re-trigger updateTetrahedron if playback mode affects visualization logic
    });


    limitTypeSelect.addEventListener('change', (event) => {
        primeLimitOptions.style.display = event.target.value === 'Prime' ? 'flex' : 'none';
    });

    enableNotationCheckbox.addEventListener('change', (event) => {
        setEnableNotation(event.target.checked);
        notationTypeSelect.style.display = enableNotation ? 'inline-block' : 'none';
        if (!enableNotation && notationDisplay) {
            notationDisplay.style.display = 'none';
        }
    });

    notationTypeSelect.addEventListener('change', (event) => {
        setNotationType(event.target.value);
    });

    enableSlideCheckbox.addEventListener('change', (event) => {
        setEnableSlide(event.target.checked);
        slideDurationInput.style.display = enableSlide ? 'inline-block' : 'none';
    });

    slideDurationInput.addEventListener('change', (event) => {
        setSlideDuration(parseFloat(event.target.value));
    });

    timbreSlider.addEventListener('input', (event) => {
        updateWaveform(parseFloat(event.target.value));
    });

    // Live-update sliders: Base Size and Measure (scalingFactor)
    if (baseSizeSlider) {
        baseSizeSlider.addEventListener('input', () => {
            updateButton.click();
        });
    }

    if (scalingFactorSlider) {
        scalingFactorSlider.addEventListener('input', () => {
            updateButton.click();
        });
    }

    pivotButtonsElements.forEach(button => {
        button.addEventListener('click', () => {
            const selectedIndex = parseInt(button.dataset.pivotIndex);
            setCurrentPivotVoiceIndex(selectedIndex);
            // This is a UI update, not a tetrahedron update, so just update selection visual
            pivotButtonsElements.forEach(btn => {
                if (parseInt(btn.dataset.pivotIndex) === selectedIndex) {
                    btn.classList.add('selected');
                } else {
                    btn.classList.remove('selected');
                }
            });
        });
    });

    if (playButtonElement) { // Use the element retrieved by ID
        playButtonElement.addEventListener('click', () => {
            setIsClickPlayModeActive(!isClickPlayModeActive);
            playButtonElement.classList.toggle('play-button-active', isClickPlayModeActive);
            if (controls) controls.enabled = !isClickPlayModeActive;
                            if (!isClickPlayModeActive) {
                                if (!isShiftHeld && controls) controls.enablePan = true;
                                if (typeof stopChord === 'function') { // Check if stopChord is defined and imported
                                    stopChord(); 
                                }
                                setCurrentlyHovered(null);
                            }        });
    }

    updateButton.addEventListener('click', async () => {
        const newLimitType = document.getElementById('limitType').value;
        const newLimitValueInput = document.getElementById('limitValue').value;
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
                    for (let i = start; i <= end; i++) {
                        newVirtualFundamentalFilter.push(i);
                    }
                }
            } else {
                newVirtualFundamentalFilter = filterStr.split('.').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
            }
        }

        const newMaxExponent = document.getElementById('maxExponent').value;
        const newEquaveRatio = parseFloat(document.getElementById('equaveRatio').value);
        const newComplexityMethod = document.getElementById('complexityMethod').value;
        const newHideUnisonVoices = document.getElementById('hideUnisonVoices').checked;
        const newOmitOctaves = document.getElementById('omitOctaves').checked;
        const newBaseSize = parseFloat(document.getElementById('baseSize').value);
        const newScalingFactor = parseFloat(document.getElementById('scalingFactor').value);
        const newEnableSize = document.getElementById('enableSize').checked;
        const newEnableColor = document.getElementById('enableColor').checked;
        const newLayoutDisplay = document.getElementById('layoutDisplay').value;
        // setCurrentLayoutDisplay(newLayoutDisplay); // This should be handled by updateTetrahedron's internal logic or passed through

        await updateTetrahedron(
            newLimitType, newLimitValue, newMaxExponent, newVirtualFundamentalFilter, newEquaveRatio, newComplexityMethod, 
            newHideUnisonVoices, newOmitOctaves, newBaseSize, newScalingFactor, 
            newEnableSize, newEnableColor, newLayoutDisplay
        );
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
            const svgData = exportToSVG();
            downloadSVG(svgData, 'tetrads-export.svg');
        }
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toUpperCase() === 'L') {
            event.preventDefault();
            cycleLayoutMode();
        }
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toUpperCase() === 'S') {
            event.preventDefault();
            exportToCSV();
        }
    });

    // Settings Menu Collapse/Expand
    infoLink.addEventListener('click', (event) => {
        event.stopPropagation();
    });

    settingsHeader.addEventListener('click', () => {
        const isCollapsed = settingsHeader.classList.toggle('collapsed');
        settingsContent.style.display = isCollapsed ? 'none' : 'grid';
        toggleIcon.textContent = isCollapsed ? '' : '▼';
    });

    // Initial state for settings menu
    settingsHeader.classList.add('collapsed');
    settingsContent.style.display = 'none';
    toggleIcon.textContent = '';

    document.getElementById('layoutDisplay').addEventListener('change', () => {
        updateButton.click();
    });
}
