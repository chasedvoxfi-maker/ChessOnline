import { CheckersGame, type CheckerPiece, type PieceColor } from "./CheckersGame";

function rankOf(sq: string) {
  return parseInt(sq[1], 10) - 1;
}

interface FlatMove {
  from: string;
  to: string;
}

function allMoves(game: CheckersGame, color: PieceColor): FlatMove[] {
  const moves: FlatMove[] = [];
  for (const p of game.pieces()) {
    if (p.color !== color) continue;
    for (const opt of game.legalMovesFrom(p.square)) moves.push({ from: p.square, to: opt.to });
  }
  return moves;
}

function evaluate(game: CheckersGame): number {
  if (game.isGameOver()) {
    const info = game.gameOverReason();
    if (info) return info.winner === "w" ? 100000 : -100000;
  }
  let score = 0;
  for (const p of game.pieces()) {
    const value = p.type === "k" ? 330 : 100;
    const advance = p.type === "m" ? (p.color === "w" ? rankOf(p.square) : 7 - rankOf(p.square)) * 4 : 0;
    const centerFile = Math.abs(p.square.charCodeAt(0) - 97 - 3.5);
    const centerBonus = (3.5 - centerFile) * 1.5;
    score += (p.color === "w" ? 1 : -1) * (value + advance + centerBonus);
  }
  return score;
}

const deadline = { at: 0 };
function timeUp() {
  return performance.now() > deadline.at;
}

function minimax(game: CheckersGame, depth: number, alpha: number, beta: number, color: PieceColor): number {
  if (depth === 0 || game.isGameOver() || timeUp()) return evaluate(game);
  const moves = allMoves(game, color);
  if (moves.length === 0) return evaluate(game);
  const maximizing = color === "w";
  const next: PieceColor = color === "w" ? "b" : "w";

  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      game.move(m.from, m.to);
      const val = minimax(game, depth - 1, alpha, beta, next);
      game.undo();
      best = Math.max(best, val);
      alpha = Math.max(alpha, val);
      if (beta <= alpha || timeUp()) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      game.move(m.from, m.to);
      const val = minimax(game, depth - 1, alpha, beta, next);
      game.undo();
      best = Math.min(best, val);
      beta = Math.min(beta, val);
      if (beta <= alpha || timeUp()) break;
    }
    return best;
  }
}

interface DifficultyConfig {
  maxDepth: number;
  timeMs: number;
  randomness: number;
}

const DIFFICULTIES: Record<string, DifficultyConfig> = {
  easy: { maxDepth: 3, timeMs: 400, randomness: 0.35 },
  medium: { maxDepth: 5, timeMs: 900, randomness: 0.12 },
  hard: { maxDepth: 7, timeMs: 1800, randomness: 0.03 },
  master: { maxDepth: 9, timeMs: 3500, randomness: 0 },
};

function findBestMove(pieces: CheckerPiece[], turn: PieceColor, difficulty: string): FlatMove | null {
  const game = new CheckersGame();
  game.loadState(pieces, turn);
  const config = DIFFICULTIES[difficulty] ?? DIFFICULTIES.medium;
  const moves = allMoves(game, turn);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  deadline.at = performance.now() + config.timeMs;
  const maximizing = turn === "w";
  const next: PieceColor = turn === "w" ? "b" : "w";
  let scored: { move: FlatMove; score: number }[] = moves.map((move) => ({ move, score: 0 }));

  for (let depth = 1; depth <= config.maxDepth; depth++) {
    const roundScores: { move: FlatMove; score: number }[] = [];
    let alpha = -Infinity;
    let beta = Infinity;
    for (const move of scored.map((s) => s.move)) {
      game.move(move.from, move.to);
      const val = minimax(game, depth - 1, alpha, beta, next);
      game.undo();
      roundScores.push({ move, score: val });
      if (maximizing) alpha = Math.max(alpha, val);
      else beta = Math.min(beta, val);
      if (timeUp()) break;
    }
    if (roundScores.length === scored.length) {
      scored = roundScores;
      scored.sort((a, b) => (maximizing ? b.score - a.score : a.score - b.score));
    }
    if (timeUp()) break;
  }

  let pick = scored[0];
  if (Math.random() < config.randomness) {
    const poolSize = Math.min(scored.length, 3);
    pick = scored[Math.floor(Math.random() * poolSize)];
  }
  return pick.move;
}

self.onmessage = (e: MessageEvent<{ pieces: CheckerPiece[]; turn: PieceColor; difficulty: string; requestId: number }>) => {
  const { pieces, turn, difficulty, requestId } = e.data;
  const move = findBestMove(pieces, turn, difficulty);
  (self as unknown as Worker).postMessage({ requestId, move });
};
