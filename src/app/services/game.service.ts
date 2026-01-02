import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DebugService } from './debug.service';
import { Board } from '../types/board';
import { Direction } from '../types/direction';

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly size = 4;

  private boardSubject = new BehaviorSubject<Board>(this.createEmptyBoard());
  board$ = this.boardSubject.asObservable();

  private score = 0;
  private scoreSubject = new BehaviorSubject<number>(0);
  score$ = this.scoreSubject.asObservable();

  constructor(private debug: DebugService) {
    this.debug.log('GameService initialized');
  }

  startNewGame(): void {
    this.debug.log('Starting new game...');
    const board = this.createEmptyBoard();
    this.spawnTile(board);
    this.spawnTile(board);
    this.boardSubject.next(board);
    this.scoreSubject.next(0);
  }

  move(direction: Direction): void {
    this.debug.log(`Move: ${direction.toUpperCase()}`);
    const originalBoard = this.boardSubject.value;
    this.debug.log('Original board:\n' + this.formatBoard(originalBoard));

    let rotatedBoard: Board;

    // Step 1: Rotate board based on direction
    switch (direction) {
      case 'up':
        rotatedBoard = this.rotateCounterClockwise(originalBoard);
        break;
      case 'down':
        rotatedBoard = this.rotateClockwise(originalBoard);
        break;
      case 'right':
        rotatedBoard = this.rotate180(originalBoard);
        break;
      default: // 'left'
        rotatedBoard = originalBoard.map((row) => [...row]);
        break;
    }

    this.debug.log('After rotation board:\n' + this.formatBoard(rotatedBoard));

    // Step 2: Slide and merge
    const newBoard: Board = [];
    let moved = false;

    for (const row of rotatedBoard) {
      const [compressedRow, changed] = this.slideAndMergeRow(row);
      newBoard.push(compressedRow);
      if (changed) moved = true;
    }

    this.debug.log(
      'newBoard after compression:\n' + this.formatBoard(newBoard)
    );

    // Step 3: Rotate back to original orientation
    let finalBoard: Board;
    switch (direction) {
      case 'up':
        finalBoard = this.rotateClockwise(newBoard);
        break;
      case 'down':
        finalBoard = this.rotateCounterClockwise(newBoard);
        break;
      case 'right':
        finalBoard = this.rotate180(newBoard);
        break;
      default: // 'left'
        finalBoard = newBoard;
        break;
    }

    this.debug.log(
      `Final board after move: ${direction.toUpperCase()}\n` +
        this.formatBoard(finalBoard)
    );

    // Step 4: If moved, spawn tile and update
    if (moved) {
      this.spawnTile(finalBoard);
      this.boardSubject.next(finalBoard);
    } else {
      this.debug.log('No move made.');
    }
  }

  private createEmptyBoard(): Board {
    return Array.from({ length: this.size }, () => Array(this.size).fill(0));
  }

  private spawnTile(board: Board): void {
    const empty: { r: number; c: number }[] = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (board[r][c] === 0) empty.push({ r, c });
      }
    }
    if (empty.length === 0) return;
    const { r, c } = empty[Math.floor(Math.random() * empty.length)];
    board[r][c] = Math.random() < 0.9 ? 2 : 4;
    this.debug.log(`Spawn tile at row ${r}, col ${c}, value ${board[r][c]}`);
    this.debug.log('Board after Spawn:\n' + this.formatBoard(board));
  }

  private rotateLeft(board: Board): Board {
    return board[0].map((_, i) => board.map((row) => row[i])).reverse();
  }

  private rotateRight(board: Board): Board {
    return board[0].map((_, i) => board.map((row) => row[this.size - 1 - i]));
  }

  private rotateClockwise(board: Board): Board {
    return board[0].map((_, i) => board.map((row) => row[i]).reverse());
  }

  private rotateCounterClockwise(board: Board): Board {
    return board[0].map((_, i) => board.map((row) => row[this.size - 1 - i]));
  }

  private rotate180(board: Board): Board {
    return board.map((row) => [...row].reverse()).reverse();
  }

  private slideAndMergeRow(row: number[]): [number[], boolean] {
    const filtered = row.filter((n) => n !== 0);
    const merged: number[] = [];
    let i = 0;
    let changed = false;

    while (i < filtered.length) {
      if (filtered[i] === filtered[i + 1]) {
        merged.push(filtered[i] * 2);
        this.updateScore(this.score + filtered[i] * 2);
        i += 2;
        changed = true;
      } else {
        merged.push(filtered[i]);
        i++;
      }
    }

    while (merged.length < this.size) {
      merged.push(0);
    }

    if (!changed && !merged.every((val, idx) => val === row[idx])) {
      changed = true;
    }

    return [merged, changed];
  }

  updateScore(newScore: number) {
    this.score = newScore
    this.scoreSubject.next(newScore);
    this.debug.log("Update score: " + newScore)
  }

  getCurrentScore(): number {
    return this.scoreSubject.value;
  }

  resetScore() {
    this.scoreSubject.next(0);
  }

  private formatBoard(board: Board): string {
    return board
      .map((row) =>
        row.map((cell) => (cell === 0 ? '.' : cell.toString())).join('\t')
      )
      .join('\n');
  }
}
