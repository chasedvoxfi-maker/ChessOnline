import type { PieceColor } from "../game/types";

/**
 * All sound effects are synthesized in real time via the Web Audio API —
 * no external audio assets to fetch, license, or ship.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  muted = false;

  private ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoiseBuffer();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Must be called from a user gesture (click) to unlock audio on mobile/Safari. */
  unlock() {
    this.ensureContext();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.7;
  }

  setVolume(v: number) {
    if (this.master) this.master.gain.value = this.muted ? 0 : v;
  }

  private makeNoiseBuffer(): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private noiseBurst(duration: number, filterFreq: number, gainAmount: number, time = 0) {
    const ctx = this.ensureContext();
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.9;
    const gain = ctx.createGain();
    const t0 = ctx.currentTime + time;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainAmount, t0 + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t0);
    src.stop(t0 + duration + 0.05);
  }

  private tone(freq: number, duration: number, type: OscillatorType, gainAmount: number, time = 0, glideTo?: number) {
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    osc.type = type;
    const t0 = ctx.currentTime + time;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainAmount, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain).connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  /** Soft wooden clack: a piece touching down on the board. */
  playMove() {
    this.noiseBurst(0.09, 900, 0.5);
    this.tone(180, 0.09, "sine", 0.35, 0.005);
  }

  /** Sharper double-impact: a piece being captured. */
  playCapture() {
    this.noiseBurst(0.12, 650, 0.65);
    this.tone(140, 0.15, "triangle", 0.4, 0.01);
    this.tone(90, 0.18, "sine", 0.3, 0.04);
  }

  /** Tense rising sting when a king is put in check — "threat" sound. */
  playCheck() {
    const ctx = this.ensureContext();
    const t0 = ctx.currentTime;
    [220, 233.08].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, t0);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.9, t0 + 0.35);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1200;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.22, t0 + 0.05 + i * 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
      osc.connect(filter).connect(gain).connect(this.master!);
      osc.start(t0);
      osc.stop(t0 + 0.5);
    });
  }

  playSelect() {
    this.tone(700, 0.05, "sine", 0.15);
  }

  playIllegal() {
    this.tone(120, 0.15, "square", 0.15);
  }

  playGameStart() {
    [261.63, 329.63, 392.0, 523.25].forEach((f, i) => this.tone(f, 0.5, "sine", 0.2, i * 0.09));
  }

  /** Victorious fanfare arpeggio + a congratulatory spoken line. */
  playCheckmate(winner: PieceColor | null) {
    const ctx = this.ensureContext();
    const t0 = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C E G C E — triumphant major arpeggio
    notes.forEach((f, i) => {
      this.tone(f, 0.9, "triangle", 0.28, i * 0.13);
      this.tone(f / 2, 0.9, "sine", 0.15, i * 0.13);
    });
    // a final big chord
    const chordTime = notes.length * 0.13 + 0.15;
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => this.tone(f, 1.6, "sawtooth", 0.12, chordTime));
    void t0;

    this.speak(
      winner ? `Шах и мат! Победа за ${winner === "w" ? "белыми" : "чёрными"}! Поздравляем!` : "Ничья!",
    );
  }

  playDraw() {
    this.tone(392, 0.4, "sine", 0.2);
    this.tone(349.23, 0.5, "sine", 0.18, 0.2);
    this.speak("Ничья.");
  }

  private speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "ru-RU";
      utter.pitch = 1.05;
      utter.rate = 0.95;
      utter.volume = this.muted ? 0 : 0.9;
      const voices = window.speechSynthesis.getVoices();
      const ru = voices.find((v) => v.lang.toLowerCase().startsWith("ru"));
      if (ru) utter.voice = ru;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    } catch {
      // speech synthesis is best-effort only
    }
  }
}

export const soundManager = new SoundManager();
