export const SQUARE_SIZE = 1;

/** Board is centered at the world origin. White starts near +Z, black near -Z. */
export function squareToWorld(square: string): { x: number; z: number } {
  const file = square.charCodeAt(0) - 97; // 0..7 (a..h)
  const rank = parseInt(square[1], 10); // 1..8
  const x = (file - 3.5) * SQUARE_SIZE;
  const z = (3.5 - (rank - 1)) * SQUARE_SIZE;
  return { x, z };
}

export function worldToSquare(x: number, z: number): string | null {
  const file = Math.round(x / SQUARE_SIZE + 3.5);
  const rank = Math.round(3.5 - z / SQUARE_SIZE) + 1;
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null;
  return String.fromCharCode(97 + file) + rank;
}
