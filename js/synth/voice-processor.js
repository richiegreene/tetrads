/* =====================================================================
 *  THE VOICE — one key, one sample at a time
 * =====================================================================
 *
 * Engrave renders a whole score into an AudioBuffer before it plays any of
 * it, because a score is known in advance. A keyboard is not: the note has to
 * start when the key goes down, so the same two oscillators run live here, in
 * the audio thread, a sample at a time.
 *
 * The algorithms are not re-derived. The wavetable path reads the band-limited
 * mip tables built by ../synth/tables.js, which is render-worker.js's own
 * scheme; the filtered path is justidraw's recursion as synth.js transcribes
 * it, with the same feedback pole, the same index and the same high-frequency
 * taper. Those constants are repeated here rather than imported because an
 * AudioWorklet has no module graph to import through — so they are written out
 * once, with the source they came from named beside them.
 *
 * WHY THE ENVELOPE LIVES INSIDE THE OSCILLATOR, not on a GainNode after it.
 * In the filtered family the modulation index is driven by the output, and the
 * output is amplitude-scaled — a quiet note comes out very nearly a sine and a
 * loud one folds into a buzz. That is the whole point of the family. Put the
 * envelope on a gain stage downstream and the fold would be computed at full
 * amplitude and then turned down, so every note would be equally bright and
 * the attack would not open up. So `amp` here is the live envelope value, and
 * the timbre follows the ADSR because the physics say it does.
 * ------------------------------------------------------------------ */

const TWO_PI = Math.PI * 2;
const TABLE_SIZE = 2048;
const MIP_BASE_HZ = 20;
const MIP_COUNT = 11;
const INV_LOG2 = 1 / Math.log(2);

/** index = drive·((1 - even)·pout + even·pout²) — synth.js FILTERED.index. */
const filteredIndex = (pout, drive, even) =>
  drive * (pout + even * (pout * pout - pout));

/**
 * How much modulation index survives at this frequency: all of it up to sr/8,
 * where the 4th harmonic still fits under Nyquist, none by sr/4, where the 2nd
 * no longer does. A feedback oscillator cannot be band-limited the way the mip
 * tables are, so a partial too high to fold without aliasing is left as the
 * sine it already nearly is. synth.js FILTERED.taper, unchanged.
 */
function filteredTaper(freq, sr) {
  const lo = sr / 8, hi = sr / 4;
  if (freq <= lo) return 1;
  if (freq >= hi) return 0;
  const u = (freq - lo) / (hi - lo);
  return 1 - u * u * (3 - 2 * u);
}

function mipFor(freq) {
  if (!(freq > MIP_BASE_HZ)) return 0;
  const m = Math.ceil(Math.log(freq / MIP_BASE_HZ) * INV_LOG2);
  return m < 0 ? 0 : m >= MIP_COUNT ? MIP_COUNT - 1 : m;
}

/* The envelope's four stages. RELEASE runs from wherever the envelope had
 * reached, not from sustain, so a key let go during its attack falls from the
 * height it actually got to — which is what makes a staccato tap quiet. */
const ATTACK = 0, DECAY = 1, SUSTAIN = 2, RELEASE = 3, DONE = 4;

class Voice {
  constructor() { this.reset(); }

  reset() {
    this.id = null;
    this.freq = 0;
    this.vel = 1;
    this.accum = 0;     // filtered: phase in radians
    this.phase = 0;     // wavetable: phase in table samples
    this.pout = 0;      // filtered: the low-passed feedback
    this.env = 0;
    this.stage = DONE;
    this.relFrom = 0;
    this.t = 0;         // seconds into the current stage
    /* A glide in progress. `freq` is the live value the oscillator reads and
     * `glideTo` where it is headed; `glideLeft` counts the samples remaining,
     * and is 0 whenever the pitch is standing still — which is the common
     * case, so the per-sample branch costs a compare and nothing else. */
    this.glideTo = 0;
    this.glideStep = 0;
    this.glideLeft = 0;
  }

  on(id, freq, vel) {
    /* Re-struck while still sounding: the phase and the feedback are kept, so
     * a repeated key continues the same oscillator rather than clicking. The
     * envelope restarts from where it is, for the same reason. */
    const carryOn = this.id === id && this.stage !== DONE;
    if (!carryOn) { this.accum = 0; this.phase = 0; this.pout = 0; }
    this.id = id;
    this.freq = freq;
    this.vel = vel;
    this.stage = ATTACK;
    this.t = 0;
    this.glideLeft = 0;
  }

  /**
   * Lead this voice to a new pitch, linearly, over `samples`.
   *
   * Linear in Hz rather than in cents because that is what the app it came
   * from does with an OscillatorNode's linearRampToValueAtTime, and a slide
   * short enough to be heard as one gesture cannot tell the two apart.
   */
  slide(freq, samples) {
    if (this.stage === DONE) return;
    if (!(samples > 0)) { this.freq = freq; this.glideLeft = 0; return; }
    this.glideTo = freq;
    this.glideStep = (freq - this.freq) / samples;
    this.glideLeft = samples;
  }

  off() {
    if (this.stage === DONE || this.stage === RELEASE) return;
    this.stage = RELEASE;
    this.relFrom = this.env;
    this.t = 0;
  }

  /** Advance the envelope one sample. Linear segments — see the editor. */
  step(adsr, dt) {
    const { a, d, s, r } = adsr;
    this.t += dt;
    switch (this.stage) {
      case ATTACK:
        if (a <= 0) { this.env = 1; this.stage = DECAY; this.t = 0; break; }
        this.env = Math.min(1, this.t / a);
        if (this.env >= 1) { this.stage = DECAY; this.t = 0; }
        break;
      case DECAY:
        if (d <= 0) { this.env = s; this.stage = SUSTAIN; break; }
        this.env = 1 + (s - 1) * Math.min(1, this.t / d);
        if (this.t >= d) { this.env = s; this.stage = SUSTAIN; }
        break;
      case SUSTAIN:
        this.env = s;
        break;
      case RELEASE:
        if (r <= 0) { this.env = 0; this.stage = DONE; break; }
        this.env = this.relFrom * (1 - Math.min(1, this.t / r));
        if (this.t >= r) { this.env = 0; this.stage = DONE; }
        break;
      default:
        this.env = 0;
    }
    return this.env;
  }
}

class XenachordVoiceProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.voices = Array.from({ length: 48 }, () => new Voice());
    this.mips = null;             // Float32Array[MIP_COUNT], wavetable family
    this.filtered = false;
    this.drive = 2; this.even = 0; // saw, the default
    this.adsr = { a: 0.016, d: 0.067, s: 0.38, r: 0.544 };
    this.gain = 0.22;
    this.pole = Math.pow(0.5, 44100 / sampleRate); // synth.js FILTERED.pole
    this.port.onmessage = (e) => this.handle(e.data);
    /* The node comes up already configured rather than waiting on its first
     * message: a port message is delivered on a later turn, so a note struck
     * in the same tick as the node's construction would otherwise sound with
     * whatever the defaults happened to be. Same messages, applied at once. */
    for (const m of options?.processorOptions?.setup || []) this.handle(m);
  }

  handle(m) {
    switch (m.t) {
      case 'tables':
        this.mips = m.mips;
        break;
      case 'shape':
        this.filtered = !!m.filtered;
        this.drive = m.drive;
        this.even = m.even;
        break;
      case 'adsr':
        this.adsr = { a: m.a, d: m.d, s: m.s, r: m.r };
        break;
      case 'on': {
        // One voice per key: the same key pressed again takes its own voice
        // back rather than stacking a second copy on top of itself.
        let v = this.voices.find((q) => q.id === m.id)
             || this.voices.find((q) => q.stage === DONE);
        if (!v) v = this.voices.reduce((lo, q) => (q.env < lo.env ? q : lo));
        v.on(m.id, m.freq, m.vel ?? 1);
        break;
      }
      case 'glide':
        for (const v of this.voices) {
          if (v.id === m.id) v.slide(m.freq, Math.round((m.time || 0) * sampleRate));
        }
        break;
      case 'off':
        for (const v of this.voices) if (v.id === m.id) v.off();
        break;
      case 'allOff':
        for (const v of this.voices) v.off();
        break;
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const n = out[0].length;
    const sr = sampleRate;
    const dt = 1 / sr;
    const buf = out[0];
    buf.fill(0);

    for (const v of this.voices) {
      if (v.stage === DONE) continue;

      if (this.filtered) {
        /* Recomputed per sample only while the pitch is actually moving:
         * a standing voice keeps the hoisted values it always had. */
        let step = (TWO_PI * v.freq) / sr;
        let taper = filteredTaper(v.freq, sr);
        let drive = this.drive * taper;
        const even = this.even;
        const pole = this.pole;
        for (let i = 0; i < n; i++) {
          if (v.glideLeft > 0) {
            v.freq += v.glideStep;
            if (--v.glideLeft === 0) v.freq = v.glideTo;
            step = (TWO_PI * v.freq) / sr;
            taper = filteredTaper(v.freq, sr);
            drive = this.drive * taper;
          }
          const amp = v.step(this.adsr, dt) * v.vel;
          v.accum += step;
          if (v.accum > TWO_PI) v.accum -= TWO_PI;
          const s = amp * Math.sin(v.accum + filteredIndex(v.pout, drive, even));
          v.pout = pole * v.pout + (1 - pole) * s;
          buf[i] += s;
          if (v.stage === DONE) break;
        }
      } else if (this.mips) {
        let table = this.mips[mipFor(v.freq)];
        let inc = (v.freq * TABLE_SIZE) / sr;
        for (let i = 0; i < n; i++) {
          if (v.glideLeft > 0) {
            v.freq += v.glideStep;
            if (--v.glideLeft === 0) v.freq = v.glideTo;
            table = this.mips[mipFor(v.freq)];
            inc = (v.freq * TABLE_SIZE) / sr;
          }
          const amp = v.step(this.adsr, dt) * v.vel;
          const j = v.phase | 0;
          const f = v.phase - j;
          const a = table[j & (TABLE_SIZE - 1)];
          const b = table[(j + 1) & (TABLE_SIZE - 1)];
          buf[i] += amp * (a + f * (b - a));
          v.phase += inc;
          if (v.phase >= TABLE_SIZE) v.phase -= TABLE_SIZE;
          if (v.stage === DONE) break;
        }
      }
    }

    /* A soft knee rather than a hard ceiling: thirty-two keys held at once is
     * a chord somebody meant, and it should get quieter and thicker rather
     * than square off into distortion. */
    for (let i = 0; i < n; i++) buf[i] = Math.tanh(buf[i] * this.gain);
    for (let c = 1; c < out.length; c++) out[c].set(buf);
    return true;
  }
}

registerProcessor('xenachord-voice', XenachordVoiceProcessor);
