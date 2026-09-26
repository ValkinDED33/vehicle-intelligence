let ctx: AudioContext | null = null;
let enabled = localStorage.getItem('cara-sound') !== 'off';

export const soundEnabled = () => enabled;
export function setSoundEnabled(v: boolean) {
  enabled = v;
  localStorage.setItem('cara-sound', v ? 'on' : 'off');
}

function ac() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq: number, delay: number, dur: number, type: OscillatorType, gain: number, glide?: number) {
  const c = ac();
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 4200;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + dur + 0.05);
}

export type Sfx = 'tick' | 'open' | 'close' | 'activate' | 'chime';

export function sfx(kind: Sfx) {
  if (!enabled) return;
  try { ac(); } catch { return; }
  if (kind === 'tick') tone(520, 0, 0.09, 'sine', 0.05, 760);
  else if (kind === 'open') { tone(320, 0, 0.16, 'sine', 0.05, 640); tone(640, 0.06, 0.18, 'sine', 0.04, 980); }
  else if (kind === 'close') tone(640, 0, 0.14, 'sine', 0.045, 300);
  else if (kind === 'activate') [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.07, 0.24, 'triangle', 0.045));
  else if (kind === 'chime') { tone(880, 0, 0.12, 'sine', 0.04); tone(1318.5, 0.08, 0.18, 'sine', 0.035); }
}
