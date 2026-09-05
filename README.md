# Tetrads
## https://tetrads.richiegreene.com/

Interactive tetrahedron of JI tetrads — and a playable triangle of JI triads — with the ability to scale via harmonic complexity models.  
Sounds, shapes, colors ... Go nuts! Approaching this as a sort of 3D take off of Sintel's [triangle](https://sintel.website/posts/triangle.html). While drawing inspiration from tetradic [harmonic entropy](https://en.xen.wiki/w/Harmonic_entropy) (4HE) this does not render 3D gaussian (multivariate normal) distributions, which are pivotal when considering HE.

## Demo
![display demo](https://github.com/user-attachments/assets/4247d114-28db-4907-9da5-dc5b3bece989)

The panel is a side rail of four modes — Complexity Measures, Display, Play and Export — borrowed, along with the synth and the JI notation engines, from [Xenachord Designer](https://github.com/richiegreene/xenachord). Pressing the mode you are already in shuts the drawer and gives the width back to the view.

**Nothing needs applying.** There is no Update and no Generate: every control in every drawer applies itself a beat after you stop moving it. The wait is deliberate — the models run in Python, on the page's own thread, so recomputing on every intermediate value of a drag would freeze the slider being dragged. What used to be the Update button is now the line at the foot of the panel saying what came of it: how many chords are in the set, which model is under the triangle, and what it cost.

One thing is still asked for explicitly. The number of chords grows as the fourth power of the limit — odd-limit 13 is a hundred and twenty thousand tetrads, and a slipped keystroke making that 1113 is a *trillion* — so before generating anything the app works out how big the job would be, and anything past a couple of million is reported rather than run: *"1.0 billion tetrads — press ↵ to generate anyway"*. `↵` also just means *don't wait* for any ordinary change.

## Triads / Tetrads
Pinned above the drawers is a switch between two apps that ask the same questions of different chords.

**Tetrads** is the tetrahedron above: four voices, three intervals, one point per chord.

**Triads** is three voices and two intervals, which fit in a triangle — so the chords can be laid over a continuous *concordance surface* and played by dragging across it. Both modes are built from the same Limit, Equave and Complexity Measure, so a 13-limit means one thing in this app, and both are written out by the same notation engines.

The triangle's bottom-left corner is the unison; its bottom-right puts the whole equave in the lower interval, and its apex puts it in the upper one.

### Models
What the ground between the just triads is measuring. Pick one and it builds itself; move any of its numbers and it rebuilds a moment after your hand comes off.
* **Blank** — no field: the JI lattice on a plain ground
* **Entropy** — [harmonic entropy](https://en.xen.wiki/w/Harmonic_entropy) over the triangle, from [Isoharmonics](https://github.com/richiegreene/isoharmonics). Every triad in the equave is stamped at its point with weight $1/\sqrt{ijk}$, blurred, and the Rényi entropy of the blur taken. Peaks are concordances. Spread is asked in cents rather than pixels, so raising Resolution sharpens the picture instead of changing the model.
* **Sethares** — [sensory dissonance](https://sethares.engr.wisc.edu/consemi.html), computed from the partials of *whatever timbre the Play drawer is currently set to*. Change the wave and the surface changes with it, which is the whole claim of the model: how rough a chord sounds is a fact about its spectrum, not only about its ratios.

### Display
* **View**: Topology, 3D, or **Both** — side by side and linked to one cursor. The contour map says exactly *where* a concordance is and nothing about how deep; the lifted surface says how deep and blurs where. Drag either and the other follows.
* **Fill** and **Lines** are independent: a field can be shaded, contoured, both, or neither with only the lattice left.
* **Relief** — how far the 3D pane lifts the field.
* **Lattice**: Dots and Labels, and **Snap** — how close the pointer must come to a just triad before it lands on it exactly. At 0 the surface is continuous everywhere.

### Playing the triangle
In the **flat** pane, press and drag — there is nothing else to do there. In the **lifted** pane a plain drag *turns* the surface and **⇧-drag** plays it, exactly as ⇧ sounds the tetrahedron, so the modifier means one thing across the whole app. The surface is also turned by the arrow keys, kept turning by Rotate Continuously and paced by `[` and `]` — the same Motion setting, and the same rate, as the tetrahedron. It frames itself to the pane whenever it is shown, resized, or given a new model.

Either way, the three voices are struck **once**, when the pointer goes down, and every move after that leads those same running voices to the new pitch — so a drag is one chord bending through the field rather than a stream of re-attacks. **Tracking › Portamento** is how tightly they follow: at 0 the pitch sits exactly under the pointer, and a little smoothing takes the stair-stepping off a fast drag.

The **Pivot** — **S**, **A** or **T** — is the voice held still while the other two move, the same press Tetrads makes with S/A/T/B over four voices (a triad has no bass under its tenor). The `s`, `a` and `t` keys select it, as they do there. Switching it while a chord is sounding is silent: the incoming pivot inherits the pitch that voice already has. Space puts the next chord back on 1/1 = C3.

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
* Layout/Looks: ⇧⌘L cycles the colormap; the same eight are in Display › Visuals as swatches
  * Plasma, Viridis and Magma — perceptually uniform ramps
  * Blue — [Isoharmonics](https://github.com/richiegreene/isoharmonics)' own gradient, stop for stop
  * Black and White — greyscale, named for the ground the set is drawn on: on black the simplest chords come out brightest, on white they go to ink
  * Bronze and Porcelain — **material** layouts rather than ramps. The 3D surface is one colour and every bit of the modelling comes from light: an angled key, a soft fill, and a specular highlight that travels across the peaks as the shape turns. Height stops being redundant with colour and becomes the only thing carrying the model, so a shallow ridge a ramp would flatten into one band shows up as a ridge. The flat pane renders these as hillshading — the same light on the same surface, seen from straight above — so the two panes stay two views of one thing.
* **Day mode** comes on by itself whenever the view is drawn on white (White, Porcelain): the rail and the drawer go light with the viewport, on Xenachord Designer's own tokens. A dark panel against a white view is a bezel with a lamp behind it.
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
