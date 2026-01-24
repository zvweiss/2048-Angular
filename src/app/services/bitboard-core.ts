import { Board } from '../types/board';
import { Direction } from '../types/direction';

type MoveResult = {
  rows: number[];
  moved: boolean;
};

const rowLeft = new Uint16Array(1 << 16);
const rowRight = new Uint16Array(1 << 16);
const rowScore = new Uint32Array(1 << 16);

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

const gradientsFlipped = gradients.map((gradient) =>
  gradient.map((row) => [...row].reverse())
);

let tablesInitialized = false;

export function computeBestMoveBitboard(board: Board): Direction | null {
  ensureTables();
  const rows = boardToRows(board);
  let bestScore = -Infinity;
  let bestMoves: Direction[] = [];

  const directions: Direction[] = ['up', 'right', 'down', 'left'];
  for (const direction of directions) {
    const move = applyMove(rows, direction);
    if (!move.moved) continue;
    const score = evaluateRows(move.rows);
    if (score > bestScore) {
      bestScore = score;
      bestMoves = [direction];
    } else if (score === bestScore) {
      bestMoves.push(direction);
    }
  }

  if (bestMoves.length === 0) return null;
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

export function applyMove(rows: number[], direction: Direction): MoveResult {
  ensureTables();
  if (direction === 'left' || direction === 'right') {
    const next = rows.map((row) =>
      direction === 'left' ? rowLeft[row] : rowRight[row]
    );
    const moved = next.some((row, i) => row !== rows[i]);
    return { rows: next, moved };
  }

  const cols = rowsToCols(rows);
  const nextCols = cols.map((col) =>
    direction === 'up' ? rowLeft[col] : rowRight[col]
  );
  const moved = nextCols.some((col, i) => col !== cols[i]);
  const nextRows = colsToRows(nextCols);
  return { rows: nextRows, moved };
}

function ensureTables(): void {
  if (tablesInitialized) return;
  for (let row = 0; row < 1 << 16; row++) {
    const { result, score } = moveRowLeft(row);
    rowLeft[row] = result;
    rowRight[row] = reverseRow(rowLeft[reverseRow(row)]);
    rowScore[row] = score;
  }
  tablesInitialized = true;
}

function moveRowLeft(row: number): { result: number; score: number } {
  const tiles = [
    row & 0xf,
    (row >> 4) & 0xf,
    (row >> 8) & 0xf,
    (row >> 12) & 0xf,
  ];
  const filtered = tiles.filter((v) => v !== 0);
  const merged: number[] = [];
  let score = 0;
  let i = 0;

  while (i < filtered.length) {
    if (filtered[i] === filtered[i + 1]) {
      const mergedValue = filtered[i] + 1;
      merged.push(mergedValue);
      score += 1 << mergedValue;
      i += 2;
    } else {
      merged.push(filtered[i]);
      i += 1;
    }
  }

  while (merged.length < 4) merged.push(0);

  const result =
    (merged[0] & 0xf) |
    ((merged[1] & 0xf) << 4) |
    ((merged[2] & 0xf) << 8) |
    ((merged[3] & 0xf) << 12);
  return { result, score };
}

function reverseRow(row: number): number {
  return (
    ((row & 0xf) << 12) |
    ((row & 0xf0) << 4) |
    ((row & 0xf00) >> 4) |
    ((row & 0xf000) >> 12)
  );
}

export function boardToRows(board: Board): number[] {
  const rows = [0, 0, 0, 0];
  for (let r = 0; r < 4; r++) {
    let packed = 0;
    for (let c = 0; c < 4; c++) {
      const value = board[r][c];
      const exp = value > 0 ? Math.log2(value) : 0;
      packed |= (exp & 0xf) << (c * 4);
    }
    rows[r] = packed;
  }
  return rows;
}

function rowsToCols(rows: number[]): number[] {
  const cols = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    let packed = 0;
    for (let r = 0; r < 4; r++) {
      const exp = (rows[r] >> (c * 4)) & 0xf;
      packed |= exp << (r * 4);
    }
    cols[c] = packed;
  }
  return cols;
}

function colsToRows(cols: number[]): number[] {
  const rows = [0, 0, 0, 0];
  for (let r = 0; r < 4; r++) {
    let packed = 0;
    for (let c = 0; c < 4; c++) {
      const exp = (cols[c] >> (r * 4)) & 0xf;
      packed |= exp << (c * 4);
    }
    rows[r] = packed;
  }
  return rows;
}

function evaluateRows(rows: number[]): number {
  const grid = rowsToGrid(rows);
  const empty = countEmpty(grid);
  const maxTile = getMaxTile(grid);
  const maxLog = maxTile > 0 ? Math.log2(maxTile) : 0;
  const smoothness = getSmoothness(grid);
  const monotonicity = getMonotonicity(grid);
  const cornerBonus = isMaxInCorner(grid, maxTile) ? maxLog : 0;
  const gradient = getGradientScore(grid);
  const merges = getMergePotential(grid);
  const edge = getEdgeScore(grid);

  return (
    empty * 3.0 +
    monotonicity * 1.3 +
    smoothness * 0.2 +
    maxLog * 1.0 +
    cornerBonus * 2.5 +
    gradient * 2.2 +
    merges * 1.0 +
    edge * 0.8
  );
}

function rowsToGrid(rows: number[]): Board {
  const grid: Board = [];
  for (let r = 0; r < 4; r++) {
    const row: number[] = [];
    for (let c = 0; c < 4; c++) {
      const exp = (rows[r] >> (c * 4)) & 0xf;
      row.push(exp > 0 ? 1 << exp : 0);
    }
    grid.push(row);
  }
  return grid;
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
      if (right !== null) smoothness -= Math.abs(value - right);

      const down = findNextNonZero(board, r + 1, c, 1);
      if (down !== null) smoothness -= Math.abs(value - down);
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
    if (axis === 0) c += 1;
    else r += 1;
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
      if (current > next) dec += current - next;
      else inc += next - current;
    }
    score += Math.max(inc, dec);
  }

  for (let c = 0; c < size; c++) {
    let inc = 0;
    let dec = 0;
    for (let r = 0; r < size - 1; r++) {
      const current = board[r][c] ? Math.log2(board[r][c]) : 0;
      const next = board[r + 1][c] ? Math.log2(board[r + 1][c]) : 0;
      if (current > next) dec += current - next;
      else inc += next - current;
    }
    score += Math.max(inc, dec);
  }

  return score;
}

function getGradientScore(board: Board): number {
  let best = -Infinity;
  const all = gradients.concat(gradientsFlipped);
  for (const gradient of all) {
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
