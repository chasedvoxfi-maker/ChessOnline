/**
 * Two jobs, both mutating TRACKS[theme] in place (tracks.ts) so MusicManager and every UI that
 * reads getTracks() automatically see the result with no other wiring:
 *
 * 1. Prunes the numbered menu-music-N.mp3 slots (tracks.ts pre-declares all 10) down to the
 *    ones that actually exist, via a HEAD probe — otherwise the settings screen would list
 *    empty slots as real tracks. Playback itself doesn't depend on this (MusicManager already
 *    skips a missing file to the next track), this is purely for an accurate track list in UI.
 * 2. Loads any tracks the player has uploaded from their own device, stored as Blobs in
 *    IndexedDB (the only "extra storage" a static, backend-less site has). These are local to
 *    this browser only — never synced anywhere — so addCustomTrack()'s caller should make that
 *    limitation clear to the player.
 */
import { TRACKS, type Track } from "./tracks";
import { musicManager, type MusicTheme } from "./MusicManager";

const DB_NAME = "chessonline-track-library";
const STORE = "custom-tracks";

interface StoredTrack {
  id: string;
  theme: MusicTheme;
  title: string;
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAll(): Promise<StoredTrack[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as StoredTrack[]);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(entry: StoredTrack): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Custom-track ids so the settings UI knows which entries it's allowed to offer deletion for
 * (a bundled repo track can't be removed from inside the app). */
const customTrackIds = new Set<string>();

export function isCustomTrack(id: string): boolean {
  return customTrackIds.has(id);
}

async function probeBundledSlots(theme: MusicTheme) {
  const list = TRACKS[theme];
  const present = await Promise.all(
    list.map(async (t) => {
      if (customTrackIds.has(t.id)) return true; // never probe a track we just added ourselves
      try {
        const res = await fetch(t.src, { method: "HEAD" });
        if (!res.ok) return false;
        // A dev/preview server can SPA-fallback a missing path to index.html with a 200 — check
        // the content type too so an absent slot doesn't get mistaken for a real mp3.
        const type = res.headers.get("content-type") ?? "";
        return type.startsWith("audio/") || type === "application/octet-stream";
      } catch {
        return false;
      }
    }),
  );
  TRACKS[theme] = list.filter((_, i) => present[i]);
}

let readyPromise: Promise<void> | null = null;

/** Idempotent — safe to call from multiple places (app bootstrap, first Settings-panel open);
 * every caller shares the same one-time probe + IndexedDB load. */
export function trackLibraryReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      const themes: MusicTheme[] = ["menu", "game"];
      await Promise.all(themes.map(probeBundledSlots));
      let stored: StoredTrack[] = [];
      try {
        stored = await idbGetAll();
      } catch {
        // IndexedDB unavailable (private browsing, old browser, ...) — custom tracks just won't
        // persist this session; bundled tracks still work fine.
      }
      for (const entry of stored) {
        const url = URL.createObjectURL(entry.blob);
        const track: Track = { id: entry.id, title: entry.title, src: url };
        customTrackIds.add(entry.id);
        TRACKS[entry.theme].push(track);
      }
      // The pruning above can shrink a list out from under a trackIndex that MusicManager may
      // already have randomized against the original, unfiltered 10-slot menu list (its random
      // start doesn't wait on this probe) — reconcile both themes so that index stays in range.
      for (const theme of themes) musicManager.notifyTracksChanged(theme);
    })();
  }
  return readyPromise;
}

/** Stores the file in IndexedDB and appends it to the theme's live playlist. The uploaded track
 * only lives in this browser (no backend to share it to other devices), but does survive reloads
 * here via IndexedDB. */
export async function addCustomTrack(theme: MusicTheme, file: File): Promise<Track> {
  const id = `custom-${crypto.randomUUID()}`;
  const title = file.name.replace(/\.[^.]+$/, "");
  try {
    await idbPut({ id, theme, title, blob: file });
  } catch {
    // best-effort persistence — the track still plays this session even if storage failed
  }
  const url = URL.createObjectURL(file);
  const track: Track = { id, title, src: url };
  customTrackIds.add(id);
  TRACKS[theme].push(track);
  musicManager.notifyTracksChanged(theme);
  return track;
}

export async function removeCustomTrack(theme: MusicTheme, id: string): Promise<void> {
  if (!customTrackIds.has(id)) return;
  const list = TRACKS[theme];
  const idx = list.findIndex((t) => t.id === id);
  if (idx !== -1) {
    URL.revokeObjectURL(list[idx].src);
    list.splice(idx, 1);
  }
  customTrackIds.delete(id);
  try {
    await idbDelete(id);
  } catch {
    // best-effort only
  }
  musicManager.notifyTracksChanged(theme);
}
