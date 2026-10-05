// Tiny WebAudio helper — no audio files needed. Must be unlocked by a user
// gesture first (browser autoplay policy), so call unlock() from a tap/click.
let ctx = null;
let muted = false;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx && ctx.state === "suspended") ctx.resume();
}
export function setMuted(v) { muted = v; }
export function isMuted() { return muted; }

function beep(freq, dur, type = "sine", gain = 0.06) {
  if (!ctx || muted) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g); g.connect(ctx.destination);
  const now = ctx.currentTime;
  o.start(now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.stop(now + dur);
}

export const tick = () => beep(880, 0.05, "square", 0.03);
export const countdownBeep = () => beep(660, 0.15, "triangle", 0.05);

// A single hand-clap: a short burst of filtered noise that decays fast.
function clapBurst(at, gain = 0.3) {
  if (!ctx || muted) return;
  const dur = 0.04;
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass";
  bp.frequency.value = 1600; bp.Q.value = 0.8;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(bp); bp.connect(g); g.connect(ctx.destination);
  src.start(at);
}

// Applause: many overlapping claps for ~2.5 seconds.
export function applause() {
  if (!ctx || muted) return;
  const now = ctx.currentTime;
  for (let i = 0; i < 26; i++) {
    const t = now + i * 0.09 + Math.random() * 0.05;
    clapBurst(t, 0.18 + Math.random() * 0.22);
  }
}

export function win() {
  [523, 659, 784, 1047].forEach((f, i) =>
    setTimeout(() => beep(f, 0.35, "sine", 0.07), i * 120));
  applause();
}
