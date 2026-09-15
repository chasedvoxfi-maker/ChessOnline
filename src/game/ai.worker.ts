import { Chess, type Move } from "chess.js";

// --- Evaluation tables (classic piece-square tables, white's perspective) ---
const PAWN_TABLE = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const KNIGHT_TABLE = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];
const BISHOP_TABLE = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];
const ROOK_TABLE = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, 10, 10, 10, 10, 5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 0, 5, 5, 0, 0, 0,
];
const QUEEN_TABLE = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];
const KING_TABLE = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
];

const PIECE_VALUES: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const TABLES: Record<string, number[]> = { p: PAWN_TABLE, n: KNIGHT_TABLE, b: BISHOP_TABLE, r: ROOK_TABLE, q: QUEEN_TABLE, k: KING_TABLE };

function squareIndex(square: string): number {
  const file = square.charCodeAt(0) - 97;
  const rank = 8 - parseInt(square[1], 10);
  return rank * 8 + file;
}

function evaluate(chess: Chess): number {
  if (chess.isCheckmate()) return chess.turn() === "w" ? -100000 : 100000;
  if (chess.isDraw() || chess.isStalemate()) return 0;

  let score = 0;
  const board = chess.board();
  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      const idx = squareIndex(cell.square);
      const tableIdx = cell.color === "w" ? idx : 63 - idx;
      const value = PIECE_VALUES[cell.type] + TABLES[cell.type][tableIdx];
      score += cell.color === "w" ? value : -value;
    }
  }
  // mobility bonus
  const mobility = chess.moves().length;
  score += chess.turn() === "w" ? mobility : -mobility;
  return score;
}

function orderMoves(moves: Move[]): Move[] {
  return [...moves].sort((a, b) => {
    const aScore = a.captured ? PIECE_VALUES[a.captured] - PIECE_VALUES[a.piece] / 10 : 0;
    const bScore = b.captured ? PIECE_VALUES[b.captured] - PIECE_VALUES[b.piece] / 10 : 0;
    return bScore - aScore;
  });
}

let nodesVisited = 0;
const deadline = { at: 0 };

function timeUp(): boolean {
  return performance.now() > deadline.at;
}

function minimax(chess: Chess, depth: number, alpha: number, beta: number, maximizing: boolean): number {
  nodesVisited++;
  if (depth === 0 || chess.isGameOver()) return evaluate(chess);
  if (nodesVisited % 2048 === 0 && timeUp()) return evaluate(chess);

  const moves = orderMoves(chess.moves({ verbose: true }));
  if (moves.length === 0) return evaluate(chess);

  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      chess.move(m);
      const val = minimax(chess, depth - 1, alpha, beta, false);
      chess.undo();
      best = Math.max(best, val);
      alpha = Math.max(alpha, val);
      if (beta <= alpha) break;
      if (timeUp()) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      chess.move(m);
      const val = minimax(chess, depth - 1, alpha, beta, true);
      chess.undo();
      best = Math.min(best, val);
      beta = Math.min(beta, val);
      if (beta <= alpha) break;
      if (timeUp()) break;
    }
    return best;
  }
}

interface DifficultyConfig {
  maxDepth: number;
  timeMs: number;
  randomness: number; // 0..1, chance to pick a slightly-off move
}

const DIFFICULTIES: Record<string, DifficultyConfig> = {
  easy: { maxDepth: 2, timeMs: 400, randomness: 0.35 },
  medium: { maxDepth: 3, timeMs: 900, randomness: 0.12 },
  hard: { maxDepth: 4, timeMs: 1800, randomness: 0.03 },
  master: { maxDepth: 6, timeMs: 3500, randomness: 0 },
};

function findBestMove(fen: string, difficulty: string): { from: string; to: string; promotion?: string } | null {
  const chess = new Chess(fen);
  const config = DIFFICULTIES[difficulty] ?? DIFFICULTIES.medium;
  const maximizing = chess.turn() === "w";
  const allMoves = orderMoves(chess.moves({ verbose: true }));
  if (allMoves.length === 0) return null;

  deadline.at = performance.now() + config.timeMs;
  nodesVisited = 0;

  let scored: { move: Move; score: number }[] = [];

  for (let depth = 1; depth <= config.maxDepth; depth++) {
    const roundScores: { move: Move; score: number }[] = [];
    let alpha = -Infinity;
    let beta = Infinity;
    for (const m of allMoves) {
      chess.move(m);
      const val = minimax(chess, depth - 1, alpha, beta, !maximizing);
      chess.undo();
      roundScores.push({ move: m, score: val });
      if (maximizing) alpha = Math.max(alpha, val);
      else beta = Math.min(beta, val);
      if (timeUp()) break;
    }
    if (roundScores.length === allMoves.length) {
      scored = roundScores;
      roundScores.sort((a, b) => (maximizing ? b.score - a.score : a.score - b.score));
      allMoves.sort((a, b) => {
        const ai = roundScores.findIndex((r) => r.move === a);
        const bi = roundScores.findIndex((r) => r.move === b);
        return ai - bi;
      });
    }
    if (timeUp()) break;
  }

  if (scored.length === 0) {
    const m = allMoves[0];
    return { from: m.from, to: m.to, promotion: m.promotion };
  }

  scored.sort((a, b) => (maximizing ? b.score - a.score : a.score - b.score));

  // Apply randomness: sometimes pick from the top-N instead of the absolute best, for lower difficulties.
  let pick = scored[0];
  if (Math.random() < config.randomness) {
    const poolSize = Math.min(scored.length, 4);
    pick = scored[Math.floor(Math.random() * poolSize)];
  }

  return { from: pick.move.from, to: pick.move.to, promotion: pick.move.promotion };
}

self.onmessage = (e: MessageEvent<{ fen: string; difficulty: string; requestId: number }>) => {
  const { fen, difficulty, requestId } = e.data;
  const move = findBestMove(fen, difficulty);
  (self as unknown as Worker).postMessage({ requestId, move });
};
