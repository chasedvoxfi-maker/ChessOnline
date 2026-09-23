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
  /** Each theme's current play order — a fresh shuffle of TRACKS[theme], rebuilt every time that
   * theme is (re)entered (see play()) or its track list changes (see notifyTracksChanged()), so
   * re-opening the same theme later — e.g. back at the menu after a game — picks a genuinely new
   * running order rather than resuming the last one. Wrapping past the end also reshuffles rather
   * than repeating the same cycle. Working with actual Track objects (not numeric indices into
   * TRACKS[theme]) sidesteps index-drift bugs entirely when the underlying list is pruned/grown
   * at runtime. */
  private queue: Record<MusicTheme, Track[]> = { menu: [], game: [] };
  private queuePos: Record<MusicTheme, number> = { menu: 0, game: 0 };
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
    // Never resume a file while muted — otherwise every later unlock() call (fired from nearly
    // every button's click handler, not just the mute toggle itself) would audibly un-pause it.
    if (this.fileEl && !this.muted) void this.fileEl.play().catch(() => {});
    // a play() call before the first unlock only recorded the desired theme — start it now
    if (!wasUnlocked && this.theme) this.tryPlayFile(this.theme, this.generation);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.linearRampToValueAtTime(m ? 0 : this.volume, this.ctx.currentTime + 0.5);
    }
    if (this.fileEl) {
      this.fileEl.volume = m ? 0 : this.volume;
      // Actually pause (not just silence) a file track when muted — belt-and-braces against any
      // other code path (unlock() guards its own call, but this covers every case) later calling
      // .play() on it and having it become audible again while the player thinks music is off.
      if (m) this.fileEl.pause();
      else if (this.unlocked) void this.fileEl.play().catch(() => {});
    }
    try {
      localStorage.setItem(MUTE_KEY, m ? "1" : "0");
    } catch {
      // best-effort only
    }
  }

  isMuted() {
    return this.muted;
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Fresh random play order for a theme, built from its current track list. */
  private reshuffle(theme: MusicTheme) {
    this.queue[theme] = this.shuffle(TRACKS[theme]);
    this.queuePos[theme] = 0;
  }

  /** Moves to the next track in the shuffled order, reshuffling once the order is exhausted so
   * the next lap isn't the same running order repeated. */
  private advance(theme: MusicTheme) {
    this.queuePos[theme]++;
    if (this.queuePos[theme] >= this.queue[theme].length) this.reshuffle(theme);
  }

  /** Moves back to the previous track in the shuffled order — unlike advance(), wraps to the end
   * of the SAME order rather than reshuffling, so "back" genuinely revisits what just played. */
  private retreat(theme: MusicTheme) {
    this.queuePos[theme]--;
    if (this.queuePos[theme] < 0) this.queuePos[theme] = Math.max(0, this.queue[theme].length - 1);
  }

  /** Starts (or switches to) a theme. Safe to call before any user gesture — it'll just stay
   * silent until unlock(). Always reshuffles, so returning to a theme (e.g. back at the menu
   * after a game) starts a fresh random order rather than resuming the previous one. */
  play(theme: MusicTheme) {
    if (this.theme === theme) return;
    this.stopVoices();
    this.stopFile();
    this.theme = theme;
    this.generation++;
    this.reshuffle(theme);
    if (!this.unlocked) return; // unlock() will start this theme once a real gesture arrives
    this.tryPlayFile(theme, this.generation);
  }

  /**
   * Jumps straight to a specific track in a theme's playlist (the in-game track picker calls
   * this) — once that track ends, the normal auto-advance just continues cycling the (shuffled)
   * list from there.
   */
  selectTrack(theme: MusicTheme, trackId: string) {
    if (!this.queue[theme].length) this.reshuffle(theme);
    const idx = this.queue[theme].findIndex((t) => t.id === trackId);
    if (idx === -1) return;
    this.queuePos[theme] = idx;
    if (this.theme === theme && this.unlocked) {
      this.generation++;
      this.stopVoices();
      this.tryPlayFile(theme, this.generation);
    }
  }

  /** Manually skips to the next track in the shuffled order — the in-game "skip forward" button calls this. */
  skipNext(theme: MusicTheme) {
    if (!this.queue[theme].length) this.reshuffle(theme);
    else this.advance(theme);
    if (this.theme === theme && this.unlocked) {
      this.generation++;
      this.stopVoices();
      this.stopFile();
      this.tryPlayFile(theme, this.generation);
    }
  }

  /** Manually goes back to the previous track in the shuffled order — the in-game "skip back" button calls this. */
  skipPrev(theme: MusicTheme) {
    if (!this.queue[theme].length) this.reshuffle(theme);
    else this.retreat(theme);
    if (this.theme === theme && this.unlocked) {
      this.generation++;
      this.stopVoices();
      this.stopFile();
      this.tryPlayFile(theme, this.generation);
    }
  }

  getTracks(theme: MusicTheme): Track[] {
    return TRACKS[theme];
  }

  /**
   * Call after TRACKS[theme] changes at runtime (a custom track was added/removed, or the
   * startup probe of the bundled menu-music-N.mp3 slots finished pruning the missing ones — see
   * trackLibrary.ts). Rebuilding the shuffle from the current list sidesteps any index-drift
   * entirely (the old numeric-index scheme could clamp a stale index onto the wrong track after
   * pruning). If that theme is currently playing, restarts it so the new list takes effect
   * immediately instead of waiting for the current track to end or the theme to switch.
   */
  notifyTracksChanged(theme: MusicTheme) {
    const currentId = this.getCurrentTrackId(theme);
    this.reshuffle(theme);
    if (this.theme !== theme || !this.unlocked) return;
    // A track that's already loaded and actually playing shouldn't get cut off just because the
    // list changed elsewhere in it (this fires on every page load, once the startup probe of the
    // bundled menu-music-N.mp3 slots resolves — interrupting whatever had already started a
    // moment earlier would be pure waste). Only restart if what's currently on deck is gone now,
    // or nothing successfully started yet (e.g. it's still mid-error-retry).
    if (this.fileEl && !this.fileEl.paused && currentId && TRACKS[theme].some((t) => t.id === currentId)) {
      const idx = this.queue[theme].findIndex((t) => t.id === currentId);
      if (idx !== -1) this.queuePos[theme] = idx; // keep future auto-advance in sync with the reshuffle
      return;
    }
    this.generation++;
    this.stopVoices();
    this.stopFile();
    this.tryPlayFile(theme, this.generation);
  }

  getCurrentTrackId(theme: MusicTheme): string | null {
    const q = this.queue[theme];
    if (!q.length) return null;
    return q[this.queuePos[theme] % q.length]?.id ?? null;
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
   * of aborting the whole playlist, so a partially-filled 20-slot list still plays whichever
   * slots are actually present. Doesn't loop the single file — instead advances to the next track
   * (wrapping back to the start) once this one ends, so a real playlist actually cycles through
   * every track rather than repeating the same one forever.
   */
  private tryPlayFile(theme: MusicTheme, generation: number, attempt = 0) {
    const list = this.queue[theme];
    if (!list.length || attempt >= list.length) {
      this.ensureContext();
      this.scheduleChord(theme, generation);
      this.scheduleSparkle(theme, generation);
      return;
    }
    const track = list[this.queuePos[theme] % list.length];
    const audio = new Audio(track.src);
    audio.volume = this.muted ? 0 : this.volume;
    this.fileEl = audio;
    let handled = false;
    audio.addEventListener("error", () => {
      if (handled || generation !== this.generation) return;
      handled = true;
      if (this.fileEl === audio) this.fileEl = null;
      this.advance(theme);
      this.tryPlayFile(theme, generation, attempt + 1);
    });
    audio.addEventListener("ended", () => {
      if (handled || generation !== this.generation) return; // superseded by a theme switch or manual track pick
      handled = true;
      this.advance(theme);
      this.tryPlayFile(theme, generation);
    });
    // autoplay may be blocked until unlock() runs from a user gesture, or the theme may just be
    // muted right now — neither is a missing-file case, so neither should trigger skip/fallback.
    if (!this.muted) audio.play().catch(() => {});
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
