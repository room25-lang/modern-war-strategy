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

// ===== BGM（ブラウザで合成する環境音楽。緊張期は静か、戦時は低い鼓動が加わる） =====
export const music = {
  on: localStorage.getItem('mws_music') !== '0',
  vol: Number(localStorage.getItem('mws_music_vol') ?? 0.5),
  mood: 'calm' as 'calm' | 'war',
  master: null as GainNode | null,
  timer: 0 as number,
  step: 0,
  next: 0,
};
// ニ短調の進行（コードの構成音・Hz）
const CHORDS: Record<'calm' | 'war', number[][]> = {
  calm: [[146.8, 174.6, 220.0], [116.5, 146.8, 174.6], [130.8, 164.8, 196.0], [110.0, 138.6, 164.8]],
  war: [[146.8, 174.6, 220.0], [98.0, 116.5, 146.8], [110.0, 138.6, 164.8], [116.5, 146.8, 174.6]],
};
function musicCtx(): AudioContext | null {
  if (!music.on) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  if (!music.master) { music.master = ctx.createGain(); music.master.gain.value = music.vol * 0.16; music.master.connect(ctx.destination); }
  return ctx;
}
function pad(a: AudioContext, freqs: number[], t: number, dur: number, bright: number) {
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(500 + bright * 900, t); f.Q.value = 0.5;
  const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  f.connect(g).connect(music.master!);
  for (const fr of freqs) for (const det of [-6, 5]) {
    const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = det;
    const og = a.createGain(); og.gain.value = 0.12; o.connect(og).connect(f); o.start(t); o.stop(t + dur + 0.1);
  }
}
function pulse(a: AudioContext, freq: number, t: number, vol: number) {
  const o = a.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.35);
  const g = a.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  o.connect(g).connect(music.master!); o.start(t); o.stop(t + 0.45);
}
function bell(a: AudioContext, freq: number, t: number) {
  const o = a.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
  const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
  o.connect(g).connect(music.master!); o.start(t); o.stop(t + 2.6);
}
function tick() {
  const a = musicCtx(); if (!a) return;
  const bar = music.mood === 'war' ? 6.4 : 9.6; // 1コードの長さ（秒）
  while (music.next < a.currentTime + 1.5) {
    const t = Math.max(music.next, a.currentTime + 0.05);
    const prog = CHORDS[music.mood]; const ch = prog[music.step % prog.length];
    pad(a, ch, t, bar + 1.5, music.mood === 'war' ? 0.5 : 0.2);
    if (music.mood === 'war') for (let i = 0; i < 8; i++) pulse(a, ch[0] / 2, t + i * bar / 8, i % 4 === 0 ? 0.22 : 0.1);
    else for (let i = 0; i < 2; i++) if (Math.random() < 0.6) bell(a, ch[Math.floor(Math.random() * 3)] * 4, t + bar * (0.3 + i * 0.4));
    music.step++; music.next = t + bar;
  }
}
export function startMusic() {
  if (!music.on || music.timer) return;
  const a = musicCtx(); if (!a) return;
  music.next = a.currentTime + 0.1;
  music.timer = window.setInterval(tick, 400); tick();
}
export function stopMusic() {
  if (music.timer) { clearInterval(music.timer); music.timer = 0; }
  if (music.master && ctx) { const old = music.master; old.gain.setTargetAtTime(0, ctx.currentTime, 0.4); setTimeout(() => old.disconnect(), 2000); music.master = null; }
}
export function setMood(m: 'calm' | 'war') { music.mood = m; }
export function toggleMusic() { music.on = !music.on; localStorage.setItem('mws_music', music.on ? '1' : '0'); if (music.on) startMusic(); else stopMusic(); }
export function setMusicVol(v: number) { music.vol = v; localStorage.setItem('mws_music_vol', String(v)); if (music.master && ctx) music.master.gain.setTargetAtTime(v * 0.16, ctx.currentTime, 0.2); }
