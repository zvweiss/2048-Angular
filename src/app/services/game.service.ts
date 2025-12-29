import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DebugService } from './debug.service';

export type Direction = 'up' | 'down' | 'left' | 'right';
export type Board = number[][];

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly size = 4;

  private boardSubject = new BehaviorSubject<Board>(this.createEmptyBoard());
  board$ = this.boardSubject.asObservable();

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
    this.debug.log(`Move: ${direction}`);
    // Game logic to be implemented
  }

  private createEmptyBoard(): Board {
    return Array.from({ length: this.size }, () => Array(this.size).fill(0));
  }

  private spawnTile(board: Board): void {
    this.debug.log("Spawn a Tile if board is not full")
    const emptyCells = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (board[r][c] === 0) emptyCells.push({ r, c });
      }
    }

    if (emptyCells.length === 0) return;
    const { r, c } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    board[r][c] = Math.random() < 0.9 ? 2 : 4;
  }
}