import { Injectable } from '@angular/core';
import { Board } from '../types/board';
import { Direction } from '../types/direction';
import { applyMove, boardToRows, computeBestMoveBitboard } from './bitboard-core';
import { WrkrService } from './wrkr.service';

@Injectable({ providedIn: 'root' })
export class AiService {
  private wrkrConfig = { mindepth: 1, smartness: 1 };

  constructor(private wrkr: WrkrService) {}

  getWrkrConfig(): { mindepth: number; smartness: number } {
    return { ...this.wrkrConfig };
  }

  updateWrkrConfig(config: { mindepth: number; smartness: number }): void {
    this.wrkrConfig = { ...config };
  }

  async getMove(board: Board): Promise<Direction | null> {
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
