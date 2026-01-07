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

  bestScore = 0;
  private bestScoreSubject = new BehaviorSubject<number>(this.bestScore);
  bestScore$ = this.bestScoreSubject.asObservable();

  private undoAvailableSubject = new BehaviorSubject<boolean>(false);
  undoAvailable$ = this.undoAvailableSubject.asObservable();

  private previousState: { board: Board; score: number } | null = null;
  private undoEnabledSubject = new BehaviorSubject<boolean>(true);
  undoEnabled$ = this.undoEnabledSubject.asObservable();

  private previousBoard: Board | null = null;
  private previousScore = 0;

  private winSubject = new BehaviorSubject<boolean>(false);
  win$ = this.winSubject.asObservable();

  private gameOverSubject = new BehaviorSubject<boolean>(false);
  gameOver$ = this.gameOverSubject.asObservable();

  constructor(private debug: DebugService) {
    this.debug.log('GameService initialized');
    this.bestScore = this.getBestScore();
    this.debug.log('BestScore: ' + this.bestScore);
  }

  saveBestScore(score: number): void {
    localStorage.setItem('bestScore', JSON.stringify(score));
  }

  getBestScore(): number {
    return JSON.parse(localStorage.getItem('bestScore') || '0');
  }

  startNewGame(): void {
    this.debug.log('Starting new game...');
    const board = this.createEmptyBoard();
    this.spawnTile(board);
    this.spawnTile(board);
    this.boardSubject.next(board);
    this.scoreSubject.next(0);

    this.bestScore = this.getBestScore();
    this.bestScoreSubject.next(this.bestScore);

    this.previousState = null;
    this.updateUndoAvailability();

    this.winSubject.next(false);
    this.gameOverSubject.next(false);
  }

  move(direction: Direction): void {
    this.debug.log(`Move: ${direction.toUpperCase()}`);
    const originalBoard = this.boardSubject.value;
    this.debug.log('Original board:\n' + this.formatBoard(originalBoard));

    let rotatedBoard: Board;

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
      default:
        rotatedBoard = originalBoard.map((row) => [...row]);
        break;
    }

    const newBoard: Board = [];
    let moved = false;

    for (const row of rotatedBoard) {
      const [compressedRow, changed] = this.slideAndMergeRow(row);
      newBoard.push(compressedRow);
      if (changed) moved = true;
    }

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
      default:
        finalBoard = newBoard;
        break;
    }

    if (moved) {
      this.previousState = {
        board: originalBoard.map((row) => [...row]),
        score: this.score,
      };

      this.spawnTile(finalBoard);
      this.boardSubject.next(finalBoard);
      this.updateUndoAvailability();
      this.checkWin(finalBoard);
      this.checkGameOver(finalBoard);
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

  private updateUndoAvailability(): void {
    this.undoAvailableSubject.next(this.previousState !== null);
  }

  undo(): void {
    if (!this.undoEnabledSubject.value || !this.previousState) return;

    this.boardSubject.next(this.previousState.board);
    this.scoreSubject.next(this.previousState.score);
    this.previousState = null;
    this.updateUndoAvailability();
  }

  toggleUndoEnabled(): void {
    const current = this.undoEnabledSubject.value;
    this.undoEnabledSubject.next(!current);
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
    this.score = newScore;
    this.scoreSubject.next(newScore);

    if (newScore > this.bestScore) {
      this.bestScore = newScore;
      this.saveBestScore(newScore);
      this.bestScoreSubject.next(newScore);
    }
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

  private checkWin(board: Board): void {
    for (let row of board) {
      for (let cell of row) {
        if (cell === 2048) {
          this.debug.log('Win condition met.');
          this.winSubject.next(true);
          return;
        }
      }
    }
  }

  private checkGameOver(board: Board): void {
    if (board.some(row => row.includes(0))) return;

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const current = board[r][c];
        if (
          (r < this.size - 1 && board[r + 1][c] === current) ||
          (c < this.size - 1 && board[r][c + 1] === current)
        ) {
          return;
        }
      }
    }

    this.debug.log('Game over condition met.');
    this.gameOverSubject.next(true);
  }

  dismissWin(): void {
    this.winSubject.next(false);
  }

  dismissGameOver(): void {
    this.gameOverSubject.next(false);
  }
}