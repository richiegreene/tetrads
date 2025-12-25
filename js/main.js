import {
    pyodide, python_ready, currentLayoutDisplay, latestUpdateToken,
    setPyodide, setPythonReady, setLatestUpdateToken,
    setScene, setCamera, setRenderer, setControls,
    setIsShiftHeld, setKeyState, setCurrentlyHovered,
    setPlayButton, setPivotButtons,
    enableNotation, notationType, setNotationDisplay,
    setCurrentLayoutDisplay
} from './globals.js';
import { initThreeJS, animate, onWindowResize, updatePivotButtonSelection } from './components/three-visualizer.js';
import { initAudio, stopChord, playChord, updateWaveform } from './components/audio-engine.js';
import { updateTetrahedron, cycleLayoutMode } from './calculations/tetrahedron-updater.js';
import { setupUIEventListeners } from './utils/ui-handlers.js';

import { initMidiOutput } from './midi/midi-output.js';

// --- MAIN PYODIDE INITIALIZATION ---
async function initPyodide() {
    initMidiOutput(); // Initialize MIDI output
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    setPyodide(await loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/",
    }));
    console.log("Pyodide loaded.");

    pyodide.setStdout({
        write: (msg) => {
            console.log("Python stdout:", msg);
        }
    });
    pyodide.setStderr({
        write: (msg) => {
            console.error("Python stderr:", msg);
        }
    });

    await pyodide.loadPackage(["numpy", "scipy"]);
    console.log("Numpy and Scipy loaded.");

    pyodide.FS.mkdir("python");
    pyodide.FS.mkdir("python/theory");

    const tetrahedron_generator_py_content = `import math
from itertools import combinations_with_replacement
from fractions import Fraction
from theory.calculations import get_odd_limit, get_integer_limit, check_prime_limit, parse_primes, _generate_valid_numbers, calculate_complexity, cents, gcd, get_virtual_fundamental_denominator

def generate_points(limit_value, equave_ratio, limit_mode=\"odd\", max_exponent=3, complexity_measure=\"Tenney\", hide_unison_voices=False, omit_octaves=False, virtual_fundamental_filter=None):
    points = []
    equave_ratio_float = float(equave_ratio)
    
    valid_numbers = _generate_valid_numbers(limit_value, limit_mode, max_exponent, equave_ratio_float)

    if not valid_numbers: return []

    sorted_valid_numbers = sorted(list(valid_numbers))
    
    primes = []
    if limit_mode == \"prime\":
        primes = parse_primes(limit_value)

    for combo in combinations_with_replacement(sorted_valid_numbers, 4):
        if hide_unison_voices and len(set(combo)) < 4: continue
        
        if omit_octaves:
            has_octave = False
            for i in range(len(combo)):
                for j in range(i + 1, len(combo)):
                    if combo[i] == 0: continue
                    ratio = combo[j] / combo[i]
                    if ratio > 1 and math.isclose(math.log2(ratio), round(math.log2(ratio))):
                        has_octave = True
                        break
                if has_octave:
                    break
            if has_octave:
                continue

        i, j, k, l = combo
        
        if i == 0: continue
        if l / i > equave_ratio_float: continue
        if gcd(gcd(gcd(i, j), k), l) != 1: continue

        if virtual_fundamental_filter:
            vf_denom = get_virtual_fundamental_denominator(combo)
            if vf_denom is None or vf_denom not in virtual_fundamental_filter:
                continue
            
        valid_combo = True
        intervals = [Fraction(j, i), Fraction(k, j), Fraction(l, k)]
        if limit_mode == \"odd\":
            limit_val_int = int(limit_value)
            for interval in intervals:
                if get_odd_limit(interval) > limit_val_int:
                    valid_combo = False
                    break
        elif limit_mode == \"integer\":
            limit_val_int = int(limit_value)
            for interval in intervals:
                if get_integer_limit(interval) > limit_val_int:
                    valid_combo = False
                    break
        elif limit_mode == \"prime\":
            for interval in intervals:
                if not check_prime_limit(interval, primes, int(max_exponent)):
                    valid_combo = False
                    break
        
        if not valid_combo: continue
        
        c1 = cents(j / i)
        c2 = cents(k / j)
        c3 = cents(l / k)
        
        complexity = max(calculate_complexity(complexity_measure, f) for f in intervals)
        
        points.append((c1, c2, c3, complexity))
        
    return points
`;
    pyodide.FS.writeFile("python/tetrahedron_generator.py", tetrahedron_generator_py_content, { encoding: "utf8" });

    const calculations_py_content = `import math
from fractions import Fraction
from functools import reduce
from math import gcd
from itertools import combinations_with_replacement

def cents(x):
    return 1200 * math.log2(float(x)) if x > 0 else 0

def lcm(a, b):
    return abs(a * b) // gcd(a, b) if a != 0 and b != 0 else 0

def lcm_list(numbers):
    return reduce(lcm, numbers) if numbers else 0

def get_virtual_fundamental_denominator(chord):
    if not chord or chord[0] == 0:
        return None
    ratios = [Fraction(note, chord[0]).limit_denominator() for note in chord]
    denominators = [r.denominator for r in ratios]
    return lcm_list(denominators)

def get_odd_part_of_number(num):
    if num == 0: return 0
    while num > 0 and num % 2 == 0: num //= 2
    return num

def get_odd_limit(ratio):
    try:
        ratio = Fraction(ratio).limit_denominator(10000)
        n, d = ratio.numerator, ratio.denominator
        return max(get_odd_part_of_number(n), get_odd_part_of_number(d))
    except (ValueError, ZeroDivisionError): return 1

def get_integer_limit(ratio):
    try:
        ratio = Fraction(ratio).limit_denominator(10000)
        return max(ratio.numerator, ratio.denominator)
    except (ValueError, ZeroDivisionError): return 1

def get_prime_factors(n):
    factors = {}
    d = 2
    n = int(n)
    while d * d <= n:
        while (n % d) == 0:
            factors[d] = factors.get(d, 0) + 1
            n //= d
        d += 1
    if n > 1:
        factors[n] = factors.get(n, 0) + 1
    return factors

def check_prime_limit(ratio, primes, max_exponent):
    ratio = Fraction(ratio).limit_denominator(10000)
    num_factors = get_prime_factors(ratio.numerator)
    den_factors = get_prime_factors(ratio.denominator)
    for p, exp in num_factors.items():
        if p not in primes or exp > max_exponent: return False
    for p, exp in den_factors.items():
        if p not in primes or exp > max_exponent: return False
    return True

def parse_primes(limit_value_str):
    limit_value_str = str(limit_value_str)
    if '.' in limit_value_str:
        return [int(p) for p in limit_value_str.split('.') if p.isdigit()]
    else:
        limit = int(limit_value_str)
        primes = []
        for num in range(2, limit + 1):
            is_prime = all(num % i != 0 for i in range(2, int(num**0.5) + 1))
            if is_prime: primes.append(num)
        return primes

def tenney_norm(ratio):
    ratio = Fraction(ratio).limit_denominator(10000)
    return math.log2(ratio.numerator * ratio.denominator)

def weil_norm(ratio):
    ratio = Fraction(ratio).limit_denominator(10000)
    return math.log2(max(ratio.numerator, ratio.denominator))

def wilson_norm(ratio):
    ratio = Fraction(ratio).limit_denominator(10000)
    factors_n = get_prime_factors(ratio.numerator)
    factors_d = get_prime_factors(ratio.denominator)
    return sum(factors_n) + sum(factors_d)

def gradus_norm(ratio):
    ratio = Fraction(ratio).limit_denominator(10000)
    factors_n = get_prime_factors(ratio.numerator)
    factors_d = get_prime_factors(ratio.denominator)
    s = sum(factors_n) + sum(factors_d)
    n = len(factors_n) + len(factors_d)
    return s - n + 1

def benedetti_norm(ratio):
    ratio = Fraction(ratio).limit_denominator(10000)
    return ratio.numerator + ratio.denominator

def arithmetic_norm(ratio):
    ratio = Fraction(ratio).limit_denominator(10000)
    return ratio.numerator + ratio.denominator

def calculate_complexity(complexity_measure, ratio):
    norms = {
        "Tenney": tenney_norm, "Weil": weil_norm, "Wilson": wilson_norm,
        "Gradus": gradus_norm, "Benedetti": benedetti_norm, "Arithmetic": arithmetic_norm
    }
    return norms.get(complexity_measure, lambda r: 0)(ratio)

def _generate_valid_numbers(limit_value, limit_mode, max_exponent=3, equave_ratio=2.0):
    valid_numbers = set()
    if limit_mode == "odd":
        limit_val = int(limit_value)
        max_num_to_check = max(limit_val * int(equave_ratio) * 2, 200)
        for num in range(1, max_num_to_check + 1):
            if get_odd_part_of_number(num) <= limit_val:
                valid_numbers.add(num)
    elif limit_mode == "integer":
        limit_val = int(limit_value)
        for num in range(1, limit_val + 1):
            valid_numbers.add(num)
    elif limit_mode == "prime":
        primes = parse_primes(limit_value)
        if not primes: return {1}
        bound = int(equave_ratio) * max(primes) * int(max_exponent) * 2
        valid_numbers = {1}
        q = [1]
        visited = {1}
        while q:
            curr = q.pop(0)
            for p in primes:
                next_num = curr * p
                if next_num > bound: continue
                factors = get_prime_factors(next_num)
                is_valid = True
                for factor, exp in factors.items():
                    if factor not in primes or exp > int(max_exponent):
                        is_valid = False
                        break
                if is_valid and next_num not in visited:
                    valid_numbers.add(next_num)
                    visited.add(next_num)
                    q.append(next_num)
    return valid_numbers if valid_numbers else {1}

def generate_ji_tetra_labels(limit_value, equave_ratio, limit_mode='odd', max_exponent=3, complexity_measure='Tenney', hide_unison_voices=False, omit_octaves=False, virtual_fundamental_filter=None):
    labels_data = []
    equave_ratio_float = float(equave_ratio)
    valid_numbers = _generate_valid_numbers(limit_value, limit_mode, max_exponent, equave_ratio_float)
    if not valid_numbers: return []
    sorted_valid_numbers = sorted(list(valid_numbers))
    primes = parse_primes(limit_value) if limit_mode == "prime" else []

    for combo in combinations_with_replacement(sorted_valid_numbers, 4):
        if hide_unison_voices and len(set(combo)) < 4: continue
        if omit_octaves:
            has_octave = False
            for i in range(len(combo)):
                for j in range(i + 1, len(combo)):
                    if combo[i] == 0: continue
                    ratio = combo[j] / combo[i]
                    if ratio > 1 and math.isclose(math.log2(ratio), round(math.log2(ratio))):
                        has_octave = True; break
                if has_octave: break
            if has_octave: continue

        i, j, k, l = combo
        if i == 0: continue
        if (l / i) > equave_ratio_float: continue
        if gcd(gcd(gcd(i, j), k), l) != 1: continue

        if virtual_fundamental_filter:
            vf_denom = get_virtual_fundamental_denominator(combo)
            if vf_denom is None or vf_denom not in virtual_fundamental_filter:
                continue

        valid_combo = True
        intervals = [Fraction(j, i), Fraction(k, j), Fraction(l, k)]
        if limit_mode == "odd":
            limit_val_int = int(limit_value)
            if any(get_odd_limit(interval) > limit_val_int for interval in intervals): valid_combo = False
        elif limit_mode == "integer":
            limit_val_int = int(limit_value)
            if any(get_integer_limit(interval) > limit_val_int for interval in intervals): valid_combo = False
        elif limit_mode == "prime":
            if any(not check_prime_limit(interval, primes, int(max_exponent)) for interval in intervals): valid_combo = False
        
        if not valid_combo: continue
            
        c1 = cents(j / i)
        c2 = cents(k / j)
        c3 = cents(l / k)
        
        complexity = max(calculate_complexity(complexity_measure, f) for f in intervals)
        label = f"{i}:{j}:{k}:{l}"
        labels_data.append(((c1, c2, c3), label, complexity))
        
    return labels_data
`;
    pyodide.FS.writeFile("python/theory/calculations.py", calculations_py_content, { encoding: "utf8" });
    pyodide.FS.writeFile("python/theory/__init__.py", "", { encoding: "utf8" });

    pyodide.runPython("import sys; sys.path.append('./python')");
    await pyodide.loadPackage("micropip");
    console.log("Micropip loaded.");

    setPythonReady(true);
    loadingOverlay.style.display = 'none';

    initThreeJS();
    animate();
    
    // Initial UI setup and tetrahedron update
    const limitType = document.getElementById('limitType').value;
    const limitValueInput = document.getElementById('limitValue').value;
    let limitValue = limitValueInput;
    let virtualFundamentalFilter = null;

    if (limitValueInput.includes('/')) {
        const parts = limitValueInput.split('/');
        limitValue = parts[0].trim();
        const filterStr = parts[1].trim();
        
        virtualFundamentalFilter = [];
        if (filterStr.includes('...')) {
            const rangeParts = filterStr.split('...');
            const start = parseInt(rangeParts[0]);
            const end = parseInt(rangeParts[1]);
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = start; i <= end; i++) {
                    virtualFundamentalFilter.push(i);
                }
            }
        } else {
            virtualFundamentalFilter = filterStr.split('.').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
        }
    }

    const maxExponent = document.getElementById('maxExponent').value;
    const equaveRatio = parseFloat(document.getElementById('equaveRatio').value);
    const complexityMethod = document.getElementById('complexityMethod').value;
    const hideUnisonVoices = document.getElementById('hideUnisonVoices').checked;
    const omitOctaves = document.getElementById('omitOctaves').checked;
    const baseSize = parseFloat(document.getElementById('baseSize').value);
    const scalingFactor = parseFloat(document.getElementById('scalingFactor').value);
    const enableSize = document.getElementById('enableSize').checked;
    const enableColor = document.getElementById('enableColor').checked;
    const layoutDisplay = document.getElementById('layoutDisplay').value;
    setCurrentLayoutDisplay(layoutDisplay); // Update global state for layout display

    // Get references to DOM elements that are now managed by globals
    setPlayButton(document.getElementById('playButton'));
    setPivotButtons(document.querySelectorAll('.pivot-button'));
    setNotationDisplay(document.getElementById('notation-display'));

    // Set initial waveform and pivot button selection
    updateWaveform(parseFloat(document.getElementById('timbreSlider').value));
    updatePivotButtonSelection(0); // Set initial pivot to Bass (index 0)

    // Setup all UI event listeners
    setupUIEventListeners();

    await updateTetrahedron(
        limitType, limitValue, maxExponent, virtualFundamentalFilter, equaveRatio, complexityMethod, 
        hideUnisonVoices, omitOctaves, baseSize, scalingFactor, 
        enableSize, enableColor, layoutDisplay
    );
}

// Initial call to start the application
initPyodide();