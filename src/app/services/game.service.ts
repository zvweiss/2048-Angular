import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DebugService } from './debug.service';
import { Board } from '../types/board';
import { Direction } from '../types/direction';

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly size = 4;
  private spawnMode: 'normal' | 'record' | 'replay' = 'normal';
  private spawnLog: { r: number; c: number; value: number }[] = [];
  private spawnIndex = 0;

  private boardSubject = new BehaviorSubject<Board>(this.createEmptyBoard());
  board$ = this.boardSubject.asObservable();

  private score = 0;
  private scoreSubject = new BehaviorSubject<number>(0);
  score$ = this.scoreSubject.asObservable();

  bestScore = 0;
  private bestScoreSubject = new BehaviorSubject<number>(this.bestScore);
  bestScore$ = this.bestScoreSubject.asObservable();

  private moveCount = 0;
  private moveCountSubject = new BehaviorSubject<number>(0);
  moveCount$ = this.moveCountSubject.asObservable();

  private undoAvailableSubject = new BehaviorSubject<boolean>(false);
  undoAvailable$ = this.undoAvailableSubject.asObservable();

  private undoEnabledSubject = new BehaviorSubject<boolean>(true);
  undoEnabled$ = this.undoEnabledSubject.asObservable();

  private winSubject = new BehaviorSubject<boolean>(false);
  win$ = this.winSubject.asObservable();

  private gameOverSubject = new BehaviorSubject<boolean>(false);
  gameOver$ = this.gameOverSubject.asObservable();

  getBoardSnapshot(): Board {
    return this.boardSubject.value.map((row) => [...row]);
  }

  getScoreSnapshot(): number {
    return this.score;
  }

  getMoveCountSnapshot(): number {
    return this.moveCount;
  }

  isGameOverActive(): boolean {
    return this.gameOverSubject.value;
  }

  isBoardEmpty(): boolean {
    return this.boardSubject.value.every((row) =>
      row.every((cell) => cell === 0)
    );
  }

  private previousState:
    | { board: Board; score: number; moveCount: number }
    | null = null;
  private winAchieved = false;
  public debugVisible = false;

  constructor(private debug: DebugService) {
    this.debug.log('GameService initialized');
    this.bestScore = this.getBestScore();
    this.debug.log('BestScore: ' + this.bestScore);
  }

  private createEmptyBoard(): Board {
    return Array.from({ length: this.size }, () => Array(this.size).fill(0));
  }

  startNewGame(): void {
    this.debug.log('Starting new game...');
    const board = this.createEmptyBoard();
    this.spawnIndex = 0;
    this.spawnTile(board);
    this.spawnTile(board);
    this.boardSubject.next(board);
    this.score = 0;
    this.scoreSubject.next(0);
    this.moveCount = 0;
    this.moveCountSubject.next(0);

    this.bestScore = this.getBestScore();
    this.bestScoreSubject.next(this.bestScore);

    this.previousState = null;
    this.updateUndoAvailability();
    this.winAchieved = false;
    this.winSubject.next(false);
    this.gameOverSubject.next(false);
  }

  setSpawnMode(mode: 'normal' | 'record' | 'replay'): void {
    this.spawnMode = mode;
  }

  getSpawnMode(): 'normal' | 'record' | 'replay' {
    return this.spawnMode;
  }

  saveSpawnLog(): void {
    localStorage.setItem('spawnLog', JSON.stringify(this.spawnLog));
  }

  loadSpawnLog(): void {
    const raw = localStorage.getItem('spawnLog');
    this.spawnLog = raw ? JSON.parse(raw) : [];
  }

  clearSpawnLog(): void {
    this.spawnLog = [];
    this.spawnIndex = 0;
    localStorage.removeItem('spawnLog');
  }

  move(direction: Direction): void {
    const originalBoard = this.boardSubject.value;
    if (this.debugVisible) {
      this.debug.log('Original board:\n' + this.formatBoard(originalBoard));
    }

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
        moveCount: this.moveCount,
      };
      this.spawnTile(finalBoard);
      this.boardSubject.next(finalBoard);
      this.moveCount += 1;
      this.moveCountSubject.next(this.moveCount);
      this.updateUndoAvailability();
      this.checkWin(finalBoard);
      this.checkGameOver(finalBoard);
    } else {
      this.debug.log('No move made.');
    }
  }

  private checkWin(board: Board) {
    if (this.winAchieved) return;
    for (const row of board) {
      for (const cell of row) {
        if (cell === 2048) {
          this.winAchieved = true;
          this.winSubject.next(true);
          return;
        }
      }
    }
  }

  private checkGameOver(board: Board) {
    if (this.gameOverSubject.value) return;
    if (this.isGameOver(board)) {
      this.gameOverSubject.next(true);
    }
  }

  private isGameOver(board: Board): boolean {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (board[r][c] === 0) return false;
        if (c < this.size - 1 && board[r][c] === board[r][c + 1]) return false;
        if (r < this.size - 1 && board[r][c] === board[r + 1][c]) return false;
      }
    }
    return true;
  }

  dismissWin(): void {
    this.winSubject.next(false);
  }

  resetGameOver(): void {
    this.debug.log('Reset Game Over')
    this.gameOverSubject.next(false);
  }

  undo(): void {
    if (!this.undoEnabledSubject.value || !this.previousState) {
      this.debug.log('No Undo is available')
       return;
    }
    this.debug.log('Board before Undo:\n' + this.formatBoard(this.previousState.board));
    this.boardSubject.next(this.previousState.board);
    this.scoreSubject.next(this.previousState.score);
    this.moveCount = this.previousState.moveCount;
    this.moveCountSubject.next(this.moveCount);
    this.previousState = null;
    this.updateUndoAvailability();
  }

  toggleUndoEnabled(): void {
    const current = this.undoEnabledSubject.value;
    this.undoEnabledSubject.next(!current);
  }

  toggleDebug(): void {
    this.debugVisible = !this.debugVisible;
  }

  restart(): void {
    this.debug.log('Restart');
    this.startNewGame();
  }

  dismissGameOver(): void {
    this.startNewGame();
    this.gameOverSubject.next(false);
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

  private spawnTile(board: Board): void {
    const empty: { r: number; c: number }[] = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (board[r][c] === 0) empty.push({ r, c });
      }
    }
    if (empty.length === 0) return;

    if (this.spawnMode === 'replay') {
      const next = this.spawnLog[this.spawnIndex++];
      if (!next) {
        this.debug.log('Replay spawn log exhausted.');
        return;
      }
      if (board[next.r][next.c] !== 0) {
        this.debug.log('Replay spawn mismatch: cell not empty.');
        return;
      }
      board[next.r][next.c] = next.value;
      return;
    }

    const { r, c } = empty[Math.floor(Math.random() * empty.length)];
    const value = Math.random() < 0.9 ? 2 : 4;
    board[r][c] = value;
    if (this.spawnMode === 'record') {
      this.spawnLog.push({ r, c, value });
    }
    this.debug.log(`Spawn tile at row ${r}, col ${c}, value ${board[r][c]}`);
    this.debug.log('Board after Spawn:\n' + this.formatBoard(board));
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

  saveBestScore(score: number): void {
    localStorage.setItem('bestScore', JSON.stringify(score));
  }

  getBestScore(): number {
    return JSON.parse(localStorage.getItem('bestScore') || '0');
  }

  private updateUndoAvailability(): void {
    this.undoAvailableSubject.next(this.previousState !== null);
  }

  private formatBoard(board: Board): string {
    return board
      .map((row) =>
        row.map((cell) => (cell === 0 ? '.' : cell.toString())).join('\t')
      )
      .join('\n');
  }
}
