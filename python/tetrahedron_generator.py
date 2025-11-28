import math
import numpy as np
import scipy.signal
from itertools import combinations_with_replacement
from fractions import Fraction
from theory.calculations import get_odd_limit, _generate_valid_numbers, calculate_complexity

def cents(x):
    """Converts a ratio to cents."""
    # This function is called with numpy arrays, the check must be vectorized.
    # However, the generator logic ensures x > 0, so we can safely log.
    return 1200 * np.log2(x)

def generate_tetrahedron_data(equave_ratio, resolution):
    """
    Generates 3D data based on the Harmonic Entropy model for 4-note chords.
    """
    # Increased limits to ensure a dense data cloud is generated.
    n_limit = 60
    c_limit = 2_000_000

    f = []
    equave_ratio_float = float(equave_ratio)
    
    # Generate [i, j, k, l] quadruplets for 4-note chords
    for i in range(1, n_limit):
        j_min = i
        j_max = min(math.floor(i * equave_ratio_float) + 1, int(pow(c_limit / i, 1/3)) + 1)
        if j_max < j_min: continue
        for j in range(j_min, j_max):
            k_min = j
            k_max = min(math.floor(j * equave_ratio_float) + 1, int(pow(c_limit / (i * j), 1/2)) + 1)
            if k_max < k_min: continue
            for k in range(k_min, k_max):
                l_min = k
                l_max = min(math.floor(k * equave_ratio_float) + 1, c_limit // (i * j * k) + 1)
                if l_max < l_min: continue
                for l in range(l_min, l_max):
                    if math.gcd(math.gcd(math.gcd(i, j), k), l) == 1:
                        f.append([i, j, k, l])
    
    if not f:
        return None, None, None, None

    f = np.array(f, dtype=np.float64)

    # Calculate weights: w = 1 / sqrt(i*j*k*l)
    w = 1.0 / np.sqrt(np.prod(f, axis=1))

    # Calculate cents for the three consecutive intervals
    c1 = cents(f[:, 1] / f[:, 0])
    c2 = cents(f[:, 2] / f[:, 1])
    c3 = cents(f[:, 3] / f[:, 2])

    # Create a 3D grid to accumulate weights
    max_cents = 1200 * np.log2(equave_ratio_float)
    
    # Scale cents to grid indices
    cx = np.round((c1 / max_cents) * (resolution - 1)).astype(int)
    cy = np.round((c2 / max_cents) * (resolution - 1)).astype(int)
    cz = np.round((c3 / max_cents) * (resolution - 1)).astype(int)

    # Filter out-of-bounds coordinates
    mask = (cx >= 0) & (cx < resolution) & (cy >= 0) & (cy < resolution) & (cz >= 0) & (cz < resolution)
    cx, cy, cz, w = cx[mask], cy[mask], cz[mask], w[mask]

    coords = (cz, cy, cx) # Use z,y,x order for numpy array indexing

    alpha = 7
    
    k = np.zeros(shape=(resolution, resolution, resolution), dtype=np.float64)
    k_a = np.zeros(shape=(resolution, resolution, resolution), dtype=np.float64)

    np.add.at(k, coords, w)
    np.add.at(k_a, coords, w**alpha)

    # 3D Gaussian convolution
    std = 2.0 # Standard deviation for the Gaussian kernel
    s_range = round(std * 2)
    x_s, y_s, z_s = np.mgrid[-s_range:s_range+1, -s_range:s_range+1, -s_range:s_range+1]
    s_kernel = np.exp(-((x_s**2 + y_s**2 + z_s**2) / (2 * std**2)))

    prod_k_s = scipy.signal.convolve(k, s_kernel, mode='same')
    prod_k_s_alpha = scipy.signal.convolve(k_a, s_kernel**alpha, mode='same')

    eps = 1e-16
    entropy = (1 / (1 - alpha)) * np.log((eps + prod_k_s_alpha) / (eps + prod_k_s**alpha))
    
    # Invert entropy so high points are consonant
    entropy[np.isnan(entropy)] = 0
    entropy = np.nanmax(entropy) - entropy

    # --- Apply tetrahedral mask ---
    # Create coordinate grids that match the entropy data grid's logical axes (c1, c2, c3)
    c1_grid, c2_grid, c3_grid = np.mgrid[0:max_cents:complex(0, resolution), 0:max_cents:complex(0, resolution), 0:max_cents:complex(0, resolution)]
    
    # The entropy grid is indexed (cz, cy, cx), so we need to match the mask to that shape
    # The grids from mgrid are (x,y,z) indexed, so c1_grid is the x-axis etc.
    # We need to transpose the aask to match entropy's (z,y,x) shape.
    mask = c1_grid + c2_grid + c3_grid > max_cents
    mask = np.transpose(mask, (2, 1, 0))

    # Also mask out areas where there was no raw data to begin with
    mask |= (k == 0)
    
    # Apply the mask
    entropy[mask] = np.nan

    # Return the grids in the correct (c1, c2, c3) order for the widget
    return c1_grid, c2_grid, c3_grid, entropy

def generate_odd_limit_points(limit_value, equave_ratio, limit_mode="odd", complexity_measure="Tenney", hide_unison_voices=False, omit_octaves=False):
    """
    Generates a list of 4-note chords based on an odd limit.
    Returns points as (c1, c2, c3, complexity).
    """
    points = []
    equave_ratio_float = float(equave_ratio)
    
    valid_numbers = _generate_valid_numbers(limit_value, limit_mode)

    if not valid_numbers:
        return []

    sorted_valid_numbers = sorted(list(valid_numbers))
    
    # Find all unique combinations of 4 valid numbers
    for combo in combinations_with_replacement(sorted_valid_numbers, 4):
        if hide_unison_voices and len(set(combo)) < 4:
            continue

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
        
        # Ensure the chord is within the equave
        if l / i > equave_ratio_float:
            continue
            
        # Ensure the components are coprime
        if math.gcd(math.gcd(math.gcd(i, j), k), l) != 1:
            continue
            
        # Ensure the odd limit of all intervals is within the limit_value (only for odd limit mode)
        if limit_mode == "odd":
            if (get_odd_limit(Fraction(j, i)) > limit_value or
                get_odd_limit(Fraction(k, j)) > limit_value or
                get_odd_limit(Fraction(l, k)) > limit_value):
                continue
        
        # Calculate interval cents
        c1 = cents(j / i)
        c2 = cents(k / j)
        c3 = cents(l / k)
        
        # Calculate complexity
        complexity = max(
            calculate_complexity(complexity_measure, Fraction(j, i)),
            calculate_complexity(complexity_measure, Fraction(k, j)),
            calculate_complexity(complexity_measure, Fraction(l, k))
        )
        
        points.append((c1, c2, c3, complexity))
        
    return points