import { Injectable } from '@angular/core';
import { Board } from '../types/board';
import { Direction } from '../types/direction';
import {
  applyMove,
  boardToRows,
  computeBestMoveBitboard,
  computeBitboardAiJsScores,
  computeBitboardCppDirectionScore,
  computeBitboardCppScores,
  computeBestMoveBitboardAiJs,
  computeBestMoveBitboardCpp,
  computeBestMoveBitboardExpectimax,
} from './bitboard-core';
import { WrkrService } from './wrkr.service';

export type AiEngine = 'wasm' | 'ts';

@Injectable({ providedIn: 'root' })
export class AiService {
  private wrkrConfig = { mindepth: 2 };
  private tsConfig = { depthCap: 4, timeBudgetMs: 250 };
  private engine: AiEngine = 'ts';
  private debugAi = false;
  private tsWorkerCount = 1;
  private tsWorkers: Worker[] = [];
  private tsWorkerNext = 0;
  private tsWorkerRequestId = 0;
  private tsWorkerResolvers = new Map<number, (score: number) => void>();
  private tsWorkerRejecters = new Map<number, (error: unknown) => void>();

  constructor(private wrkr: WrkrService) {
    try {
      const stored = Number(localStorage.getItem('tsWorkerCount') || '1');
      this.setTsWorkerCount(stored);
    } catch {
      this.setTsWorkerCount(1);
    }
  }

  setEngine(engine: AiEngine): void {
    this.engine = engine;
  }

  getEngine(): AiEngine {
    return this.engine;
  }

  setDebugAi(enabled: boolean): void {
    this.debugAi = enabled;
  }

  setTsWorkerCount(count: number): void {
    const nextCount = Math.max(1, Math.min(4, Math.floor(count || 1)));
    if (this.tsWorkerCount === nextCount) return;
    this.tsWorkerCount = nextCount;
    try {
      localStorage.setItem('tsWorkerCount', String(this.tsWorkerCount));
    } catch {}
    this.teardownTsWorkers();
  }

  getTsWorkerCount(): number {
    return this.tsWorkerCount;
  }

  getWrkrConfig(): { mindepth: number } {
    return { ...this.wrkrConfig };
  }

  getTsConfig(): { depthCap: number; timeBudgetMs: number } {
    return { ...this.tsConfig };
  }

  async getWasmScores(
    board: Board
  ): Promise<{ direction: Direction; score: number }[]> {
    return this.getWasmScoresAtDepth(board, this.wrkrConfig.mindepth);
  }

  async getWasmScoresAtDepth(
    board: Board,
    mindepth: number
  ): Promise<{ direction: Direction; score: number }[]> {
    if (!this.wrkr.isAvailable()) return [];
    const rows = boardToRows(board);
    const directions: Direction[] = ['up', 'down', 'left', 'right'];
    const candidates = directions.filter(
      (direction) => applyMove(rows, direction).moved
    );
    const config = { mindepth };
    const scores = await Promise.all(
      candidates.map((direction) =>
        this.wrkr.scoreDirection(board, direction, config)
      )
    );
    return candidates.map((direction, index) => ({
      direction,
      score: scores[index],
    }));
  }

  getTsScores(
    board: Board,
    maxDepth = 4
  ): { direction: Direction; score: number }[] {
    return computeBitboardCppScores(board, maxDepth);
  }

  getTsScoresNoCache(
    board: Board,
    maxDepth = 4
  ): { direction: Direction; score: number }[] {
    return computeBitboardCppScores(board, maxDepth, { useCache: false });
  }

  getTsAiJsScores(
    board: Board,
    maxDepth = 4
  ): { direction: Direction; score: number }[] {
    return computeBitboardAiJsScores(board, { maxDepth, timeBudgetMs: 0 });
  }

  updateWrkrConfig(config: { mindepth: number }): void {
    this.wrkrConfig = { ...config };
  }

  updateTsConfig(config: { depthCap: number; timeBudgetMs: number }): void {
    this.tsConfig = { ...config };
  }

  async getMove(board: Board): Promise<Direction | null> {
    return this.getMoveForEngine(this.engine, board);
  }

  async getMoveForEngine(
    engine: AiEngine,
    board: Board
  ): Promise<Direction | null> {
    if (engine === 'ts') {
      const distinct = new Set<number>();
      for (const row of board) {
        for (const cell of row) {
          if (cell > 0) distinct.add(cell);
        }
      }
      const distinctDepth = Math.max(2, distinct.size - 2);
      const depthCap = Math.max(2, this.tsConfig.depthCap);
      const depthLimit = Math.min(depthCap, distinctDepth);
      const move =
        this.tsWorkerCount > 1
          ? await this.getTsMoveParallel(board, depthLimit)
          : computeBestMoveBitboardCpp(board, {
              maxDepth: depthLimit,
              timeBudgetMs: this.tsConfig.timeBudgetMs,
            });
      if (this.debugAi) {
        const scores = computeBitboardCppScores(board, depthLimit);
        console.log(
          'TS scores:',
          scores
            .map((entry) => `${entry.direction}:${entry.score.toFixed(2)}`)
            .join(' | ')
        );
      }
      if (move && this.isMoveValid(board, move)) return move;
      const fallback = computeBestMoveBitboard(board);
      if (fallback && this.isMoveValid(board, fallback)) return fallback;
      return this.findFirstValidMove(board);
    }

    if (!this.wrkr.isAvailable()) {
      return computeBestMoveBitboard(board);
    }

    const rows = boardToRows(board);
    const directions: Direction[] = ['up', 'down', 'left', 'right'];
    const candidates = directions.filter(
      (direction) => applyMove(rows, direction).moved
    );
    if (candidates.length === 0) return null;

    const scores = await Promise.all(
      candidates.map((direction) =>
        this.wrkr.scoreDirection(board, direction, this.wrkrConfig)
      )
    );

    let bestScore = -Infinity;
    let bestMoves: Direction[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const score = scores[i];
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [candidates[i]];
      } else if (score === bestScore) {
        bestMoves.push(candidates[i]);
      }
    }

    if (bestMoves.length === 0) return null;
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  private async getTsMoveParallel(
    board: Board,
    depthLimit: number
  ): Promise<Direction | null> {
    const rows = boardToRows(board);
    const directions: Direction[] = ['up', 'down', 'left', 'right'];
    const candidates = directions.filter(
      (direction) => applyMove(rows, direction).moved
    );
    if (candidates.length === 0) return null;
    const scores = await Promise.all(
      candidates.map(async (direction) => ({
        direction,
        score: await this.scoreDirectionWithTsWorker(board, direction, depthLimit),
      }))
    );
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestMoves: Direction[] = [];
    for (const entry of scores) {
      if (entry.score > bestScore) {
        bestScore = entry.score;
        bestMoves = [entry.direction];
      } else if (entry.score === bestScore) {
        bestMoves.push(entry.direction);
      }
    }
    if (bestMoves.length === 0) return null;
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  private async scoreDirectionWithTsWorker(
    board: Board,
    direction: Direction,
    depthLimit: number
  ): Promise<number> {
    try {
      const worker = this.getNextTsWorker();
      if (!worker) {
        return computeBitboardCppDirectionScore(board, direction, depthLimit);
      }
      const requestId = ++this.tsWorkerRequestId;
      const scorePromise = new Promise<number>((resolve, reject) => {
        this.tsWorkerResolvers.set(requestId, resolve);
        this.tsWorkerRejecters.set(requestId, reject);
      });
      worker.postMessage({
        id: requestId,
        board,
        direction,
        maxDepth: depthLimit,
      });
      return await scorePromise;
    } catch {
      return computeBitboardCppDirectionScore(board, direction, depthLimit);
    }
  }

  private getNextTsWorker(): Worker | null {
    if (typeof Worker === 'undefined' || this.tsWorkerCount <= 1) return null;
    this.ensureTsWorkers();
    if (this.tsWorkers.length === 0) return null;
    const worker = this.tsWorkers[this.tsWorkerNext % this.tsWorkers.length];
    this.tsWorkerNext = (this.tsWorkerNext + 1) % this.tsWorkers.length;
    return worker;
  }

  private ensureTsWorkers(): void {
    if (this.tsWorkers.length > 0 || typeof Worker === 'undefined') return;
    for (let i = 0; i < this.tsWorkerCount; i++) {
      const workerUrl = new URL(
        '../workers/ts-direction-score.worker',
        import.meta.url
      );
      const worker = new Worker(workerUrl);
      worker.onmessage = (event: MessageEvent<{ id: number; score: number }>) => {
        const { id, score } = event.data;
        const resolve = this.tsWorkerResolvers.get(id);
        if (resolve) resolve(score);
        this.tsWorkerResolvers.delete(id);
        this.tsWorkerRejecters.delete(id);
      };
      worker.onerror = () => {
        for (const reject of this.tsWorkerRejecters.values()) {
          reject(new Error('TS worker error'));
        }
        this.tsWorkerResolvers.clear();
        this.tsWorkerRejecters.clear();
        this.teardownTsWorkers();
      };
      this.tsWorkers.push(worker);
    }
  }

  private teardownTsWorkers(): void {
    for (const worker of this.tsWorkers) {
      worker.terminate();
    }
    this.tsWorkers = [];
    this.tsWorkerNext = 0;
    this.tsWorkerResolvers.clear();
    this.tsWorkerRejecters.clear();
  }

  private findFirstValidMove(board: Board): Direction | null {
    const directions: Direction[] = ['up', 'down', 'left', 'right'];
    for (const direction of directions) {
      if (this.isMoveValid(board, direction)) return direction;
    }
    return null;
  }

  private isMoveValid(board: Board, direction: Direction): boolean {
    const rotated = this.rotateForDirection(board, direction);
    let moved = false;
    const next: Board = [];
    for (const row of rotated) {
      const result = this.slideAndMergeRow(row);
      next.push(result.row);
      if (result.changed) moved = true;
    }
    return moved;
  }

  private rotateForDirection(board: Board, direction: Direction): Board {
    switch (direction) {
      case 'up':
        return this.rotateCounterClockwise(board);
      case 'down':
        return this.rotateClockwise(board);
      case 'right':
        return this.rotate180(board);
      default:
        return board.map((row) => [...row]);
    }
  }

  private rotateClockwise(board: Board): Board {
    const size = board.length;
    const rotated: Board = Array.from({ length: size }, () =>
      Array(size).fill(0)
    );
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        rotated[c][size - 1 - r] = board[r][c];
      }
    }
    return rotated;
  }

  private rotateCounterClockwise(board: Board): Board {
    const size = board.length;
    const rotated: Board = Array.from({ length: size }, () =>
      Array(size).fill(0)
    );
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        rotated[size - 1 - c][r] = board[r][c];
      }
    }
    return rotated;
  }

  private rotate180(board: Board): Board {
    const size = board.length;
    const rotated: Board = Array.from({ length: size }, () =>
      Array(size).fill(0)
    );
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        rotated[size - 1 - r][size - 1 - c] = board[r][c];
      }
    }
    return rotated;
  }

  private slideAndMergeRow(row: number[]): {
    row: number[];
    changed: boolean;
  } {
    const filtered = row.filter((n) => n !== 0);
    const merged: number[] = [];
    let i = 0;
    while (i < filtered.length) {
      if (filtered[i] === filtered[i + 1]) {
        merged.push(filtered[i] * 2);
        i += 2;
      } else {
        merged.push(filtered[i]);
        i += 1;
      }
    }
    while (merged.length < row.length) merged.push(0);
    const changed = merged.some((val, idx) => val !== row[idx]);
    return { row: merged, changed };
  }
}
