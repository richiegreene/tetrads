import math
from fractions import Fraction
from functools import reduce
from math import gcd
from itertools import combinations_with_replacement
import numpy as np

def cents(x):
    """Converts a ratio to cents."""
    return 1200 * np.log2(x)

def calculate_edo_step(cents, edo):
    step_size = 1200 / edo
    step = round(cents / step_size)
    error = step * step_size - cents
    step_str = f"-{abs(step)}" if step < 0 else str(step)
    return step_str, error

def calculate_12edo_step(cents):
    step_size = 1200 / 12
    step = round(cents / step_size)
    error = step * step_size - cents
    return step, error

def ratio_to_cents(ratio):
    return 1200 * math.log2(ratio)

def generate_iso_series(fundamental, isoharmonic, partials_above, partials_below):
    series = []
    current_ratio = isoharmonic
    for _ in range(partials_below):
        current_ratio = current_ratio - fundamental
        series.insert(0, current_ratio)
    series.append(isoharmonic)
    current_ratio = isoharmonic
    for _ in range(partials_above):
        current_ratio = current_ratio + fundamental
        series.append(current_ratio)
    return series

def find_gcd(list):
    return reduce(gcd, list)

def find_lcd(denominators):
    def lcm(a, b):
        return a * b // gcd(a, b)
    return reduce(lcm, denominators)

def format_series_segment(series):
    fractions = [Fraction(ratio).limit_denominator() for ratio in series]
    denominators = [frac.denominator for frac in fractions]
    lcd = find_lcd(denominators)
    numerators = [int(frac.numerator * (lcd / frac.denominator)) for frac in fractions] # Fixed: use frac.denominator instead of hardcoded 1
    
    if lcd == 1:
        return ':'.join(map(str, numerators))
    else:
        return f"({':'.join(map(str, numerators))})/{lcd}"

def simplify_ratio(ratio):
    frac = Fraction(ratio).limit_denominator()
    return f"{frac.numerator}/{frac.denominator}"

def get_odd_part_of_number(num):
    if num == 0:
        return 0
    while num > 0 and num % 2 == 0:
        num //= 2
    return num

def get_odd_limit(ratio):
    """Calculates the odd limit of a given ratio."""
    try:
        ratio = Fraction(ratio).limit_denominator(10000)
        n, d = ratio.numerator, ratio.denominator
        
        n_odd_part = get_odd_part_of_number(n)
        d_odd_part = get_odd_part_of_number(d)
            
        return max(n_odd_part, d_odd_part)
    except (ValueError, ZeroDivisionError):
        return 1

def get_integer_limit(ratio):
    """Calculates the integer limit of a given ratio."""
    try:
        ratio = Fraction(ratio).limit_denominator(10000)
        return max(ratio.numerator, ratio.denominator)
    except (ValueError, ZeroDivisionError):
        return 1

def get_prime_factorization(n):
    factors = []
    d = 2
    while d * d <= n:
        while (n % d) == 0:
            factors.append(d)
            n //= d
        d += 1
    if n > 1:
       factors.append(n)
    return factors

def tenney_norm(ratio):
    ratio = Fraction(ratio).limit_denominator(10000)
    return math.log2(ratio.numerator * ratio.denominator)

def weil_norm(ratio):
    ratio = Fraction(ratio).limit_denominator(10000)
    return math.log2(max(ratio.numerator, ratio.denominator))

def wilson_norm(ratio):
    ratio = Fraction(ratio).limit_denominator(10000)
    factors_n = get_prime_factorization(ratio.numerator)
    factors_d = get_prime_factorization(ratio.denominator)
    return sum(factors_n) + sum(factors_d)

def gradus_norm(ratio):
    ratio = Fraction(ratio).limit_denominator(10000)
    factors_n = get_prime_factorization(ratio.numerator)
    factors_d = get_prime_factorization(ratio.denominator)
    s = sum(factors_n) + sum(factors_d)
    n = len(factors_n) + len(factors_d)
    return s - n + 1

def calculate_complexity(complexity_measure, ratio):
    if complexity_measure == "Tenney":
        return tenney_norm(ratio)
    elif complexity_measure == "Weil":
        return weil_norm(ratio)
    elif complexity_measure == "Wilson":
        return wilson_norm(ratio)
    elif complexity_measure == "Gradus":
        return gradus_norm(ratio)
    else:
        return 0

def _generate_valid_numbers(limit_value, limit_mode):
    """
    Generates a set of valid numbers based on the limit mode.
    """
    valid_numbers = set()
    if limit_mode == "odd":
        max_num_to_check = max(limit_value * 2, 100)
        for num in range(1, max_num_to_check + 1):
            if get_odd_part_of_number(num) <= limit_value:
                valid_numbers.add(num)
    elif limit_mode == "integer":
        valid_numbers = set(range(1, limit_value + 1))
    return valid_numbers

def generate_ji_tetra_labels(limit_value, equave_ratio, limit_mode="odd", complexity_measure="Tenney", hide_unison_voices=False, omit_octaves=False):
    """
    Generates a list of 4-note JI chords (labels) and their 3D coordinates (c1, c2, c3)
    and complexity for the tetrahedron.
    """
    labels_data = []
    equave_ratio_float = float(equave_ratio)

    valid_numbers = _generate_valid_numbers(limit_value, limit_mode)
            
    if not valid_numbers:
        return []

    sorted_valid_numbers = sorted(list(valid_numbers))
    
    for combo in combinations_with_replacement(sorted_valid_numbers, 4):
        if hide_unison_voices and len(set(combo)) < 4:
            continue

        if omit_octaves:
            has_octave = False
            for i in range(len(combo)):
                for j in range(i + 1, len(combo)):
                    if combo[j] == combo[i] * 2:
                        has_octave = True
                        break
                if has_octave:
                    break
            if has_octave:
                continue

        i, j, k, l = combo
        
        if l / i > equave_ratio_float:
            continue
            
        if gcd(gcd(gcd(i, j), k), l) != 1:
            continue

        if limit_mode == "odd":
            if (get_odd_limit(Fraction(j, i)) > limit_value or
                get_odd_limit(Fraction(k, j)) > limit_value or
                get_odd_limit(Fraction(l, k)) > limit_value):
                continue
            
        c1 = cents(j / i)
        c2 = cents(k / j)
        c3 = cents(l / k)
        
        complexity = max(
            calculate_complexity(complexity_measure, Fraction(j, i)),
            calculate_complexity(complexity_measure, Fraction(k, j)),
            calculate_complexity(complexity_measure, Fraction(l, k))
        )
        
        label = f"{i}:{j}:{k}:{l}"
        
        labels_data.append(((c1, c2, c3), label, complexity))
        
    return labels_data

def get_primes_less_than_or_equal_to(p):
    primes = []
    for num in range(2, p + 1):
        is_prime = True
        for i in range(2, int(num**0.5) + 1):
            if num % i == 0:
                is_prime = False
                break
        if is_prime:
            primes.append(num)
    return primes

def get_max_exponent_for_p_smooth(n, p_limit, primes=None):
    if primes is None:
        primes = get_primes_less_than_or_equal_to(p_limit)
    
    max_exp = 0
    
    temp_n = n
    for p in primes:
        if temp_n == 1:
            break
        if temp_n % p == 0:
            exp = 0
            while temp_n % p == 0:
                exp += 1
                temp_n //= p
            max_exp = max(max_exp, exp)
            
    if temp_n > 1:
        return float('inf')
        
    return max_exp

def generate_ji_triads(limit_value, equave=Fraction(2,1), limit_mode="odd", prime_limit=7, max_exponent=4):
    if limit_value < 1 and limit_mode != "prime":
        return []

    valid_intervals = set([Fraction(1,1)])
    
    max_val_for_n_d = 0
    if limit_mode == "odd" or limit_mode == "integer":
        max_val_for_n_d = limit_value * 3
    elif limit_mode == "prime":
        # For prime limit, we need a different approach to find the max value for n and d
        # A rough estimation could be prime_limit ^ max_exponent
        max_val_for_n_d = prime_limit * max_exponent * 3 # Heuristic

    primes = None
    if limit_mode == "prime":
        primes = get_primes_less_than_or_equal_to(prime_limit)

    for n_val in range(1, max_val_for_n_d + 1):
        for d_val in range(1, max_val_for_n_d + 1):
            if n_val == 0 or d_val == 0: continue
            ratio = Fraction(n_val, d_val)
            
            if limit_mode == "odd":
                if get_odd_limit(ratio) <= limit_value:
                    valid_intervals.add(ratio)
            elif limit_mode == "integer":
                if get_integer_limit(ratio) <= limit_value:
                    valid_intervals.add(ratio)
            elif limit_mode == "prime":
                num_exp = get_max_exponent_for_p_smooth(ratio.numerator, prime_limit, primes)
                den_exp = get_max_exponent_for_p_smooth(ratio.denominator, prime_limit, primes)
                if num_exp <= max_exponent and den_exp <= max_exponent:
                    valid_intervals.add(ratio)

    if limit_mode == "odd":
        if get_odd_limit(equave) <= limit_value:
            valid_intervals.add(equave)
    elif limit_mode == "integer":
        if get_integer_limit(equave) <= limit_value:
            valid_intervals.add(equave)
    elif limit_mode == "prime":
        num_exp = get_max_exponent_for_p_smooth(equave.numerator, prime_limit, primes)
        den_exp = get_max_exponent_for_p_smooth(equave.denominator, prime_limit, primes)
        if num_exp <= max_exponent and den_exp <= max_exponent:
            valid_intervals.add(equave)

    sorted_intervals = sorted(list(valid_intervals))

    triads = []
    triad_labels = set()

    for i in range(len(sorted_intervals)):
        r1 = sorted_intervals[i]
        for j in range(i, len(sorted_intervals)):
            r2 = sorted_intervals[j]
            
            r3 = r2 / r1
            
            cx_ratio = None
            cy_ratio = None

            if limit_mode == "odd":
                if get_odd_limit(r3) <= limit_value:
                    cx_ratio = r1
                    cy_ratio = r3
            elif limit_mode == "integer":
                if get_integer_limit(r3) <= limit_value:
                    cx_ratio = r1
                    cy_ratio = r3
            elif limit_mode == "prime":
                num_exp = get_max_exponent_for_p_smooth(r3.numerator, prime_limit, primes)
                den_exp = get_max_exponent_for_p_smooth(r3.denominator, prime_limit, primes)
                if num_exp <= max_exponent and den_exp <= max_exponent:
                    cx_ratio = r1
                    cy_ratio = r3

            if cx_ratio is None or cy_ratio is None: continue

            if cx_ratio < 1 or cy_ratio < 1: continue

            cx = 1200 * math.log2(cx_ratio)
            cy = 1200 * math.log2(cy_ratio)

            if cx + cy > 1200 * math.log2(equave) + 1e-9: continue

            common_denom = r1.denominator * r2.denominator
            a = common_denom
            b = r1.numerator * r2.denominator
            c = r2.numerator * r1.denominator
            
            common_divisor = gcd(gcd(a,b),c)
            sa, sb, sc = a//common_divisor, b//common_divisor, c//common_divisor
            
            sorted_triad = sorted([sa, sb, sc])
            label = f"{sorted_triad[0]}:{sorted_triad[1]}:{sorted_triad[2]}"

            if label not in triad_labels:
                triads.append(((cx, cy), label))
                triad_labels.add(label)

    return triads