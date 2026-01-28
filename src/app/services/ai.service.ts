import { Injectable } from '@angular/core';
import { Board } from '../types/board';
import { Direction } from '../types/direction';
import { applyMove, boardToRows, computeBestMoveBitboard } from './bitboard-core';
import { computeBestMove } from './expectimax-core';
import { WrkrService } from './wrkr.service';

export type AiEngine = 'wasm' | 'ts';

@Injectable({ providedIn: 'root' })
export class AiService {
  private wrkrConfig = { mindepth: 2 };
  private engine: AiEngine = 'wasm';

  constructor(private wrkr: WrkrService) {}

  setEngine(engine: AiEngine): void {
    this.engine = engine;
  }

  getEngine(): AiEngine {
    return this.engine;
  }

  getWrkrConfig(): { mindepth: number } {
    return { ...this.wrkrConfig };
  }

  updateWrkrConfig(config: { mindepth: number }): void {
    this.wrkrConfig = { ...config };
  }

  async getMove(board: Board): Promise<Direction | null> {
    if (this.engine === 'ts') {
      const distinct = new Set<number>();
      for (const row of board) {
        for (const cell of row) {
          if (cell > 0) distinct.add(cell);
        }
      }
      const distinctDepth = Math.max(3, distinct.size - 2);
      const baseDepth = Math.max(this.wrkrConfig.mindepth, distinctDepth);
      return (
        computeBestMove(board, {
          baseDepth,
          timeBudgetMs: 800,
        }) ?? null
      );
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
}
