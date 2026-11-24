// 効果音（ブラウザで合成）
let ctx: AudioContext | null = null;
export const sound = { on: localStorage.getItem('mws_sound') !== '0' };
function ac(): AudioContext | null {
  if (!sound.on) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.08, slide = 0) {
  const a = ac(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, a.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), a.currentTime + dur);
  g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + dur);
}
function noise(dur: number, vol = 0.12, lp = 900) {
  const a = ac(); if (!a) return;
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
  const g = a.createGain(); g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination); src.start();
}
export const sfx = {
  click: () => tone(880, 0.05, 'square', 0.03),
  order: () => { tone(420, 0.08, 'triangle', 0.06); setTimeout(() => tone(630, 0.1, 'triangle', 0.06), 70); },
  alert: () => { tone(740, 0.14, 'sawtooth', 0.04); setTimeout(() => tone(560, 0.2, 'sawtooth', 0.04), 150); },
  launch: () => noise(0.5, 0.08, 2200),
  boom: () => { noise(0.7, 0.18, 500); tone(70, 0.5, 'sine', 0.12, -30); },
  capture: () => { tone(523, 0.15, 'triangle', 0.05); setTimeout(() => tone(659, 0.15, 'triangle', 0.05), 120); setTimeout(() => tone(784, 0.25, 'triangle', 0.05), 240); },
  war: () => { tone(110, 0.9, 'sawtooth', 0.06, -40); noise(0.9, 0.08, 300); },
};
export function toggleSound() { sound.on = !sound.on; localStorage.setItem('mws_sound', sound.on ? '1' : '0'); }
