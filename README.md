# Tetrads
## https://tetrads.richiegreene.com/

Interactive tetrahedron of JI tetrads — and a playable triangle of JI triads — with the ability to scale via harmonic complexity models.  
Sounds, shapes, colors ... Go nuts! Approaching this as a sort of 3D take off of Sintel's [triangle](https://sintel.website/posts/triangle.html). While drawing inspiration from tetradic [harmonic entropy](https://en.xen.wiki/w/Harmonic_entropy) (4HE) this does not render 3D gaussian (multivariate normal) distributions, which are pivotal when considering HE.

## Demo
![display demo](https://github.com/user-attachments/assets/4247d114-28db-4907-9da5-dc5b3bece989)

The panel is a side rail of four modes — Complexity Measures, Display, Play and Export — borrowed, along with the synth and the JI notation engines, from [Xenachord Designer](https://github.com/richiegreene/xenachord). Pressing the mode you are already in shuts the drawer and gives the width back to the view.

## Tetrads / Triads
Pinned above the drawers is a switch between two apps that ask the same questions of different chords.

**Tetrads** is the tetrahedron above: four voices, three intervals, one point per chord.

**Triads** is three voices and two intervals, which fit in a triangle — so the chords can be laid over a continuous *concordance surface* and played by dragging across it. Both modes are built from the same Limit, Equave and Complexity Measure, so a 13-limit means one thing in this app, and both are written out by the same notation engines.

The triangle's bottom-left corner is the unison; its bottom-right puts the whole equave in the lower interval, and its apex puts it in the upper one.

### Models
What the ground between the just triads is measuring. Its own **Generate** press, because it is the one thing here that takes a moment — the models run in Python, in the page.
* **Blank** — no field: the JI lattice on a plain ground
* **Entropy** — [harmonic entropy](https://en.xen.wiki/w/Harmonic_entropy) over the triangle, from [Isoharmonics](https://github.com/richiegreene/isoharmonics). Every triad in the equave is stamped at its point with weight $1/\sqrt{ijk}$, blurred, and the Rényi entropy of the blur taken. Peaks are concordances. Spread is asked in cents rather than pixels, so raising Resolution sharpens the picture instead of changing the model.
* **Sethares** — [sensory dissonance](https://sethares.engr.wisc.edu/consemi.html), computed from the partials of *whatever timbre the Play drawer is currently set to*. Change the wave and the surface changes with it, which is the whole claim of the model: how rough a chord sounds is a fact about its spectrum, not only about its ratios.

### Display
* **View**: Topology, 3D, or **Both** — side by side and linked to one cursor. The contour map says exactly *where* a concordance is and nothing about how deep; the lifted surface says how deep and blurs where. Drag either and the other follows.
* **Fill** and **Lines** are independent: a field can be shaded, contoured, both, or neither with only the lattice left.
* **Relief** — how far the 3D pane lifts the field.
* **Lattice**: Dots and Labels, and **Snap** — how close the pointer must come to a just triad before it lands on it exactly. At 0 the surface is continuous everywhere.

### Playing the triangle
Press and drag. The three voices are struck **once**, when the pointer goes down, and every move after that leads those same running voices to the new pitch — so a drag is one chord bending through the field rather than a stream of re-attacks. **Tracking › Portamento** is how tightly they follow: at 0 the pitch sits exactly under the pointer, and a little smoothing takes the stair-stepping off a fast drag.

The **Pivot** — **S**, **A** or **T** — is the voice held still while the other two move, the same press Tetrads makes with S/A/T/B over four voices (a triad has no bass under its tenor). The `s`, `a` and `t` keys select it, as they do there. Switching it while a chord is sounding is silent: the incoming pivot inherits the pitch that voice already has. Space puts the next chord back on 1/1 = C3.

In the 3D pane, **Shift-drag orbits** and a plain drag plays.

### Export, in Triads
* **.svg** — the shading is an embedded image (a continuously shaded scalar field is not vector art), but everything drawn on it stays vector: contours are paths, the lattice is circles, the labels are text. Turn Fill off and Lines on and the file is vectors end to end.
* **.png** — the flat pane rasterised from that SVG at up to 4x; the lifted pane straight from the view.
* **.csv** — the triads, with a column for the current model's value at each one.

## Display 
### Controls
* Rotate Tetrahedron: click/drag or arrow keys
* Keep it turning: Rotate Continuously, under Display › Visuals › Motion. While it runs the arrow keys steer it rather than nudging it.
* Rotation rate: [ and ], or the Motion slider beside it — one rate for both, so 34°/s is a turn every eleven seconds whether you hold an arrow or watch it spin.
  * Continuous Rotation: caps lock + arrow keys
    * speed up: ] or }
    * slow dow: [ or {
* Zoom: two-finger scroll/mouse-wheel
* Layout/Looks: ⇧⌘L cycles the colormap; the same four are in Display › Visuals as swatches
  * Plasma and Viridis — perceptually uniform ramps
  * Black and White — greyscale, named for the ground the set is drawn on: on black the simplest tetrads come out brightest, on white they go to ink
* (Beta Feature) Hand Tracking: ⇧⌘K 

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
* Notation: depicts played chord as ratio or cents
  * Refference pitch: 1/1 = C3 130.8128Hz
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
* Change Pressure (for MPE):
  * reduce via L or RH keycommands: ! or _-
  * increase via L or RH keycommands: @ or +=

### Settings
* Playback: In-browser audio, MIDI Polyphonic Expression (MPE), or both
* Portamento: how long (0–5 s) the four voices take to reach the next tetrad. At 0 they arrive at once.
* Set pivot voice (common-tone) with S A T B buttons (or keys)
* Timbre: two families over the same four shapes — sine, triangle, saw, square
  * Wavetable — a fixed, band-limited waveform, volume-independent
  * Filtered wavetable — a sine phase-modulated by its own low-passed output, so quiet notes stay near-sine and loud ones fold into a buzz
* Envelope: drag the corners of the ADSR curve. In the filtered family the fold is driven by amplitude, so the envelope is part of the timbre rather than a level applied after it.

## Export
Everything is in the Export drawer, and the key commands still work.

### Picture
What the camera is looking at, at the size of the viewport, with anything outside the frustum left out — so turn the shape to the angle you want first.
* Save View (.svg): ⇧⌘E — vectors, every point a circle and every label real text
* Save View (.png) — the same view rasterised from that SVG at up to 4x

### Data
* Save Chords (.csv): ⇧⌘S
  * Enumerated Chords ($a:b:c:d$), Notes ($\dfrac{n}{d}$), Cents, and Complexity — sorted simplest first.
