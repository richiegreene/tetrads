/* =====================================================================
 *  THE SOUNDING END
 * =====================================================================
 *
 * One AudioContext, one worklet node, and the pair of numbers the worklet
 * needs kept up to date: which shape it is folding or reading, and what the
 * envelope is. Everything expensive — the eleven band-limited tables — is
 * built here on the main thread and posted across, because the audio thread
 * has 128 samples to fill and no business doing additive synthesis inside
 * them.
 *
 * The context is not created until the first key goes down. A browser will not
 * start one without a gesture, and a page that asks for audio before anybody
 * asked to hear anything is a page that gets muted.
 * ------------------------------------------------------------------ */

import { FILTERED, FILTERED_MIN, familyOf } from './timbre.js';
import { wavetablesFor } from './tables.js';

let ctx = null;
let node = null;
let ready = null;          // the promise the worklet module is loading on
let timbre = FILTERED_MIN + 200;   // filtered saw
let adsr = { a: 0.016, d: 0.067, s: 0.38, r: 0.544 };

/** Bring the audio up, once, on a gesture. Safe to call on every key. */
export function start() {
  if (ready) return ready;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return (ready = Promise.reject(new Error('no Web Audio')));
  ctx = new AC();
  ready = ctx.audioWorklet.addModule('js/synth/voice-processor.js').then(() => {
    node = new AudioWorkletNode(ctx, 'xenachord-voice', {
      outputChannelCount: [2],
      // Configured at construction, so the first key cannot beat the first
      // message across the port — see the processor's constructor.
      processorOptions: { setup: setup() },
    });
    node.connect(ctx.destination);
  });
  return ready;
}

/**
 * Everything the worklet needs to hold, as the messages that say it.
 *
 * One list, used both to configure a new node and to update a running one, so
 * a node built at any moment is in exactly the state a running one would have
 * been brought to.
 */
function setup() {
  const msgs = [];
  if (familyOf(timbre) === 'filtered') {
    const { drive, even } = FILTERED.shape(timbre);
    msgs.push({ t: 'shape', filtered: true, drive, even });
  } else {
    msgs.push({ t: 'shape', filtered: false, drive: 0, even: 0 });
    /* Copies, not the cached originals: posting a Float32Array structured-
     * clones it, and the cache has to survive to answer the next slider move
     * without rebuilding eleven tables. */
    msgs.push({ t: 'tables', mips: wavetablesFor(timbre, ctx.sampleRate).map((t) => t.slice()) });
  }
  msgs.push({ t: 'adsr', ...adsr });
  return msgs;
}

/** The same list, sent to a node that is already running. */
function push() {
  if (!node) return;
  for (const m of setup()) node.port.postMessage(m);
}

export function setTimbre(v) {
  timbre = v;
  push();
}

export function setAdsr(next) {
  adsr = { ...adsr, ...next };
  if (node) node.port.postMessage({ t: 'adsr', ...adsr });
}

export function noteOn(id, freq, vel = 1) {
  if (!(freq > 0)) return;
  start().then(() => {
    if (ctx.state === 'suspended') ctx.resume();
    node.port.postMessage({ t: 'on', id, freq, vel });
  }).catch(() => {});
}

export function noteOff(id) {
  if (node) node.port.postMessage({ t: 'off', id });
}

/**
 * Slide a sounding voice to a new pitch over `time` seconds.
 *
 * Tetrads moves between chords rather than between notes: the four voices are
 * held down and their frequencies are led to the next tetrad, which is the
 * whole reason the shape under the pointer reads as a progression. A voice
 * that were stopped and restarted would re-attack four times a second, so the
 * glide is a message to the running voice instead of a new note.
 */
export function glide(id, freq, time) {
  if (!node || !(freq > 0)) return;
  node.port.postMessage({ t: 'glide', id, freq, time });
}

/** Whether a voice with this id is still sounding — asked before gliding. */
export function isRunning() {
  return !!node;
}

export function allOff() {
  if (node) node.port.postMessage({ t: 'allOff' });
}
