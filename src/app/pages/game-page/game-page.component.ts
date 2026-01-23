// game-page.component.ts
// import { Component, OnInit } from '@angular/core';
// import { GameService } from '../../services/game.service';
// import { Observable } from 'rxjs';

import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, Subject, takeUntil } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { GameService } from '../../services/game.service';
import {
  AiService,
  AIStrategy,
  ExpectimaxConfig,
} from '../../services/ai.service';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { GameBoardComponent } from '../../components/game-board/game-board.component';
import { Board } from '../../types/board';
import { DebugPanelComponent } from '../../components/debug-panel/debug-panel.component';
import { SwipeDirective } from '../../directives/swipe.directive';

@Component({
  selector: 'app-game-page',
  standalone: true,
  templateUrl: './game-page.component.html',
  styleUrls: ['./game-page.component.css'],
  imports: [
    CommonModule,
    FormsModule,
    NavbarComponent,
    GameBoardComponent,
    DebugPanelComponent,
    SwipeDirective,
  ],
})
export class GamePageComponent implements OnInit, OnDestroy {
  board$!: Observable<Board>;
  score$!: Observable<number>;
  bestScore$!: Observable<number>;
  moveCount$!: Observable<number>;
  undoAvailable$!: Observable<boolean>;
  win$!: Observable<boolean>;
  gameOver$!: Observable<boolean>;

  debugVisible = false;
  aiStrategy: AIStrategy = 'expectimax';
  aiRunning = false;
  gameOverActive = false;
  aiSpeedMs = 5;
  aiConfig: ExpectimaxConfig;
  private aiIntervalId: number | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    public game: GameService,
    private ai: AiService
  ) {
    this.aiConfig = this.ai.getExpectimaxConfig();
  }

  ngOnInit(): void {
    this.board$ = this.game.board$;
    this.score$ = this.game.score$;
    this.bestScore$ = this.game.bestScore$;
    this.moveCount$ = this.game.moveCount$;
    this.undoAvailable$ = this.game.undoAvailable$;
    this.win$ = this.game.win$;
    this.gameOver$ = this.game.gameOver$;
    this.game.startNewGame();

    this.gameOver$
      .pipe(takeUntil(this.destroy$))
      .subscribe((isOver) => {
        this.gameOverActive = isOver;
        if (isOver) this.stopAi();
      });
  }

  ngOnDestroy(): void {
    this.stopAi();
    this.destroy$.next();
    this.destroy$.complete();
  }

  move(direction: 'up' | 'down' | 'left' | 'right') {
    this.game.move(direction);
  }

  restart(): void {
    this.stopAi();
    this.game.startNewGame();
  }

  undo(): void {
    this.game.undo();
  }

  toggleDebug(): void {
    this.debugVisible = !this.debugVisible;
  }

  dismissWin(): void {
    this.game.dismissWin();
  }

  dismissGameOver(): void {
    this.stopAi();
    this.game.resetGameOver(); // Hides the popup
    this.game.startNewGame(); // Actually restarts the game
  }

  onSwipe(direction: 'up' | 'down' | 'left' | 'right') {
    this.move(direction);
  }

  toggleAiRun(): void {
    if (this.aiRunning) {
      this.stopAi();
      return;
    }
    if (this.gameOverActive) return;
    this.aiRunning = true;
    this.aiIntervalId = window.setInterval(() => this.stepAi(), this.aiSpeedMs);
  }

  stepAi(): void {
    if (this.gameOverActive) {
      this.stopAi();
      return;
    }
    const board = this.game.getBoardSnapshot();
    const nextMove = this.ai.getMove(board, this.aiStrategy);
    if (!nextMove) {
      this.stopAi();
      return;
    }
    this.game.move(nextMove);
  }

  private stopAi(): void {
    if (this.aiIntervalId !== null) {
      clearInterval(this.aiIntervalId);
      this.aiIntervalId = null;
    }
    this.aiRunning = false;
  }

  updateAiSpeed(): void {
    if (!this.aiRunning) return;
    this.stopAi();
    this.aiRunning = true;
    this.aiIntervalId = window.setInterval(() => this.stepAi(), this.aiSpeedMs);
  }

  syncExpectimaxConfig(): void {
    this.ai.updateExpectimaxConfig({
      depth: this.aiConfig.depth,
      weights: { ...this.aiConfig.weights },
    });
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    console.log('Key pressed:', event.key); // Debug line
    switch (event.key) {
      case 'ArrowUp':
        this.move('up');
        break;
      case 'ArrowDown':
        this.move('down');
        break;
      case 'ArrowLeft':
        this.move('left');
        break;
      case 'ArrowRight':
        this.move('right');
        break;
    }
  }
}
