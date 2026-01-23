import { Injectable } from '@angular/core';
import { Board } from '../types/board';
import { Direction } from '../types/direction';

export type AIStrategy = 'random' | 'greedy' | 'expectimax';

export type ExpectimaxWeights = {
  empty: number;
  monotonicity: number;
  smoothness: number;
  maxTile: number;
  corner: number;
};

export type ExpectimaxConfig = {
  depth: number;
  weights: ExpectimaxWeights;
};

type MoveResult = {
  direction: Direction;
  moved: boolean;
  scoreGain: number;
  emptyCount: number;
  board: Board;
};

@Injectable({ providedIn: 'root' })
export class AiService {
  private expectimaxConfig: ExpectimaxConfig = {
    depth: 2,
    weights: {
      empty: 2.7,
      monotonicity: 1.2,
      smoothness: 0.1,
      maxTile: 1.0,
      corner: 1.5,
    },
  };

  getExpectimaxConfig(): ExpectimaxConfig {
    return {
      depth: this.expectimaxConfig.depth,
      weights: { ...this.expectimaxConfig.weights },
    };
  }

  updateExpectimaxConfig(config: Partial<ExpectimaxConfig>): void {
    if (config.depth !== undefined) {
      this.expectimaxConfig.depth = Math.max(1, Math.floor(config.depth));
    }
    if (config.weights) {
      this.updateExpectimaxWeights(config.weights);
    }
  }

  updateExpectimaxWeights(weights: Partial<ExpectimaxWeights>): void {
    this.expectimaxConfig.weights = {
      ...this.expectimaxConfig.weights,
      ...weights,
    };
  }
  getMove(board: Board, strategy: AIStrategy): Direction | null {
    const moves = this.getMoveOptions(board);
    if (moves.length === 0) return null;

    if (strategy === 'random') {
      return this.pickRandom(moves).direction;
    }

    if (strategy === 'greedy') {
      return this.pickGreedy(moves).direction;
    }

    return this.pickExpectimax(board, this.expectimaxConfig.depth);
  }

  private getMoveOptions(board: Board): MoveResult[] {
    const directions: Direction[] = ['up', 'down', 'left', 'right'];
    return directions
      .map((direction) => this.simulateMove(board, direction))
      .filter((result) => result.moved);
  }

  private pickGreedy(moves: MoveResult[]): MoveResult {
    let bestScore = Math.max(...moves.map((m) => m.scoreGain));
    const bestByScore = moves.filter((m) => m.scoreGain === bestScore);

    let bestEmpty = Math.max(...bestByScore.map((m) => m.emptyCount));
    const bestByEmpty = bestByScore.filter((m) => m.emptyCount === bestEmpty);

    return this.pickRandom(bestByEmpty);
  }

  private pickRandom(moves: MoveResult[]): MoveResult {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  private simulateMove(board: Board, direction: Direction): MoveResult {
    const rotated = this.rotateForDirection(board, direction);

    const newBoard: Board = [];
    let moved = false;
    let scoreGain = 0;

    for (const row of rotated) {
      const result = this.slideAndMergeRow(row);
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

    const finalBoard = this.unrotateFromDirection(newBoard, direction);
    const emptyCount = this.countEmpty(finalBoard);

    return { direction, moved: true, scoreGain, emptyCount, board: finalBoard };
  }

  private slideAndMergeRow(row: number[]): {
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

  private unrotateFromDirection(board: Board, direction: Direction): Board {
    switch (direction) {
      case 'up':
        return this.rotateClockwise(board);
      case 'down':
        return this.rotateCounterClockwise(board);
      case 'right':
        return this.rotate180(board);
      default:
        return board;
    }
  }

  private rotateClockwise(board: Board): Board {
    return board[0].map((_, i) => board.map((row) => row[i]).reverse());
  }

  private rotateCounterClockwise(board: Board): Board {
    return board[0].map((_, i) => board.map((row) => row[board.length - 1 - i]));
  }

  private rotate180(board: Board): Board {
    return board.map((row) => [...row].reverse()).reverse();
  }

  private countEmpty(board: Board): number {
    let count = 0;
    for (const row of board) {
      for (const cell of row) {
        if (cell === 0) count += 1;
      }
    }
    return count;
  }

  private pickExpectimax(board: Board, depth: number): Direction {
    const moves = this.getMoveOptions(board);
    let bestScore = -Infinity;
    let bestMoves: MoveResult[] = [];

    for (const move of moves) {
      const score = this.expectimax(move.board, depth - 1, false);
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [move];
      } else if (score === bestScore) {
        bestMoves.push(move);
      }
    }

    return this.pickRandom(bestMoves).direction;
  }

  private expectimax(board: Board, depth: number, isPlayer: boolean): number {
    if (depth <= 0) return this.evaluate(board);

    if (isPlayer) {
      const moves = this.getMoveOptions(board);
      if (moves.length === 0) return this.evaluate(board);
      let best = -Infinity;
      for (const move of moves) {
        best = Math.max(best, this.expectimax(move.board, depth - 1, false));
      }
      return best;
    }

    const emptyCells = this.getEmptyCells(board);
    if (emptyCells.length === 0) return this.evaluate(board);

    let total = 0;
    const cellProbability = 1 / emptyCells.length;
    for (const cell of emptyCells) {
      const boardWith2 = this.cloneBoard(board);
      boardWith2[cell.r][cell.c] = 2;
      total +=
        0.9 *
        cellProbability *
        this.expectimax(boardWith2, depth, true);

      const boardWith4 = this.cloneBoard(board);
      boardWith4[cell.r][cell.c] = 4;
      total +=
        0.1 *
        cellProbability *
        this.expectimax(boardWith4, depth, true);
    }

    return total;
  }

  private evaluate(board: Board): number {
    const empty = this.countEmpty(board);
    const maxTile = this.getMaxTile(board);
    const maxLog = maxTile > 0 ? Math.log2(maxTile) : 0;
    const smoothness = this.getSmoothness(board);
    const monotonicity = this.getMonotonicity(board);
    const cornerBonus = this.isMaxInCorner(board, maxTile) ? maxLog : 0;

    const weights = this.expectimaxConfig.weights;

    return (
      empty * weights.empty +
      monotonicity * weights.monotonicity +
      smoothness * weights.smoothness +
      maxLog * weights.maxTile +
      cornerBonus * weights.corner
    );
  }

  private getEmptyCells(board: Board): { r: number; c: number }[] {
    const empty: { r: number; c: number }[] = [];
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board.length; c++) {
        if (board[r][c] === 0) empty.push({ r, c });
      }
    }
    return empty;
  }

  private cloneBoard(board: Board): Board {
    return board.map((row) => [...row]);
  }

  private getMaxTile(board: Board): number {
    let max = 0;
    for (const row of board) {
      for (const cell of row) {
        if (cell > max) max = cell;
      }
    }
    return max;
  }

  private isMaxInCorner(board: Board, maxTile: number): boolean {
    const last = board.length - 1;
    return (
      board[0][0] === maxTile ||
      board[0][last] === maxTile ||
      board[last][0] === maxTile ||
      board[last][last] === maxTile
    );
  }

  private getSmoothness(board: Board): number {
    let smoothness = 0;
    const size = board.length;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (board[r][c] === 0) continue;
        const value = Math.log2(board[r][c]);

        const right = this.findNextNonZero(board, r, c + 1, 0);
        if (right !== null) {
          smoothness -= Math.abs(value - right);
        }

        const down = this.findNextNonZero(board, r + 1, c, 1);
        if (down !== null) {
          smoothness -= Math.abs(value - down);
        }
      }
    }

    return smoothness;
  }

  private findNextNonZero(
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

  private getMonotonicity(board: Board): number {
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
}
