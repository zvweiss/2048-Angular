// import { Injectable } from '@angular/core';
// import { BehaviorSubject } from 'rxjs';
// import { DebugService } from './debug.service';
// import { Board } from '../types/board';
// import { Direction } from '../types/direction';

// @Injectable({ providedIn: 'root' })
// export class GameService {
//   private readonly size = 4;

//   private boardSubject = new BehaviorSubject<Board>(this.createEmptyBoard());
//   board$ = this.boardSubject.asObservable();

//   private scoreSubject = new BehaviorSubject<number>(0);
//   score$ = this.scoreSubject.asObservable();

//   constructor(private debug: DebugService) {
//     this.debug.log('GameService initialized');
//     this.startNewGame();
//   }

//   startNewGame(): void {
//     this.debug.log('Starting new game...');
//     const board = this.createEmptyBoard();
//     this.spawnTile(board);
//     this.spawnTile(board);
//     this.boardSubject.next(board);
//     this.scoreSubject.next(0);
//   }

//   // move(direction: Direction): void {
//   //   if (direction !== 'down') return;

//   //   this.debug.log(`Move: ${direction}`);
//   //   const original = this.boardSubject.value.map((row) => [...row]);
//   //   this.debug.log('Original board:\n' + this.formatBoard(original));

//   //   let board = this.transpose(original);
//   //   let moved = false;

//   //   const newBoard: Board = [];

//   //   for (const col of board) {
//   //     const reversed = [...col].reverse();
//   //     const [merged, _] = this.mergeLine(reversed);
//   //     const restored = merged.reverse();
//   //     newBoard.push(restored);

//   //     if (restored.toString() !== col.toString()) {
//   //       moved = true;
//   //     }
//   //   }

//   //   if (!moved) {
//   //     this.debug.log('No tiles moved.');
//   //     return;
//   //   }

//   //   const finalBoard = this.transpose(newBoard);
//   //   this.spawnTile(finalBoard);
//   //   this.boardSubject.next(finalBoard);
//   //   this.debug.log('Final board after DOWN and SPAWN:\n' + this.formatBoard(finalBoard));
//   // }

//   move(direction: Direction): void {
//     this.debug.log(`Move: ${direction}`);
//     const originalBoard = this.boardSubject.value;
//     this.debug.log('Original board:\n' + this.formatBoard(originalBoard));

//     let rotatedBoard = this.prepareBoardForMove(originalBoard, direction);

//     const processedBoard = this.processMoveLeft(rotatedBoard);

//     const finalBoard = this.restoreBoardAfterMove(processedBoard, direction);
//     this.debug.log(
//       'Final board after ' + direction.toUpperCase() + ':\n' + this.formatBoard(finalBoard)
//     );

//     this.spawnTile(finalBoard);
//     this.boardSubject.next(finalBoard);
//   }

//   private processMoveLeft(board: Board): Board {
//     let scoreGained = 0;

//     const newBoard: Board = board.map((row) => {
//       const nonZero = row.filter((v) => v !== 0);
//       const merged: number[] = [];
//       for (let i = 0; i < nonZero.length; i++) {
//         if (nonZero[i] === nonZero[i + 1]) {
//           const mergedValue = nonZero[i] * 2;
//           merged.push(mergedValue);
//           scoreGained += mergedValue;
//           i++; // Skip the next value since it's merged
//         } else {
//           merged.push(nonZero[i]);
//         }
//       }

//       while (merged.length < this.size) {
//         merged.push(0);
//       }

//       return merged;
//     });

//     this.debug.log(`Score gained this move: ${scoreGained}`);
//     // Optionally update scoreSubject here later

//     return newBoard;
//   }

//   private formatBoard(board: Board): string {
//     return board
//       .map((row) => row.map((cell) => (cell === 0 ? '.' : cell.toString())).join('\t'))
//       .join('\n');
//   }

//   private mergeLine(line: number[]): [number[], number] {
//     const filtered = line.filter((n) => n !== 0);
//     const merged: number[] = [];
//     let score = 0;

//     for (let i = 0; i < filtered.length; i++) {
//       if (filtered[i] === filtered[i + 1]) {
//         const val = filtered[i] * 2;
//         merged.push(val);
//         score += val;
//         i++; // skip next
//       } else {
//         merged.push(filtered[i]);
//       }
//     }

//     while (merged.length < this.size) {
//       merged.push(0);
//     }

//     return [merged, score];
//   }

//   private prepareBoardForMove(board: Board, direction: Direction): Board {
//     switch (direction) {
//       case 'up':
//         return this.rotateCounterClockwise(board);
//       case 'down':
//         return this.rotateClockwise(this.rotateClockwise(board));
//       case 'right':
//         return this.rotate180(board);
//       case 'left':
//       default:
//         return board;
//     }
//   }

//   private restoreBoardAfterMove(board: Board, direction: Direction): Board {
//     switch (direction) {
//       case 'up':
//         return this.rotateClockwise(board);
//       case 'down':
//         return this.rotateClockwise(this.rotateClockwise(board));
//       case 'right':
//         return this.rotate180(board);
//       case 'left':
//       default:
//         return board;
//     }
//   }

//   private transpose(board: Board): Board {
//     return board[0].map((_, colIndex) => board.map((row) => row[colIndex]));
//   }

//   private rotateForDirection(board: Board, direction: Direction): Board {
//     switch (direction) {
//       case 'up':
//         return this.rotateCounterClockwise(board);
//       case 'down':
//         return this.rotateClockwise(this.rotateClockwise(board));
//       case 'right':
//         return this.rotate180(board);
//       case 'left':
//       default:
//         return board;
//     }
//   }

//   private rotateClockwise(board: Board): Board {
//     const size = board.length;
//     const result: Board = this.createEmptyBoard();
//     for (let r = 0; r < size; r++) {
//       for (let c = 0; c < size; c++) {
//         result[c][size - 1 - r] = board[r][c];
//       }
//     }
//     return result;
//   }

//   private rotateCounterClockwise(board: Board): Board {
//     const size = board.length;
//     const result: Board = this.createEmptyBoard();
//     for (let r = 0; r < size; r++) {
//       for (let c = 0; c < size; c++) {
//         result[size - 1 - c][r] = board[r][c];
//       }
//     }
//     return result;
//   }

//   private rotate180(board: Board): Board {
//     return board.map((row) => [...row].reverse()).reverse();
//   }

//   private restoreAfterMove(board: Board, direction: Direction): Board {
//     switch (direction) {
//       case 'up':
//         return this.rotateClockwise(board);
//       case 'down':
//         return this.rotateClockwise(this.rotateClockwise(board));
//       case 'right':
//         return this.rotate180(board);
//       case 'left':
//       default:
//         return board;
//     }
//   }

//   private createEmptyBoard(): Board {
//     return Array.from({ length: this.size }, () => Array(this.size).fill(0));
//   }

//   private spawnTile(board: Board): void {
//     const emptyCells = [];
//     for (let r = 0; r < this.size; r++) {
//       for (let c = 0; c < this.size; c++) {
//         if (board[r][c] === 0) emptyCells.push({ r, c });
//       }
//     }

//     if (emptyCells.length === 0) return;
//     const { r, c } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
//     board[r][c] = Math.random() < 0.9 ? 2 : 4;

//     this.debug.log(`Spawn tile at row ${r}, col ${c}, value ${board[r][c]}`);
//   }
// }

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Board } from '../types/board';
import { Direction } from '../types/direction';
import { DebugService } from './debug.service';

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly size = 4;

  private boardSubject = new BehaviorSubject<Board>(this.createEmptyBoard());
  board$ = this.boardSubject.asObservable();

  private scoreSubject = new BehaviorSubject<number>(0);
  score$ = this.scoreSubject.asObservable();

  constructor(private debug: DebugService) {
    this.debug.log('GameService initialized');
    this.startNewGame();
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
    const board = this.boardSubject.value;
    this.debug.log('Original board:\n' + this.formatBoard(board));

    let rotated: Board;
    switch (direction) {
      case 'up':
        rotated = this.rotateCounterClockwise(board);
        break;
      case 'down':
        rotated = this.rotateClockwise(this.rotateClockwise(board));
        break;
      case 'right':
        rotated = this.rotate180(board);
        break;
      case 'left':
      default:
        rotated = board;
    }

    const { newBoard, moved, scoreGained } = this.processMoveLeft(rotated);

    if (!moved) {
      this.debug.log('No move made.');
      return;
    }

    const finalBoard = this.reverseRotateBoard(newBoard, direction);
    this.debug.log(
      'Final board after ' + direction.toUpperCase() + ':\n' + this.formatBoard(finalBoard)
    );

    this.spawnTile(finalBoard);
    this.boardSubject.next(finalBoard);
    this.scoreSubject.next(this.scoreSubject.value + scoreGained);
  }

  private processMoveLeft(board: Board): { newBoard: Board; moved: boolean; scoreGained: number } {
    let moved = false;
    let scoreGained = 0;

    const newBoard: Board = board.map((row) => {
      const nonZero = row.filter((v) => v !== 0);
      const merged: number[] = [];
      for (let i = 0; i < nonZero.length; i++) {
        if (nonZero[i] === nonZero[i + 1]) {
          const mergedValue = nonZero[i] * 2;
          merged.push(mergedValue);
          scoreGained += mergedValue;
          i++; // Skip next
        } else {
          merged.push(nonZero[i]);
        }
      }
      while (merged.length < this.size) merged.push(0);
      if (!moved && !this.arraysEqual(merged, row)) moved = true;
      return merged;
    });

    return { newBoard, moved, scoreGained };
  }

  private arraysEqual(a: number[], b: number[]): boolean {
    return a.length === b.length && a.every((val, i) => val === b[i]);
  }

  private reverseRotateBoard(board: Board, direction: Direction): Board {
    switch (direction) {
      case 'up':
        return this.rotateClockwise(board);
      case 'down':
        return this.rotateClockwise(this.rotateClockwise(board));
      case 'right':
        return this.rotate180(board);
      case 'left':
      default:
        return board;
    }
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

  private createEmptyBoard(): Board {
    return Array.from({ length: this.size }, () => Array(this.size).fill(0));
  }

  private spawnTile(board: Board): void {
    const emptyCells = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (board[r][c] === 0) emptyCells.push({ r, c });
      }
    }
    if (emptyCells.length === 0) return;
    const { r, c } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    board[r][c] = Math.random() < 0.9 ? 2 : 4;
    this.debug.log(`Spawn tile at row ${r}, col ${c}, value ${board[r][c]}`);
  }

  private formatBoard(board: Board): string {
    return board
      .map((row) => row.map((cell) => (cell === 0 ? '.' : cell.toString())).join('\t'))
      .join('\n');
  }
}
