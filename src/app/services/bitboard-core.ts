import { Board } from '../types/board';
import { Direction } from '../types/direction';

type MoveResult = {
  rows: number[];
  moved: boolean;
};

const rowLeft = new Uint16Array(1 << 16);
const rowRight = new Uint16Array(1 << 16);
const rowScore = new Uint32Array(1 << 16);
const rowEmptyCount = new Uint8Array(1 << 16);
const rowMonotonicity = new Int16Array(1 << 16);
const rowSmoothness = new Int16Array(1 << 16);
const rowMaxExp = new Uint8Array(1 << 16);
const rowGradient = new Int32Array(1 << 16);
const rowGradientFlipped = new Int32Array(1 << 16);
const rowHeurScore = new Float32Array(1 << 16);
const emptyCountByMask = new Uint8Array(1 << 16);

const gradients: number[][] = [
  [65536, 16384, 4096, 1024],
  [1024, 4096, 16384, 65536],
  [4096, 1024, 256, 64],
  [64, 256, 1024, 4096],
];

const gradientsFlipped = gradients.map((row) => [...row].reverse());

let tablesInitialized = false;
const SCORE_LOST_PENALTY = 200000.0;
const SCORE_MONOTONICITY_POWER = 4.0;
const SCORE_MONOTONICITY_WEIGHT = 47.0;
const SCORE_SUM_POWER = 3.5;
const SCORE_SUM_WEIGHT = 11.0;
const SCORE_MERGES_WEIGHT = 700.0;
const SCORE_EMPTY_WEIGHT = 270.0;

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

type BitboardExpectimaxOptions = {
  baseDepth?: number;
  timeBudgetMs?: number;
  nodeBudget?: number;
  minProb?: number;
  rng?: () => number;
};

type BitboardAiJsOptions = {
  maxDepth?: number;
  minProb?: number;
  timeBudgetMs?: number;
  rng?: () => number;
};

type BitboardCppOptions = {
  maxDepth?: number;
  timeBudgetMs?: number;
  rng?: () => number;
};

type AiJsScore = {
  direction: Direction;
  score: number;
};

export function computeBitboardAiJsScores(
  board: Board,
  options: BitboardAiJsOptions = {}
): AiJsScore[] {
  ensureTables();
  const rows = boardToRows(board);
  const maxDepth = Math.max(3, options.maxDepth ?? 3);
  const minProb = options.minProb ?? 1e-4;
  const timeBudgetMs = options.timeBudgetMs ?? 250;
  const start = Date.now();
  const deadline = timeBudgetMs <= 0 ? Infinity : start + timeBudgetMs;

  const aiToGame: Direction[] = ['left', 'up', 'right', 'down'];
  const scores: AiJsScore[] = [];
  for (let aiDir = 0; aiDir < 4; aiDir++) {
    if (Date.now() >= deadline) break;
    const score = aiScore(
      aiDir,
      rows,
      1,
      0,
      maxDepth,
      minProb,
      deadline
    );
    scores.push({ direction: aiToGame[aiDir], score });
  }
  return scores;
}

export function computeBitboardCppScores(
  board: Board,
  depthLimit?: number,
  options: { useCache?: boolean } = {}
): AiJsScore[] {
  ensureTables();
  const rows = boardToRows(board);
  const limit = depthLimit ?? Math.max(3, countDistinctExps(rows) - 2);
  const useCache = options.useCache ?? true;
  const directions: Direction[] = ['up', 'down', 'left', 'right'];
  const scores: AiJsScore[] = [];
  for (const direction of directions) {
    const move = applyMove(rows, direction);
    if (!move.moved) continue;
    const state = createEvalState(limit, 0, useCache);
    const score = scoreTilechooseNode(state, move.rows, 1.0);
    scores.push({ direction, score });
  }
  return scores;
}

export function computeBestMoveBitboardAiJs(
  board: Board,
  options: BitboardAiJsOptions = {}
): Direction | null {
  ensureTables();
  const rows = boardToRows(board);
  const maxDepth = Math.max(3, options.maxDepth ?? 3);
  const minProb = options.minProb ?? 1e-4;
  const rng = options.rng ?? Math.random;
  const timeBudgetMs = options.timeBudgetMs ?? 250;
  const start = Date.now();
  const deadline = timeBudgetMs <= 0 ? Infinity : start + timeBudgetMs;

  let bestScore = -Infinity;
  let bestMoves: Direction[] = [];
  const aiToGame: Direction[] = ['left', 'up', 'right', 'down'];

  for (let aiDir = 0; aiDir < 4; aiDir++) {
    if (Date.now() >= deadline) break;
    const score = aiScore(aiDir, rows, 1, 0, maxDepth, minProb, deadline);
    if (score > bestScore) {
      bestScore = score;
      bestMoves = [aiToGame[aiDir]];
    } else if (score === bestScore) {
      bestMoves.push(aiToGame[aiDir]);
    }
  }

  if (bestMoves.length === 0) return null;
  return bestMoves[Math.floor(rng() * bestMoves.length)];
}

export function computeBestMoveBitboardCpp(
  board: Board,
  options: BitboardCppOptions = {}
): Direction | null {
  ensureTables();
  const rows = boardToRows(board);
  const depthLimit =
    options.maxDepth ?? Math.max(3, countDistinctExps(rows) - 2);
  const timeBudgetMs = options.timeBudgetMs ?? 0;

  const directions: Direction[] = ['up', 'down', 'left', 'right'];
  let bestScore = 0;
  let bestMove: Direction | null = null;

  for (const direction of directions) {
    const move = applyMove(rows, direction);
    if (!move.moved) continue;
    const state = createEvalState(depthLimit, timeBudgetMs);
    const score = scoreTilechooseNode(state, move.rows, 1.0);
    const res = score + 1e-6;
    if (res > bestScore) {
      bestScore = res;
      bestMove = direction;
    }
  }

  return bestMove;
}

export function computeBestMoveBitboardExpectimax(
  board: Board,
  options: BitboardExpectimaxOptions = {}
): Direction | null {
  ensureTables();
  const rows = boardToRows(board);
  const moves = getMoveOptions(rows);
  if (moves.length === 0) return null;

  const rng = options.rng ?? Math.random;
  const baseDepth = options.baseDepth ?? 4;
  const timeBudgetMs = options.timeBudgetMs ?? 250;
  const nodeBudget = options.nodeBudget ?? 90000;
  const minProb = options.minProb ?? 1e-4;
  const start = Date.now();
  const deadline = start + timeBudgetMs;

  const empties =
    rowEmptyCount[rows[0]] +
    rowEmptyCount[rows[1]] +
    rowEmptyCount[rows[2]] +
    rowEmptyCount[rows[3]];
  const distinctDepth = Math.max(3, countDistinctExps(rows) - 2);
  let depth = Math.max(1, baseDepth, distinctDepth);
  if (empties >= 8) depth = Math.max(depth, 3);
  if (empties <= 4) depth = Math.max(depth, 5);
  const maxDepth = Math.max(depth, distinctDepth + 1);
  const budgetMs = Math.max(60, Math.min(timeBudgetMs, 1200));
  const budgetByEmpties = empties <= 2 ? budgetMs * 2 : budgetMs;
  const hardDeadline = start + budgetByEmpties;
  const effectiveDeadline = Math.min(deadline, hardDeadline);
  let nodesRemaining = Math.max(5000, nodeBudget + empties * 5000);
  let bestMoves = moves;
  const ordered = [...moves].sort(
    (a, b) => evaluateRows(b.rows) - evaluateRows(a.rows)
  );

  while (Date.now() < effectiveDeadline && nodesRemaining > 0) {
    let bestScore = -Infinity;
    let currentBest: MoveCandidate[] = [];
    let secondBest = -Infinity;

    for (const move of ordered) {
      if (Date.now() >= effectiveDeadline) break;
      const score = expectimaxRows(
        move.rows,
        depth - 1,
        false,
        1,
        minProb,
        effectiveDeadline,
        () => nodesRemaining--
      );
      if (score > bestScore) {
        secondBest = bestScore;
        bestScore = score;
        currentBest = [move];
      } else if (score === bestScore) {
        currentBest.push(move);
      } else if (score > secondBest) {
        secondBest = score;
      }
    }

    if (currentBest.length > 0) {
      bestMoves = currentBest;
    }
    if (bestScore - secondBest > 1000 && depth >= 4) {
      break;
    }
    depth += 1;
    if (depth > maxDepth) break;
  }

  return pickRandom(bestMoves, rng).direction;
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

type MoveCandidate = {
  direction: Direction;
  rows: number[];
};

function getMoveOptions(rows: number[]): MoveCandidate[] {
  const directions: Direction[] = ['up', 'down', 'left', 'right'];
  return directions
    .map((direction) => {
      const move = applyMove(rows, direction);
      return { direction, rows: move.rows, moved: move.moved };
    })
    .filter((move) => move.moved)
    .map((move) => ({ direction: move.direction, rows: move.rows }));
}

function pickRandom(moves: MoveCandidate[], rng: () => number): MoveCandidate {
  return moves[Math.floor(rng() * moves.length)];
}

function expectimaxRows(
  rows: number[],
  depth: number,
  isMax: boolean,
  prob: number,
  minProb: number,
  deadline: number,
  tick: () => void
): number {
  tick();
  if (depth <= 0 || prob < minProb || Date.now() >= deadline) {
    return evaluateRows(rows);
  }

  if (isMax) {
    const moves = getMoveOptions(rows);
    if (moves.length === 0) return -1000000;
    let best = -Infinity;
    for (const move of moves) {
      const score = expectimaxRows(
        move.rows,
        depth - 1,
        false,
        prob,
        minProb,
        deadline,
        tick
      );
      if (score > best) best = score;
    }
    return best;
  }

  const empties = listEmptyCells(rows);
  if (empties.length === 0) return evaluateRows(rows);
  const prob2 = 0.9 / empties.length;
  const prob4 = 0.1 / empties.length;
  let total = 0;

  for (const index of empties) {
    total +=
      prob2 *
      expectimaxRows(
        placeTile(rows, index, 1),
        depth - 1,
        true,
        prob * 0.9,
        minProb,
        deadline,
        tick
      );
    total +=
      prob4 *
      expectimaxRows(
        placeTile(rows, index, 2),
        depth - 1,
        true,
        prob * 0.1,
        minProb,
        deadline,
        tick
      );
  }

  return total;
}

function aiScore(
  aiDirection: number | Direction,
  rows: number[],
  prob: number,
  depth: number,
  maxDepth: number,
  minProb: number,
  deadline: number
): number {
  if (Date.now() >= deadline) return scoreHeurRows(rows);
  const dirIndex =
    typeof aiDirection === 'number'
      ? aiDirection
      : directionToAiIndex(aiDirection);
  const gameDir = aiIndexToDirection(dirIndex);
  const move = applyMove(rows, gameDir);
  const nextRows = move.moved ? move.rows : null;
  if (!nextRows) return 0;
  if (prob < minProb) return scoreHeurRows(nextRows);

  const emptyMask = emptyMaskFromRows(nextRows);
  const emptyCnt = emptyCountByMask[emptyMask];
  if (emptyCnt === 0) return scoreHeurRows(nextRows);

  if (depth < maxDepth) {
    const nextProb = prob / emptyCnt;
    let score = 0;
    forEachEmpty(emptyMask, (index) => {
      let mxscore = -Infinity;
      for (let dir = 0; dir < 4; dir++) {
        const newscore = aiScore(
          dir,
          placeTile(nextRows, index, 1),
          nextProb * 0.9,
          depth + 1,
          maxDepth,
          minProb,
          deadline
        );
        if (newscore > mxscore) mxscore = newscore;
      }
      score += (0.9 * mxscore) / emptyCnt;

      mxscore = -Infinity;
      for (let dir = 0; dir < 4; dir++) {
        const newscore = aiScore(
          dir,
          placeTile(nextRows, index, 2),
          nextProb * 0.1,
          depth + 1,
          maxDepth,
          minProb,
          deadline
        );
        if (newscore > mxscore) mxscore = newscore;
      }
      score += (0.1 * mxscore) / emptyCnt;
    });
    return score;
  }

  let score = 0;
  forEachEmpty(emptyMask, (index) => {
    const temp2 = placeTile(nextRows, index, 1);
    const temp4 = placeTile(nextRows, index, 2);
    score += (0.9 * scoreHeurRows(temp2)) / emptyCnt;
    score += (0.1 * scoreHeurRows(temp4)) / emptyCnt;
  });
  return score;
}

function directionToAiIndex(direction: Direction): number {
  switch (direction) {
    case 'left':
      return 0;
    case 'up':
      return 1;
    case 'right':
      return 2;
    case 'down':
      return 3;
  }
}

function aiIndexToDirection(direction: number): Direction {
  // AI.js directions: 0=UP,1=RIGHT,2=DOWN,3=LEFT
  switch (direction) {
    case 0:
      return 'up';
    case 1:
      return 'right';
    case 2:
      return 'down';
    case 3:
      return 'left';
    default:
      return 'up';
  }
}

type TransTableEntry = {
  depth: number;
  heuristic: number;
};

type EvalState = {
  transTable: Map<bigint, TransTableEntry>;
  useCache: boolean;
  maxDepth: number;
  curDepth: number;
  cacheHits: number;
  movesEvaled: number;
  depthLimit: number;
  deadline: number;
};

const CPROB_THRESH_BASE = 0.0001;
const CACHE_DEPTH_LIMIT = 15;
const f32 = Math.fround;

function createEvalState(
  depthLimit: number,
  timeBudgetMs = 0,
  useCache = true
): EvalState {
  const deadline =
    timeBudgetMs > 0 ? Date.now() + Math.max(1, timeBudgetMs) : Infinity;
  return {
    transTable: new Map(),
    useCache,
    maxDepth: 0,
    curDepth: 0,
    cacheHits: 0,
    movesEvaled: 0,
    depthLimit,
    deadline,
  };
}

function scoreHeurBoard(rows: number[]): number {
  const cols = rowsToCols(rows);
  let score = 0;
  for (let i = 0; i < 4; i++) {
    score = f32(score + rowHeurScore[rows[i]]);
    score = f32(score + rowHeurScore[cols[i]]);
  }
  return f32(score);
}

function scoreTilechooseNode(state: EvalState, rows: number[], cprob: number): number {
  if (Date.now() >= state.deadline) {
    return f32(scoreHeurBoard(rows));
  }
  if (cprob < CPROB_THRESH_BASE || state.curDepth >= state.depthLimit) {
    state.maxDepth = Math.max(state.curDepth, state.maxDepth);
    return f32(scoreHeurBoard(rows));
  }

  if (state.useCache && state.curDepth < CACHE_DEPTH_LIMIT) {
    const key = packRows(rows);
    const entry = state.transTable.get(key);
    if (entry && entry.depth <= state.curDepth) {
      state.cacheHits += 1;
      return entry.heuristic;
    }
  }

  const empties = listEmptyCells(rows);
  const numOpen = empties.length;
  if (numOpen === 0) return scoreHeurBoard(rows);
  cprob = f32(cprob / numOpen);

  let res = 0.0;
  for (const index of empties) {
    const score2 = scoreMoveNode(state, placeTile(rows, index, 1), f32(cprob * 0.9));
    res = f32(res + f32(score2 * 0.9));
    const score4 = scoreMoveNode(state, placeTile(rows, index, 2), f32(cprob * 0.1));
    res = f32(res + f32(score4 * 0.1));
  }
  res = f32(res / numOpen);

  if (state.useCache && state.curDepth < CACHE_DEPTH_LIMIT) {
    const key = packRows(rows);
    state.transTable.set(key, { depth: state.curDepth, heuristic: f32(res) });
  }

  return f32(res);
}

function scoreMoveNode(state: EvalState, rows: number[], cprob: number): number {
  if (Date.now() >= state.deadline) {
    return f32(scoreHeurBoard(rows));
  }
  let best = 0.0;
  state.curDepth += 1;
  for (const direction of ['up', 'down', 'left', 'right'] as Direction[]) {
    const move = applyMove(rows, direction);
    state.movesEvaled += 1;
    if (move.moved) {
      const score = scoreTilechooseNode(state, move.rows, cprob);
      best = f32(Math.max(best, score));
    }
  }
  state.curDepth -= 1;
  return f32(best);
}

function packRows(rows: number[]): bigint {
  return (
    (BigInt(rows[0]) & 0xffffn) |
    ((BigInt(rows[1]) & 0xffffn) << 16n) |
    ((BigInt(rows[2]) & 0xffffn) << 32n) |
    ((BigInt(rows[3]) & 0xffffn) << 48n)
  );
}

function scoreHeurRows(rows: number[]): number {
  const cols = rowsToCols(rows);
  let score = 0;
  for (let i = 0; i < 4; i++) {
    score += rowHeurScore[rows[i]];
    score += rowHeurScore[cols[i]];
  }
  const maxExp = Math.max(
    rowMaxExp[rows[0]],
    rowMaxExp[rows[1]],
    rowMaxExp[rows[2]],
    rowMaxExp[rows[3]],
    rowMaxExp[cols[0]],
    rowMaxExp[cols[1]],
    rowMaxExp[cols[2]],
    rowMaxExp[cols[3]]
  );
  const cornerExp = Math.max(
    rows[0] & 0xf,
    (rows[0] >> 12) & 0xf,
    rows[3] & 0xf,
    (rows[3] >> 12) & 0xf
  );
  if (cornerExp === maxExp) {
    score += maxExp * 2000;
  } else {
    score -= maxExp * 2000;
  }
  return score;
}

function emptyMaskFromRows(rows: number[]): number {
  let mask = 0;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const exp = (rows[r] >> (c * 4)) & 0xf;
      if (exp === 0) mask |= 1 << (r * 4 + c);
    }
  }
  return mask;
}

function forEachEmpty(mask: number, fn: (index: number) => void): void {
  let bit = 1;
  for (let i = 0; i < 16; i++) {
    if (mask & bit) fn(i);
    bit <<= 1;
  }
}

function countDistinctExps(rows: number[]): number {
  let mask = 0;
  for (let r = 0; r < 4; r++) {
    let shift = 0;
    for (let j = 0xf; j <= 0xf000; j <<= 4) {
      const exp = (rows[r] & j) >> shift;
      mask |= 1 << exp;
      shift += 4;
    }
  }
  return countBits(mask) - 1;
}

function countBits(value: number): number {
  let v = value >>> 0;
  v = v - ((v >> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >> 2) & 0x33333333);
  return (((v + (v >> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function listEmptyCells(rows: number[]): number[] {
  const empties: number[] = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const exp = (rows[r] >> (c * 4)) & 0xf;
      if (exp === 0) empties.push(r * 4 + c);
    }
  }
  return empties;
}

function placeTile(rows: number[], index: number, exp: number): number[] {
  const next = [...rows];
  const r = Math.floor(index / 4);
  const c = index % 4;
  const shift = c * 4;
  next[r] = (next[r] & ~(0xf << shift)) | ((exp & 0xf) << shift);
  return next;
}

function ensureTables(): void {
  if (tablesInitialized) return;
  for (let mask = 0; mask < 1 << 16; mask++) {
    emptyCountByMask[mask] = countBits(mask);
  }
  for (let row = 0; row < 1 << 16; row++) {
    const { result, score } = moveRowLeft(row);
    rowLeft[row] = result;
    const revRow = reverseRow(row);
    const { result: revResult } = moveRowLeft(revRow);
    rowRight[row] = reverseRow(revResult);
    rowScore[row] = score;
    const exp0 = row & 0xf;
    const exp1 = (row >> 4) & 0xf;
    const exp2 = (row >> 8) & 0xf;
    const exp3 = (row >> 12) & 0xf;
    rowEmptyCount[row] =
      (exp0 === 0 ? 1 : 0) +
      (exp1 === 0 ? 1 : 0) +
      (exp2 === 0 ? 1 : 0) +
      (exp3 === 0 ? 1 : 0);
    rowMaxExp[row] = Math.max(exp0, exp1, exp2, exp3);
    rowSmoothness[row] =
      -Math.abs(exp0 - exp1) -
      Math.abs(exp1 - exp2) -
      Math.abs(exp2 - exp3);
    const monotonicity = computeRowMonotonicity(
      exp0,
      exp1,
      exp2,
      exp3,
      SCORE_MONOTONICITY_POWER
    );
    rowMonotonicity[row] = monotonicity;
    const gradientRow = computeRowGradient(exp0, exp1, exp2, exp3, gradients);
    rowGradient[row] = gradientRow;
    rowGradientFlipped[row] = computeRowGradient(
      exp0,
      exp1,
      exp2,
      exp3,
      gradientsFlipped
    );
    const line = [exp0, exp1, exp2, exp3];
    let sum = f32(0);
    let empty = 0;
    let merges = 0;
    let prev = 0;
    let counter = 0;
    for (let i = 0; i < 4; i++) {
      const rank = line[i];
      sum = f32(sum + f32(Math.pow(rank, SCORE_SUM_POWER)));
      if (rank === 0) {
        empty += 1;
      } else {
        if (prev === rank) {
          counter++;
        } else if (counter > 0) {
          merges += 1 + counter;
          counter = 0;
        }
        prev = rank;
      }
    }
    if (counter > 0) {
      merges += 1 + counter;
    }
    rowHeurScore[row] = f32(
      f32(
        f32(SCORE_LOST_PENALTY) +
          f32(SCORE_EMPTY_WEIGHT * empty) +
          f32(SCORE_MERGES_WEIGHT * merges)
      ) -
        f32(SCORE_MONOTONICITY_WEIGHT * monotonicity) -
        f32(SCORE_SUM_WEIGHT * sum)
    );
  }
  tablesInitialized = true;
}

function computeRowMonotonicity(
  a: number,
  b: number,
  c: number,
  d: number,
  power: number
): number {
  let inc = f32(0);
  let dec = f32(0);
  const ap = f32(Math.pow(a, power));
  const bp = f32(Math.pow(b, power));
  const cp = f32(Math.pow(c, power));
  const dp = f32(Math.pow(d, power));
  if (ap > bp) dec = f32(dec + f32(ap - bp));
  else inc = f32(inc + f32(bp - ap));
  if (bp > cp) dec = f32(dec + f32(bp - cp));
  else inc = f32(inc + f32(cp - bp));
  if (cp > dp) dec = f32(dec + f32(cp - dp));
  else inc = f32(inc + f32(dp - cp));
  return Math.min(inc, dec);
}

function computeRowGradient(
  a: number,
  b: number,
  c: number,
  d: number,
  gradient: number[][]
): number {
  return (
    gradient[0][0] * a +
    gradient[0][1] * b +
    gradient[0][2] * c +
    gradient[0][3] * d
  );
}

function moveRowLeft(row: number): { result: number; score: number } {
  const line = [
    row & 0xf,
    (row >> 4) & 0xf,
    (row >> 8) & 0xf,
    (row >> 12) & 0xf,
  ];
  let score = 0;
  for (let i = 0; i < 4; i++) {
    const rank = line[i];
    if (rank >= 2) {
      score += (rank - 1) * (1 << rank);
    }
  }
  for (let i = 0; i < 3; i++) {
    let j = i + 1;
    while (j < 4 && line[j] === 0) j += 1;
    if (j === 4) break;
    if (line[i] === 0) {
      line[i] = line[j];
      line[j] = 0;
      i -= 1;
    } else if (line[i] === line[j]) {
      if (line[i] !== 0xf) {
        line[i] += 1;
      }
      line[j] = 0;
    }
  }

  const result =
    (line[0] & 0xf) |
    ((line[1] & 0xf) << 4) |
    ((line[2] & 0xf) << 8) |
    ((line[3] & 0xf) << 12);
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
  const cols = rowsToCols(rows);
  let score = 0;
  for (let i = 0; i < 4; i++) {
    score += rowHeurScore[rows[i]];
    score += rowHeurScore[cols[i]];
  }
  return score;
}

export function rowsToGrid(rows: number[]): Board {
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

function computeRowHeurComponents(row: number): {
  empty: number;
  merges: number;
  sum: number;
  monotonicity: number;
} {
  const exp0 = row & 0xf;
  const exp1 = (row >> 4) & 0xf;
  const exp2 = (row >> 8) & 0xf;
  const exp3 = (row >> 12) & 0xf;
  const line = [exp0, exp1, exp2, exp3];
  let empty = 0;
  let merges = 0;
  let prev = 0;
  let counter = 0;
  let sum = f32(0);
  for (let i = 0; i < 4; i++) {
    const rank = line[i];
    sum = f32(sum + f32(Math.pow(rank, SCORE_SUM_POWER)));
    if (rank === 0) {
      empty += 1;
    } else {
      if (prev === rank) {
        counter++;
      } else if (counter > 0) {
        merges += 1 + counter;
        counter = 0;
      }
      prev = rank;
    }
  }
  if (counter > 0) {
    merges += 1 + counter;
  }
  const monotonicity = computeRowMonotonicity(
    exp0,
    exp1,
    exp2,
    exp3,
    SCORE_MONOTONICITY_POWER
  );
  return { empty, merges, sum, monotonicity };
}

export function computeHeuristicBreakdown(board: Board): {
  empty: number;
  merges: number;
  sum: number;
  monotonicity: number;
  lostPenalty: number;
  total: number;
} {
  ensureTables();
  const rows = boardToRows(board);
  const cols = rowsToCols(rows);
  let empty = 0;
  let merges = 0;
  let sum = 0;
  let monotonicity = 0;
  for (let i = 0; i < 4; i++) {
    const rowParts = computeRowHeurComponents(rows[i]);
    empty += rowParts.empty;
    merges += rowParts.merges;
    sum += rowParts.sum;
    monotonicity += rowParts.monotonicity;
    const colParts = computeRowHeurComponents(cols[i]);
    empty += colParts.empty;
    merges += colParts.merges;
    sum += colParts.sum;
    monotonicity += colParts.monotonicity;
  }
  const lostPenalty = SCORE_LOST_PENALTY * 8;
  const total =
    lostPenalty +
    SCORE_EMPTY_WEIGHT * empty +
    SCORE_MERGES_WEIGHT * merges -
    SCORE_MONOTONICITY_WEIGHT * monotonicity -
    SCORE_SUM_WEIGHT * sum;
  return { empty, merges, sum, monotonicity, lostPenalty, total };
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
