/**
 * Background music. If real tracks are dropped in public/audio/ (see tracks.ts), they're played
 * directly, picking a random track to start each theme's playlist and cycling through the rest
 * as each one ends (see selectTrack() for manually jumping to a specific track); otherwise it
 * falls back to a generative ambient pad synthesized in real time via the Web Audio API — a
 * slow, softly overlapping pad of detuned tones drawn from a fixed scale, so chord changes
 * always sound consonant no matter which notes get picked, plus (for the menu) occasional high
 * "sparkle" notes for a little sense of magic.
 *
 * Kept fully independent of SoundManager (its own AudioContext and gain node) so the music
 * and sound-effects mute toggles never affect each other.
 */
import { TRACKS, type Track } from "./tracks";

export type MusicTheme = "menu" | "game";

const MUTE_KEY = "chessonline-music-muted-v1";

function loadMutedPref(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

interface ActiveVoice {
  osc: OscillatorNode;
}

// Notes chosen so any three picked together stay consonant — no leading tones, no tritones.
const SCALES: Record<MusicTheme, number[]> = {
  menu: [261.63, 293.66, 329.63, 392.0, 440.0], // C D E G A — open, warm major pentatonic-ish
  game: [220.0, 246.94, 261.63, 293.66, 329.63, 392.0], // A B C D E G — a touch more grounded/focused
};

const THEME_TIMING: Record<MusicTheme, { attack: number; hold: number; release: number }> = {
  menu: { attack: 4, hold: 7, release: 4.5 },
  game: { attack: 3.5, hold: 8.5, release: 4 },
};

export class MusicManager {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private muted = loadMutedPref();
  private volume = 0.3;
  private activeVoices: ActiveVoice[] = [];
  private theme: MusicTheme | null = null;
  private chordTimer: number | null = null;
  private sparkleTimer: number | null = null;
  private generation = 0; // bumped on stop()/theme change so stale timeouts no-op
  private fileEl: HTMLAudioElement | null = null;
  /** Which track of each theme's playlist is current — randomized the first time a theme plays,
   * then advances by one (wrapping) each time a track ends, or jumps directly on selectTrack(). */
  private trackIndex: Record<MusicTheme, number> = { menu: 0, game: 0 };
  private trackIndexInitialized: Record<MusicTheme, boolean> = { menu: false, game: false };
  /**
   * iOS Safari ties audio permission to the AudioContext's CREATION, not just resume() —
   * a context built asynchronously (e.g. from a network response, off the gesture's call
   * stack) can stay silently unusable even after a later resume() from a real click. So
   * ensureContext() is never called eagerly from play(); it only runs inside unlock(),
   * guaranteed to be a direct, synchronous user-gesture callback.
   */
  private unlocked = false;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = "lowpass";
      this.filter.frequency.value = 1600;
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.muted ? 0 : this.volume;
      this.filter.connect(this.musicGain);
      this.musicGain.connect(this.ctx.destination);

      // a slow, gentle drift in brightness so the pad never feels static
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.04;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 350;
      lfo.connect(lfoGain).connect(this.filter.frequency);
      lfo.start();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Must be called from a user gesture to unlock audio on mobile/Safari. */
  unlock() {
    const wasUnlocked = this.unlocked;
    this.unlocked = true;
    this.ensureContext();
    if (this.fileEl) void this.fileEl.play().catch(() => {});
    // a play() call before the first unlock only recorded the desired theme — start it now
    if (!wasUnlocked && this.theme) this.tryPlayFile(this.theme, this.generation);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.linearRampToValueAtTime(m ? 0 : this.volume, this.ctx.currentTime + 0.5);
    }
    if (this.fileEl) this.fileEl.volume = m ? 0 : this.volume;
    try {
      localStorage.setItem(MUTE_KEY, m ? "1" : "0");
    } catch {
      // best-effort only
    }
  }

  isMuted() {
    return this.muted;
  }

  /** Starts (or switches to) a theme. Safe to call before any user gesture — it'll just stay silent until unlock(). */
  play(theme: MusicTheme) {
    if (this.theme === theme) return;
    this.stopVoices();
    this.stopFile();
    this.theme = theme;
    this.generation++;
    if (!this.trackIndexInitialized[theme]) {
      const list = TRACKS[theme];
      this.trackIndex[theme] = list.length ? Math.floor(Math.random() * list.length) : 0;
      this.trackIndexInitialized[theme] = true;
    }
    if (!this.unlocked) return; // unlock() will start this theme once a real gesture arrives
    this.tryPlayFile(theme, this.generation);
  }

  /**
   * Jumps straight to a specific track in a theme's playlist (the in-game track picker calls
   * this) — once that track ends, the normal auto-advance just continues cycling the list from
   * there, wrapping back to the start.
   */
  selectTrack(theme: MusicTheme, trackId: string) {
    const idx = TRACKS[theme].findIndex((t) => t.id === trackId);
    if (idx === -1) return;
    this.trackIndex[theme] = idx;
    this.trackIndexInitialized[theme] = true;
    if (this.theme === theme && this.unlocked) {
      this.generation++;
      this.stopVoices();
      this.tryPlayFile(theme, this.generation);
    }
  }

  getTracks(theme: MusicTheme): Track[] {
    return TRACKS[theme];
  }

  /**
   * Call after TRACKS[theme] changes at runtime (a custom track was added/removed — see
   * trackLibrary.ts). If that theme is currently playing, restarts it so the new list takes
   * effect immediately instead of waiting for the current track to end or the theme to switch.
   */
  notifyTracksChanged(theme: MusicTheme) {
    const list = TRACKS[theme];
    if (!list.length) {
      this.trackIndexInitialized[theme] = false;
    } else if (this.trackIndex[theme] >= list.length) {
      this.trackIndex[theme] = list.length - 1;
    }
    if (this.theme !== theme || !this.unlocked) return;
    this.generation++;
    this.stopVoices();
    this.stopFile();
    if (!this.trackIndexInitialized[theme] && list.length) {
      this.trackIndex[theme] = list.length - 1; // jump straight to the just-added track
      this.trackIndexInitialized[theme] = true;
    }
    this.tryPlayFile(theme, this.generation);
  }

  getCurrentTrackId(theme: MusicTheme): string | null {
    const list = TRACKS[theme];
    if (!list.length) return null;
    const idx = this.trackIndexInitialized[theme] ? this.trackIndex[theme] : 0;
    return list[idx]?.id ?? null;
  }

  stop() {
    this.theme = null;
    this.generation++;
    if (this.chordTimer !== null) {
      window.clearTimeout(this.chordTimer);
      this.chordTimer = null;
    }
    if (this.sparkleTimer !== null) {
      window.clearTimeout(this.sparkleTimer);
      this.sparkleTimer = null;
    }
    this.stopVoices();
    this.stopFile();
  }

  private stopFile() {
    if (this.fileEl) {
      this.fileEl.pause();
      this.fileEl.removeAttribute("src");
      this.fileEl = null;
    }
  }

  /**
   * Tries to play the theme's current playlist track; falls back to the generative pad only once
   * every track in the list has failed to load (e.g. a numbered menu-music-N.mp3 slot that has no
   * file behind it yet — see tracks.ts). A missing/broken track is skipped to the next one instead
   * of aborting the whole playlist, so a partially-filled 10-slot menu list still plays whichever
   * slots are actually present. Doesn't loop the single file — instead advances to the next track
   * (wrapping back to the start) once this one ends, so a real playlist actually cycles through
   * every track rather than repeating the same one forever.
   */
  private tryPlayFile(theme: MusicTheme, generation: number, attempt = 0) {
    const list = TRACKS[theme];
    if (!list.length || attempt >= list.length) {
      this.ensureContext();
      this.scheduleChord(theme, generation);
      this.scheduleSparkle(theme, generation);
      return;
    }
    const track = list[this.trackIndex[theme]];
    const audio = new Audio(track.src);
    audio.volume = this.muted ? 0 : this.volume;
    this.fileEl = audio;
    let handled = false;
    audio.addEventListener("error", () => {
      if (handled || generation !== this.generation) return;
      handled = true;
      if (this.fileEl === audio) this.fileEl = null;
      this.trackIndex[theme] = (this.trackIndex[theme] + 1) % list.length;
      this.tryPlayFile(theme, generation, attempt + 1);
    });
    audio.addEventListener("ended", () => {
      if (handled || generation !== this.generation) return; // superseded by a theme switch or manual track pick
      handled = true;
      this.trackIndex[theme] = (this.trackIndex[theme] + 1) % list.length;
      this.tryPlayFile(theme, generation);
    });
    // autoplay may be blocked until unlock() runs from a user gesture — that's not a
    // missing-file case, so it must never trigger the skip/fallback logic.
    audio.play().catch(() => {});
  }

  private stopVoices() {
    const ctx = this.ctx;
    if (ctx) {
      const now = ctx.currentTime;
      for (const v of this.activeVoices) {
        try {
          v.osc.stop(now + 1.2);
        } catch {
          // already stopped
        }
      }
    }
    this.activeVoices = [];
  }

  private scheduleChord(theme: MusicTheme, generation: number) {
    if (generation !== this.generation) return;
    const ctx = this.ensureContext();
    const scale = SCALES[theme];
    const { attack, hold, release } = THEME_TIMING[theme];
    const total = attack + hold + release;
    const now = ctx.currentTime;

    const rootIdx = Math.floor(Math.random() * scale.length);
    const chordIdxs = [rootIdx, (rootIdx + 2) % scale.length, (rootIdx + 4) % scale.length];

    for (const idx of chordIdxs) {
      const freq = scale[idx] / 2; // an octave down — a soft pad register, not the melodic range
      const osc = ctx.createOscillator();
      osc.type = theme === "menu" ? "sine" : "triangle";
      osc.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.004); // a hair of detune for warmth
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1, now + attack);
      gain.gain.setValueAtTime(0.1, now + attack + hold);
      gain.gain.linearRampToValueAtTime(0, now + total);
      osc.connect(gain).connect(this.filter!);
      osc.start(now);
      osc.stop(now + total + 0.2);
      const voice: ActiveVoice = { osc };
      this.activeVoices.push(voice);
      window.setTimeout(() => {
        this.activeVoices = this.activeVoices.filter((v) => v !== voice);
      }, (total + 0.3) * 1000);
    }

    // the next chord starts before this one has fully released, so the pad never has a gap
    this.chordTimer = window.setTimeout(() => this.scheduleChord(theme, generation), (attack + hold) * 1000 * 0.9);
  }

  private scheduleSparkle(theme: MusicTheme, generation: number) {
    if (generation !== this.generation) return;
    if (theme === "menu") {
      const ctx = this.ensureContext();
      if (Math.random() < 0.65) {
        const scale = SCALES.menu;
        const freq = scale[Math.floor(Math.random() * scale.length)] * 2;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.05, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + 2.8);
        osc.connect(gain).connect(this.filter!);
        osc.start(now);
        osc.stop(now + 3);
      }
    }
    const nextDelay = 3500 + Math.random() * 4500;
    this.sparkleTimer = window.setTimeout(() => this.scheduleSparkle(theme, generation), nextDelay);
  }
}

export const musicManager = new MusicManager();
