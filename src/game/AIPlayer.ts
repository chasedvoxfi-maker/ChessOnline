import type { Difficulty } from "./types";

export class AIPlayer {
  private worker: Worker;
  private requestId = 0;
  private pending = new Map<number, (move: { from: string; to: string; promotion?: string } | null) => void>();
  private difficulty: Difficulty;

  constructor(difficulty: Difficulty = "medium") {
    this.difficulty = difficulty;
    this.worker = new Worker(new URL("./ai.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<{ requestId: number; move: { from: string; to: string; promotion?: string } | null }>) => {
      const resolve = this.pending.get(e.data.requestId);
      if (resolve) {
        resolve(e.data.move);
        this.pending.delete(e.data.requestId);
      }
    };
  }

  setDifficulty(d: Difficulty) {
    this.difficulty = d;
  }

  requestMove(fen: string): Promise<{ from: string; to: string; promotion?: string } | null> {
    const requestId = ++this.requestId;
    return new Promise((resolve) => {
      this.pending.set(requestId, resolve);
      this.worker.postMessage({ fen, difficulty: this.difficulty, requestId });
    });
  }

  dispose() {
    this.worker.terminate();
  }
}
