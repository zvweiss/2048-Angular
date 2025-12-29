import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DebugService } from './debug.service';

export type Direction = 'up' | 'down' | 'left' | 'right';
export type Board = number[][];

@Injectable({
  providedIn: 'root',
})
export class GameService {
  private readonly size = 4;

  private boardSubject = new BehaviorSubject<Board>(this.createEmptyBoard());
  board$ = this.boardSubject.asObservable();

  private scoreSubject = new BehaviorSubject<number>(0);
  score$ = this.scoreSubject.asObservable();

  constructor(private debug: DebugService) {}

  startNewGame(): void {
    this.debug.log('New game started');
    const board = this.createEmptyBoard();
    this.spawnTile(board);
    this.spawnTile(board);
    this.boardSubject.next(board);
    this.scoreSubject.next(0);
  }

  move(direction: Direction): void {
    // TODO: slide + merge tiles
    // TODO: spawn new tile if moved
    // TODO: update board and score
  }

  private createEmptyBoard(): Board {
    return Array.from({ length: this.size }, () =>
      Array(this.size).fill(0)
    );
  }

  private spawnTile(board: Board): void {
    const emptyCells = [];

    for (let row = 0; row < this.size; row++) {
      for (let col = 0; col < this.size; col++) {
        if (board[row][col] === 0) emptyCells.push({ row, col });
      }
    }

    if (emptyCells.length === 0) return;

    const { row, col } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    board[row][col] = Math.random() < 0.9 ? 2 : 4;
  }
}