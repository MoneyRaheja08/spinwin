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
export function win() {
  [523, 659, 784, 1047].forEach((f, i) =>
    setTimeout(() => beep(f, 0.35, "sine", 0.07), i * 120));
}
