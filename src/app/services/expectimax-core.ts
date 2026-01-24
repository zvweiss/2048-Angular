import { Board } from '../types/board';
import { Direction } from '../types/direction';

type MoveResult = {
  direction: Direction;
  moved: boolean;
  scoreGain: number;
  emptyCount: number;
  board: Board;
};

type ExpectimaxOptions = {
  baseDepth?: number;
  timeBudgetMs?: number;
  rng?: () => number;
};

const DEFAULT_BASE_DEPTH = 6;
const DEFAULT_TIME_BUDGET_MS = 200;

const weights = {
  empty: 4.5,
  monotonicity: 2.0,
  smoothness: 0.3,
  maxTile: 1.5,
  corner: 4.0,
  gradient: 3.0,
  merge: 1.5,
  edge: 1.2,
};

const gradients: number[][][] = [
  [
    [65536, 16384, 4096, 1024],
    [256, 64, 16, 4],
    [2, 1, 0.5, 0.25],
    [0.125, 0.0625, 0.03125, 0.015625],
  ],
  [
    [1024, 4096, 16384, 65536],
    [4, 16, 64, 256],
    [0.25, 0.5, 1, 2],
    [0.015625, 0.03125, 0.0625, 0.125],
  ],
  [
    [0.015625, 0.03125, 0.0625, 0.125],
    [0.25, 0.5, 1, 2],
    [4, 16, 64, 256],
    [1024, 4096, 16384, 65536],
  ],
  [
    [0.125, 0.0625, 0.03125, 0.015625],
    [2, 1, 0.5, 0.25],
    [4, 16, 64, 256],
    [1024, 4096, 16384, 65536],
  ],
];

export function computeBestMove(
  board: Board,
  options: ExpectimaxOptions = {}
): Direction | null {
  const moves = getMoveOptions(board);
  if (moves.length === 0) return null;

  const rng = options.rng ?? Math.random;
  const baseDepth = options.baseDepth ?? DEFAULT_BASE_DEPTH;
  const timeBudgetMs = options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const cache = new Map<string, number>();

  const start = nowMs();
  const deadline = start + timeBudgetMs;
  let depth = getSearchDepth(board, baseDepth);
  let bestMoves = moves;

  const ordered = [...moves].sort(
    (a, b) => evaluate(b.board) - evaluate(a.board)
  );

  while (nowMs() < deadline) {
    let bestScore = -Infinity;
    let currentBest: MoveResult[] = [];

    for (const move of ordered) {
      if (nowMs() >= deadline) break;
      const score = expectimax(
        move.board,
        depth - 1,
        false,
        cache,
        deadline
      );
      if (score > bestScore) {
        bestScore = score;
        currentBest = [move];
      } else if (score === bestScore) {
        currentBest.push(move);
      }
    }

    if (currentBest.length > 0) {
      bestMoves = currentBest;
    }
    depth += 1;
  }

  return pickRandom(bestMoves, rng).direction;
}

function getMoveOptions(board: Board): MoveResult[] {
  const directions: Direction[] = ['up', 'down', 'left', 'right'];
  return directions
    .map((direction) => simulateMove(board, direction))
    .filter((result) => result.moved);
}

function pickRandom(moves: MoveResult[], rng: () => number): MoveResult {
  return moves[Math.floor(rng() * moves.length)];
}

function simulateMove(board: Board, direction: Direction): MoveResult {
  const rotated = rotateForDirection(board, direction);

  const newBoard: Board = [];
  let moved = false;
  let scoreGain = 0;

  for (const row of rotated) {
    const result = slideAndMergeRow(row);
    newBoard.push(result.row);
    moved = moved || result.changed;
    scoreGain += result.scoreGain;
  }

  if (!moved) {
    return {
      direction,
      moved: false,
      scoreGain: 0,
      emptyCount: 0,
      board: board.map((row) => [...row]),
    };
  }

  const finalBoard = unrotateFromDirection(newBoard, direction);
  const emptyCount = countEmpty(finalBoard);

  return { direction, moved: true, scoreGain, emptyCount, board: finalBoard };
}

function slideAndMergeRow(row: number[]): {
  row: number[];
  scoreGain: number;
  changed: boolean;
} {
  const filtered = row.filter((n) => n !== 0);
  const merged: number[] = [];
  let scoreGain = 0;
  let i = 0;

  while (i < filtered.length) {
    if (filtered[i] === filtered[i + 1]) {
      const mergedValue = filtered[i] * 2;
      merged.push(mergedValue);
      scoreGain += mergedValue;
      i += 2;
    } else {
      merged.push(filtered[i]);
      i += 1;
    }
  }

  while (merged.length < row.length) {
    merged.push(0);
  }

  const changed = merged.some((val, idx) => val !== row[idx]);
  return { row: merged, scoreGain, changed };
}

function rotateForDirection(board: Board, direction: Direction): Board {
  switch (direction) {
    case 'up':
      return rotateCounterClockwise(board);
    case 'down':
      return rotateClockwise(board);
    case 'right':
      return rotate180(board);
    default:
      return board.map((row) => [...row]);
  }
}

function unrotateFromDirection(board: Board, direction: Direction): Board {
  switch (direction) {
    case 'up':
      return rotateClockwise(board);
    case 'down':
      return rotateCounterClockwise(board);
    case 'right':
      return rotate180(board);
    default:
      return board;
  }
}

function rotateClockwise(board: Board): Board {
  return board[0].map((_, i) => board.map((row) => row[i]).reverse());
}

function rotateCounterClockwise(board: Board): Board {
  return board[0].map((_, i) => board.map((row) => row[board.length - 1 - i]));
}

function rotate180(board: Board): Board {
  return board.map((row) => [...row].reverse()).reverse();
}

function countEmpty(board: Board): number {
  let count = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell === 0) count += 1;
    }
  }
  return count;
}

function getSearchDepth(board: Board, baseDepth: number): number {
  const empty = countEmpty(board);
  if (empty >= 8) return baseDepth + 1;
  if (empty <= 3) return Math.max(2, baseDepth - 1);
  return baseDepth;
}

function expectimax(
  board: Board,
  depth: number,
  isPlayer: boolean,
  cache: Map<string, number>,
  deadline: number
): number {
  if (nowMs() >= deadline) return evaluate(board);
  if (depth <= 0) return evaluate(board);

  const cacheKey = getCacheKey(board, depth, isPlayer);
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  if (isPlayer) {
    const moves = getMoveOptions(board);
    if (moves.length === 0) {
      const score = evaluate(board);
      cache.set(cacheKey, score);
      return score;
    }
    let best = -Infinity;
    for (const move of moves) {
      best = Math.max(
        best,
        expectimax(move.board, depth - 1, false, cache, deadline)
      );
    }
    cache.set(cacheKey, best);
    return best;
  }

  const emptyCells = getEmptyCells(board);
  if (emptyCells.length === 0) {
    const score = evaluate(board);
    cache.set(cacheKey, score);
    return score;
  }

  let total = 0;
  const maxCells = emptyCells.length > 10 ? 10 : emptyCells.length;
  shuffle(emptyCells);
  const cellProbability = 1 / emptyCells.length;
  for (let i = 0; i < maxCells; i++) {
    const cell = emptyCells[i];
    const boardWith2 = cloneBoard(board);
    boardWith2[cell.r][cell.c] = 2;
    total +=
      0.9 * cellProbability * expectimax(boardWith2, depth, true, cache, deadline);

    const boardWith4 = cloneBoard(board);
    boardWith4[cell.r][cell.c] = 4;
    total +=
      0.1 * cellProbability * expectimax(boardWith4, depth, true, cache, deadline);
  }

  cache.set(cacheKey, total);
  return total;
}

function evaluate(board: Board): number {
  const empty = countEmpty(board);
  const maxTile = getMaxTile(board);
  const maxLog = maxTile > 0 ? Math.log2(maxTile) : 0;
  const smoothness = getSmoothness(board);
  const monotonicity = getMonotonicity(board);
  const cornerBonus = isMaxInCorner(board, maxTile) ? maxLog : 0;
  const gradient = getGradientScore(board);
  const merges = getMergePotential(board);
  const edge = getEdgeScore(board);

  return (
    empty * weights.empty +
    monotonicity * weights.monotonicity +
    smoothness * weights.smoothness +
    maxLog * weights.maxTile +
    cornerBonus * weights.corner +
    gradient * weights.gradient +
    merges * weights.merge +
    edge * weights.edge
  );
}

function getEmptyCells(board: Board): { r: number; c: number }[] {
  const empty: { r: number; c: number }[] = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board.length; c++) {
      if (board[r][c] === 0) empty.push({ r, c });
    }
  }
  return empty;
}

function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

function getMaxTile(board: Board): number {
  let max = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell > max) max = cell;
    }
  }
  return max;
}

function isMaxInCorner(board: Board, maxTile: number): boolean {
  const last = board.length - 1;
  return (
    board[0][0] === maxTile ||
    board[0][last] === maxTile ||
    board[last][0] === maxTile ||
    board[last][last] === maxTile
  );
}

function getSmoothness(board: Board): number {
  let smoothness = 0;
  const size = board.length;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === 0) continue;
      const value = Math.log2(board[r][c]);

      const right = findNextNonZero(board, r, c + 1, 0);
      if (right !== null) {
        smoothness -= Math.abs(value - right);
      }

      const down = findNextNonZero(board, r + 1, c, 1);
      if (down !== null) {
        smoothness -= Math.abs(value - down);
      }
    }
  }

  return smoothness;
}

function findNextNonZero(
  board: Board,
  startR: number,
  startC: number,
  axis: 0 | 1
): number | null {
  const size = board.length;
  let r = startR;
  let c = startC;

  while (r < size && c < size) {
    if (board[r][c] !== 0) return Math.log2(board[r][c]);
    if (axis === 0) {
      c += 1;
    } else {
      r += 1;
    }
  }
  return null;
}

function getMonotonicity(board: Board): number {
  const size = board.length;
  let score = 0;

  for (let r = 0; r < size; r++) {
    let inc = 0;
    let dec = 0;
    for (let c = 0; c < size - 1; c++) {
      const current = board[r][c] ? Math.log2(board[r][c]) : 0;
      const next = board[r][c + 1] ? Math.log2(board[r][c + 1]) : 0;
      if (current > next) {
        dec += current - next;
      } else {
        inc += next - current;
      }
    }
    score += Math.max(inc, dec);
  }

  for (let c = 0; c < size; c++) {
    let inc = 0;
    let dec = 0;
    for (let r = 0; r < size - 1; r++) {
      const current = board[r][c] ? Math.log2(board[r][c]) : 0;
      const next = board[r + 1][c] ? Math.log2(board[r + 1][c]) : 0;
      if (current > next) {
        dec += current - next;
      } else {
        inc += next - current;
      }
    }
    score += Math.max(inc, dec);
  }

  return score;
}

function getGradientScore(board: Board): number {
  let best = -Infinity;
  for (const gradient of gradients) {
    let score = 0;
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board.length; c++) {
        const value = board[r][c] ? Math.log2(board[r][c]) : 0;
        score += value * gradient[r][c];
      }
    }
    if (score > best) best = score;
  }
  return best;
}

function getMergePotential(board: Board): number {
  let merges = 0;
  const size = board.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const value = board[r][c];
      if (!value) continue;
      if (c + 1 < size && board[r][c + 1] === value) merges += 1;
      if (r + 1 < size && board[r + 1][c] === value) merges += 1;
    }
  }
  return merges;
}

function getEdgeScore(board: Board): number {
  let score = 0;
  const size = board.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const value = board[r][c];
      if (!value) continue;
      if (r === 0 || c === 0 || r === size - 1 || c === size - 1) {
        score += Math.log2(value);
      }
    }
  }
  return score;
}

function shuffle<T>(items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
}

function getCacheKey(board: Board, depth: number, isPlayer: boolean): string {
  const rows = board.map((row) => row.join(',')).join('|');
  return `${depth}:${isPlayer ? 1 : 0}:${rows}`;
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
