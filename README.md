# Tetrads
## https://tetrads.richiegreene.com/

Interactive tetrahedron of JI tetrads with the ability to scale via harmonic complexity models.  
Sounds, shapes, colors ... Go nuts! Approaching this as a sort of 3D take off of Sintel's [triangle](https://sintel.website/posts/triangle.html). While drawing inspiration from tetradic [harmonic entropy](https://en.xen.wiki/w/Harmonic_entropy) (4HE) this does not render 3D gaussian (multivariate normal) distributions, which are pivotal when considering HE.

## Demo
![display demo](https://github.com/user-attachments/assets/4247d114-28db-4907-9da5-dc5b3bece989)

The panel is a side rail of three modes — Complexity Measures, Display and Play — borrowed, along with the synth and the JI notation engines, from [Xenachord Designer](https://github.com/richiegreene/xenachord). Pressing the mode you are already in shuts the drawer and gives the width back to the view.

## Display 
### Controls
* Rotate Tetrahedron: click/drag or arrow keys
* Zoom: two-finger scroll/mouse-wheel
* Layout/Looks: ⇧⌘L
  * Cycle through colormaps: Plasma, Viridis, Binary Black/White

### Settings
* Select/Define Limit of JI terads.
  * [Integer-Limit](https://en.xen.wiki/w/Odd_limit#Integer_limit)
  * [Odd-limit](https://en.xen.wiki/w/Odd_limit)
  * [Prime-Limit](https://en.xen.wiki/w/Harmonic_limit#Prime_limits_as_subgroups) - accepts subgroups, e.g. "2.3.7" 
* Select the register considered
  * default "2" for 2/1 octave
* Set the Complexity Model which scale/color JI ratios $\dfrac{n}{d}$. 
  * Arithmetic, $n+d$
  * [Benedetti](https://en.xen.wiki/w/Benedetti_height), $nd$
  * [Euler](https://en.xen.wiki/w/Gradus_suavitatis), $s-n+1$ where $s$ is the sum of prime factors and $n$ is number of prime factors.
  * [Tenney](https://en.xen.wiki/w/Tenney_norm), $\log_2(n \cdot d)$
  * [Weil](https://en.xen.wiki/w/Weil_norm,_Tenney%E2%80%93Weil_norm,_and_TWp_interval_and_tuning_space), $log_2(max(n,d))$
  * [Wilson](https://en.xen.wiki/w/Wilson_norm), sum of prime factors (with repetition) $\text{sopfr}(pq)$
* Display: Points (Dots) or Labels (Enumerated Ratios)
* Base Size: Set minimum size (e.g. 0.25) of Point/Label
* Scaling Factor: adjust to change rate of sizing/coloration difference
* Omit Unisons/Octaves to display only chords with unique pitch classes

### Notation
How the sounding chord is written out. Reference pitch: 1/1 = C3 130.8128Hz.
* All — ratio, HEJI and 12EDO deviation at once
* Ratio — the enumerated ratio itself
* [HEJI](https://marsbat.space/pdfs/HEJI2_legend+series.pdf) — Helmholtz-Ellis Just Intonation
* [Sagittal](https://sagittal.org/) — with Athenian / Promethean / Herculean / Olympian precision, and revo (pure) or evo (beside a conventional sharp or flat)
* Cents — cents above 1/1
* 12EDO — the nearest 12EDO note and the cents off it

## Playback
### Controls
* ⇧: hover to play corresponding chord
* ⇧+Hover(Click Hold): sustain a chord; next chord on release
* s, a, t, b keys to toggle the pivot/common-tone between adjacent chords

### Settings
* Playback: In-browser audio, MIDI Polyphonic Expression (MPE), or both
* Enable Slide: set duration (sec) of portamento for adjacent SATB voices
* Set pivot voice (common-tone) with S A T B buttons (or keys)
* Timbre: two families over the same four shapes — sine, triangle, saw, square
  * Wavetable — a fixed, band-limited waveform, volume-independent
  * Filtered wavetable — a sine phase-modulated by its own low-passed output, so quiet notes stay near-sine and loud ones fold into a buzz
* Envelope: drag the corners of the ADSR curve. In the filtered family the fold is driven by amplitude, so the envelope is part of the timbre rather than a level applied after it.

## Export
### Controls
* Save/Export SVG: ⇧⌘E
* Save/Export CSV: ⇧⌘S
  * Enumerated Chords ($a:b:c:d$), Notes ($\dfrac{n}{d}$), Cents, and Complexity.
