import { Injectable } from '@angular/core';
import { Board } from '../types/board';
import { Direction } from '../types/direction';

export type AIStrategy = 'random' | 'greedy';

type MoveResult = {
  direction: Direction;
  moved: boolean;
  scoreGain: number;
  emptyCount: number;
};

@Injectable({ providedIn: 'root' })
export class AiService {
  getMove(board: Board, strategy: AIStrategy): Direction | null {
    const moves = this.getMoveOptions(board);
    if (moves.length === 0) return null;

    if (strategy === 'random') {
      return this.pickRandom(moves).direction;
    }

    return this.pickGreedy(moves).direction;
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
      return { direction, moved: false, scoreGain: 0, emptyCount: 0 };
    }

    const finalBoard = this.unrotateFromDirection(newBoard, direction);
    const emptyCount = this.countEmpty(finalBoard);

    return { direction, moved: true, scoreGain, emptyCount };
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
}
