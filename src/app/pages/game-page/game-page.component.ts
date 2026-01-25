// game-page.component.ts
// import { Component, OnInit } from '@angular/core';
// import { GameService } from '../../services/game.service';
// import { Observable } from 'rxjs';

import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, Subject, takeUntil } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { GameService } from '../../services/game.service';
import { AiService } from '../../services/ai.service';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { GameBoardComponent } from '../../components/game-board/game-board.component';
import { Board } from '../../types/board';
import { DebugPanelComponent } from '../../components/debug-panel/debug-panel.component';
import { SwipeDirective } from '../../directives/swipe.directive';
import { DebugService } from '../../services/debug.service';
import { RunHistoryService } from '../../services/run-history.service';

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
  aiRunning = false;
  gameOverActive = false;
  gameOverDismissed = false;
  winFromAiRun = false;
  aiSpeedMs = 5;
  aiMindepth = 3;
  aiSmartness = 6;
  private aiAutoBoosted = false;
  aiSummary = '';
  readonly debugMode = false;
  private aiIntervalId: number | null = null;
  private aiStepInFlight = false;
  private aiRunToken = 0;
  private aiRunLastStartedAt: number | null = null;
  private aiRunAccumulatedMs = 0;
  private aiRunStartMoves = 0;
  private aiRunAccumulatedMoves = 0;
  private aiRunLogged = false;
  private destroy$ = new Subject<void>();

  constructor(
    public game: GameService,
    private ai: AiService,
    private debug: DebugService,
    private runHistory: RunHistoryService
  ) {}

  ngOnInit(): void {
    this.board$ = this.game.board$;
    this.score$ = this.game.score$;
    this.bestScore$ = this.game.bestScore$;
    this.moveCount$ = this.game.moveCount$;
    this.undoAvailable$ = this.game.undoAvailable$;
    this.win$ = this.game.win$;
    this.gameOver$ = this.game.gameOver$;
    this.game.startNewGame();
    this.winFromAiRun = false;
    const config = this.ai.getWrkrConfig();
    this.aiMindepth = config.mindepth;
    this.aiSmartness = config.smartness;
    this.aiAutoBoosted = false;

    this.gameOver$
      .pipe(takeUntil(this.destroy$))
      .subscribe((isOver) => {
        this.gameOverActive = isOver;
        if (isOver) {
          this.gameOverDismissed = false;
        }
        if (isOver) this.stopAi('game-over');
      });

    this.win$
      .pipe(takeUntil(this.destroy$))
      .subscribe((won) => {
        if (!won) return;
        if (this.aiRunning) {
          this.winFromAiRun = true;
          return;
        }
        this.updateAiSummary('win');
      });
  }

  ngOnDestroy(): void {
    this.stopAi('stop');
    this.destroy$.next();
    this.destroy$.complete();
  }

  move(direction: 'up' | 'down' | 'left' | 'right') {
    this.game.move(direction);
  }

  restart(): void {
    this.stopAi('stop');
    this.resetAiRunTracking();
    this.game.startNewGame();
    this.winFromAiRun = false;
  }

  undo(): void {
    this.game.undo();
  }

  toggleDebug(): void {
    this.debugVisible = !this.debugVisible;
  }

  dismissWin(): void {
    this.game.dismissWin();
    this.winFromAiRun = false;
  }

  dismissGameOver(): void {
    this.gameOverDismissed = true;
  }

  onSwipe(direction: 'up' | 'down' | 'left' | 'right') {
    this.move(direction);
  }

  toggleAiRun(): void {
    if (this.aiRunning) {
      this.stopAi('stop');
      return;
    }
    if (this.gameOverActive) return;
    this.startAiLoop();
  }

  updateAiConfig(): void {
    this.ai.updateWrkrConfig({
      mindepth: this.aiMindepth,
      smartness: this.aiSmartness,
    });
  }

  async stepAi(): Promise<void> {
    if (this.aiStepInFlight) return;
    if (this.gameOverActive) {
      this.stopAi();
      return;
    }
    this.aiStepInFlight = true;
    const runToken = this.aiRunToken;
    const board = this.game.getBoardSnapshot();
    const emptyCount = this.countEmptyCells(board);
    const score = this.game.getScoreSnapshot();
    const maxTile = Math.max(...board.flat());
    if (!this.aiAutoBoosted && score >= 350000) {
      this.aiAutoBoosted = true;
      this.aiMindepth = Math.max(this.aiMindepth, 4);
      this.aiSmartness = Math.max(this.aiSmartness, 8);
      this.updateAiConfig();
      const message = `AI auto-boost: mindepth=${this.aiMindepth} smartness=${this.aiSmartness}`;
      console.log(message);
      this.debug.log(message);
    }
    if (score >= 320000 && emptyCount <= 5) {
      const message = `AI notice: emptyCells=${emptyCount}`;
      console.log(message);
      this.debug.log(message);
    }
    try {
      const nextMove = await this.ai.getMove(board);
      if (runToken !== this.aiRunToken) {
        return;
      }
      if (!nextMove) {
        this.stopAi();
        return;
      }
      this.game.move(nextMove);
    } finally {
      this.aiStepInFlight = false;
    }
  }

  private countEmptyCells(board: Board): number {
    let empty = 0;
    for (const row of board) {
      for (const cell of row) {
        if (cell === 0) empty += 1;
      }
    }
    return empty;
  }

  private stopAi(reason: 'stop' | 'game-over' = 'stop'): void {
    this.aiRunToken++;
    this.aiStepInFlight = false;
    if (this.aiIntervalId !== null) {
      clearInterval(this.aiIntervalId);
      this.aiIntervalId = null;
    }
    if (this.aiRunning) {
      if (this.aiRunLastStartedAt !== null) {
        this.aiRunAccumulatedMs += Date.now() - this.aiRunLastStartedAt;
        this.aiRunLastStartedAt = null;
      }
      this.aiRunAccumulatedMoves +=
        this.game.getMoveCountSnapshot() - this.aiRunStartMoves;
      this.aiRunning = false;
      this.updateAiSummary(reason);
    }
    this.aiRunning = false;

    if (reason === 'game-over') {
      // no batch advance in baseline mode
    }
  }

  updateAiSpeed(): void {
    if (!this.aiRunning) return;
    if (this.aiIntervalId !== null) {
      clearInterval(this.aiIntervalId);
    }
    this.aiIntervalId = window.setInterval(() => this.stepAi(), this.aiSpeedMs);
  }

  private updateAiSummary(reason: 'win' | 'game-over' | 'stop'): void {
    const board = this.game.getBoardSnapshot();
    const maxTile = Math.max(...board.flat());
    const score = this.game.getScoreSnapshot();
    const totalMoves = this.game.getMoveCountSnapshot();
    const runningMoves = this.aiRunning
      ? totalMoves - this.aiRunStartMoves
      : 0;
    const movesSinceStart = this.aiRunAccumulatedMoves + runningMoves;
    const runningMs =
      this.aiRunning && this.aiRunLastStartedAt !== null
        ? Date.now() - this.aiRunLastStartedAt
        : 0;
    const durationMs = this.aiRunAccumulatedMs + runningMs;
    const durationLine = durationMs > 0 ? ` durationMs=${durationMs}` : '';
    if (movesSinceStart <= 0) {
      this.aiSummary = '';
      return;
    }
    const message =
      `AI summary (${reason}): maxTile=${maxTile}` +
      ` score=${score}` +
      ` moves=${movesSinceStart}` +
      ` totalMoves=${totalMoves}` +
      durationLine;
    this.aiSummary = message;
    console.log(message);
    this.debug.log(message);

    if (reason === 'game-over' && !this.aiRunLogged) {
      this.aiRunLogged = true;
      this.runHistory.addRun({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        reason,
        maxTile,
        score,
        moves: movesSinceStart,
        totalMoves,
        durationMs,
      });
    }
  }

  private startAiLoop(): void {
    this.aiRunning = true;
    this.aiStepInFlight = false;
    this.aiRunToken++;
    this.aiRunLogged = false;
    this.aiAutoBoosted = false;
    this.aiRunLastStartedAt = Date.now();
    this.aiRunStartMoves = this.game.getMoveCountSnapshot();
    this.aiIntervalId = window.setInterval(() => this.stepAi(), this.aiSpeedMs);
  }

  private resetAiRunTracking(): void {
    this.aiSummary = '';
    this.aiRunLastStartedAt = null;
    this.aiRunAccumulatedMs = 0;
    this.aiRunStartMoves = 0;
    this.aiRunAccumulatedMoves = 0;
    this.aiStepInFlight = false;
    this.aiRunToken++;
    this.gameOverDismissed = false;
    this.winFromAiRun = false;
    this.aiRunLogged = false;
    this.aiAutoBoosted = false;
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
