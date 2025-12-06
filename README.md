# Tetrads
## https://tetrads.richiegreene.com/

Interactive tetrahedron of JI tetrads with the ability to scale via harmonic complexity models.  
Sounds, shapes, colors ... Go nuts! Approaching this as a sort of 3D take off of Sintel's [triangle](https://sintel.website/posts/triangle.html). While drawing inspiration from tetradic [harmonic entropy](https://en.xen.wiki/w/Harmonic_entropy) (4HE) this does not render 3D gaussian (multivariate normal) distributions, which are pivotal when considering HE.

## Display 
### Controls
* Rotate Tetrahedron: click/drag or arrow keys
* Zoom: two-finger scroll/mouse-wheel
* Save/Export SVG: ⇧⌘E
* Light/Bright Mode: ⇧⌘L
  * Greyscale off when colormap is disabled 

### Settings
* Select [Odd-limit](https://en.xen.wiki/w/Odd_limit) of JI tetrads depicted
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

## Playback
### Controls
* ⇧: hover to play corresponding chord
* ⇧+Hover(Click Hold): sustain a chord; next chord on release
* s, a, t, b keys to toggle the pivot/common-tone between adjacent chords

### Settings
* Enable Slide: set duration (sec) of portamento for adjacent SATB voices
* Set pivot voice (common-tone) with S A T B buttons (or keys)
* Timbre: Adjust the wavetable slider to shift through sine, triangle, saw, and square
  
## Demo
https://github.com/user-attachments/assets/bab0258a-64b1-49d3-8ee9-9ca662745278
