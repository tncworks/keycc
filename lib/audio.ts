/**
 * Synthesised key sounds (Web Audio), muted by default. A "thock" is a
 * short pitched body (the case resonance), a band-passed knock (keycap
 * bottoming out) and a faint tick, through a compressor and a small
 * procedural room. Every noise buffer is seeded, so it sounds identical
 * on every load. No audio files.
 */
import { keyChannel, releaseChannel, soundStore, type KeyEvt } from "./bus";
import { KEYS } from "./engine/layout75";
import { mulberry32 } from "./engine/random";

type Ctx = AudioContext;

class KeySynth {
  private ctx: Ctx | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private rng = mulberry32(0x6d6f7465);
  private unsubs: (() => void)[] = [];
  private lastUp = 0;

  /** Must be called from a user gesture (the sound toggle). */
  async enable() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC({ latencyHint: "interactive" });
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.002;
      comp.release.value = 0.12;
      const master = ctx.createGain();
      master.gain.value = 0.55;
      const room = ctx.createConvolver();
      room.buffer = this.roomIR(ctx);
      const wet = ctx.createGain();
      wet.gain.value = 0.14;
      master.connect(comp);
      master.connect(room);
      room.connect(wet);
      wet.connect(comp);
      comp.connect(ctx.destination);
      this.ctx = ctx;
      this.out = master;
      this.noise = this.noiseBuffer(ctx);
    }
    if (this.ctx.state !== "running") await this.ctx.resume();
    if (!this.unsubs.length) {
      this.unsubs.push(keyChannel.on((e) => this.onKey(e)));
      this.unsubs.push(releaseChannel.on(() => undefined));
    }
  }

  disable() {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    void this.ctx?.suspend();
  }

  private noiseBuffer(ctx: Ctx) {
    const len = Math.floor(ctx.sampleRate * 0.25);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    const r = mulberry32(0x5eed);
    for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
    return buf;
  }

  /** a small, warm room: decaying stereo noise, darker as it fades */
  private roomIR(ctx: Ctx) {
    const len = Math.floor(ctx.sampleRate * 0.45);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    const r = mulberry32(0x7200);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const k = 0.5 - 0.42 * t; // one-pole lowpass closing over time
        lp += (r() * 2 - 1 - lp) * k;
        d[i] = lp * Math.pow(1 - t, 3.2) * 0.6;
      }
    }
    return buf;
  }

  private burst(t: number, type: BiquadFilterType, freq: number, q: number, gain: number, decay: number) {
    const ctx = this.ctx!, src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + this.rng() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(g).connect(this.out!);
    src.start(t, this.rng() * 0.15);
    src.stop(t + decay + 0.02);
  }

  private body(t: number, freq: number, gain: number, decay: number) {
    const ctx = this.ctx!, osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * 1.08, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.9, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(g).connect(this.out!);
    osc.start(t);
    osc.stop(t + decay + 0.02);
  }

  private onKey(e: KeyEvt) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running" || !soundStore.get()) return;
    if (e.repeat) return;
    const t = ctx.currentTime + 0.002;
    const v = 0.9 + this.rng() * 0.2;
    const key = e.index >= 0 ? KEYS[e.index] : null;
    const wide = key ? key.w >= 1.75 : false;
    const space = e.code === "Space";
    if (e.down) {
      // lower rows and wide (stabilised) keys sit lower
      const row = key ? key.row : 3;
      const f0 = (space ? 108 : wide ? 132 : 168 - row * 6) * (0.97 + this.rng() * 0.06);
      this.body(t, f0, 0.42 * v, space ? 0.16 : 0.1);
      this.burst(t, "bandpass", space ? 700 : 1050 + this.rng() * 250, 0.9, 0.34 * v, space ? 0.07 : 0.045);
      this.burst(t, "highpass", 3800, 0.7, 0.05 * v, 0.012);
    } else {
      if (t - this.lastUp < 0.01) return;
      this.lastUp = t;
      this.burst(t, "bandpass", 1900 + this.rng() * 300, 1.2, 0.1 * v, 0.022);
    }
  }
}

export const keySynth = new KeySynth();
