// game-page.component.ts
// import { Component, OnInit } from '@angular/core';
// import { GameService } from '../../services/game.service';
// import { Observable } from 'rxjs';

import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { Observable, Subject, filter, takeUntil } from 'rxjs';
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
  aiMindepth = 1;
  aiSmartness = 1;
  private aiAutoBoosted = false;
  private aiAutoBoostLocked = false;
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
  private aiGameOverHandled = false;
  private aiPausedForNav = false;
  private destroy$ = new Subject<void>();

  constructor(
    public game: GameService,
    private ai: AiService,
    private debug: DebugService,
    private runHistory: RunHistoryService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.board$ = this.game.board$;
    this.score$ = this.game.score$;
    this.bestScore$ = this.game.bestScore$;
    this.moveCount$ = this.game.moveCount$;
    this.undoAvailable$ = this.game.undoAvailable$;
    this.win$ = this.game.win$;
    this.gameOver$ = this.game.gameOver$;
    const isFreshGame = this.game.isBoardEmpty();
    const isGameOver = this.game.isGameOverActive();
    if (isFreshGame) {
      this.game.startNewGame();
      this.winFromAiRun = false;
    }
    const config = this.ai.getWrkrConfig();
    this.aiMindepth = config.mindepth;
    this.aiSmartness = config.smartness;
    if (isFreshGame) {
      this.aiAutoBoosted = false;
      this.aiAutoBoostLocked = false;
    } else {
      this.syncAutoBoostFromState();
    }
    if (!isGameOver) {
      this.startAiLoop(isFreshGame);
    }

    this.gameOver$
      .pipe(takeUntil(this.destroy$))
      .subscribe((isOver) => {
        this.gameOverActive = isOver;
        if (isOver) {
          this.gameOverDismissed = false;
        }
        if (isOver && this.aiRunning) this.stopAi('game-over');
      });

    this.router.events
      .pipe(
        takeUntil(this.destroy$),
        filter((event): event is NavigationEnd => event instanceof NavigationEnd)
      )
      .subscribe((event) => {
        this.handleRouteActivation(event.urlAfterRedirects);
      });
    this.handleRouteActivation(this.router.url);

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
    this.startAiLoop(true);
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
    if (this.gameOverActive) return;
    this.aiStepInFlight = true;
    const runToken = this.aiRunToken;
    const board = this.game.getBoardSnapshot();
    const score = this.game.getScoreSnapshot();
    const maxTile = Math.max(...board.flat());
    if (!this.aiAutoBoostLocked) {
      if (!this.aiAutoBoosted && score >= 360000) {
        this.aiAutoBoosted = true;
        this.aiMindepth = 2;
        this.aiSmartness = 5;
        this.updateAiConfig();
        const message = `AI auto-boost: mindepth=${this.aiMindepth} smartness=${this.aiSmartness}`;
        console.log(message);
        this.debug.log(message);
      } else if (
        this.aiAutoBoosted &&
        (score >= 400000 || maxTile >= 32768)
      ) {
        this.aiAutoBoosted = false;
        this.aiAutoBoostLocked = true;
        this.aiMindepth = 1;
        this.aiSmartness = 1;
        this.updateAiConfig();
        const message = `AI auto-boost reset: mindepth=${this.aiMindepth} smartness=${this.aiSmartness}`;
        console.log(message);
        this.debug.log(message);
      }
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

  private stopAi(reason: 'stop' | 'game-over' = 'stop'): void {
    if (reason === 'game-over') {
      if (this.aiGameOverHandled) return;
      this.aiGameOverHandled = true;
    }
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
      const shouldSummarize =
        reason === 'game-over' || !this.aiGameOverHandled;
      if (shouldSummarize) {
        this.updateAiSummary(reason);
      }
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

  private startAiLoop(resetBoost = true): void {
    this.aiRunning = true;
    this.aiStepInFlight = false;
    this.aiRunToken++;
    this.aiRunLogged = false;
    this.aiGameOverHandled = false;
    this.aiPausedForNav = false;
    if (resetBoost) {
      this.aiAutoBoosted = false;
      this.aiAutoBoostLocked = false;
    }
    this.aiRunLastStartedAt = Date.now();
    this.aiRunStartMoves = this.game.getMoveCountSnapshot();
    this.aiIntervalId = window.setInterval(() => this.stepAi(), this.aiSpeedMs);
  }

  private syncAutoBoostFromState(): void {
    const board = this.game.getBoardSnapshot();
    const score = this.game.getScoreSnapshot();
    const maxTile = board.length ? Math.max(...board.flat()) : 0;
    if (score >= 400000 || maxTile >= 32768) {
      this.aiAutoBoostLocked = true;
      this.aiAutoBoosted = false;
      this.aiMindepth = 1;
      this.aiSmartness = 1;
    } else if (score >= 360000) {
      this.aiAutoBoostLocked = false;
      this.aiAutoBoosted = true;
      this.aiMindepth = 2;
      this.aiSmartness = 5;
    } else {
      this.aiAutoBoostLocked = false;
      this.aiAutoBoosted = false;
      this.aiMindepth = 1;
      this.aiSmartness = 1;
    }
    this.updateAiConfig();
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
    this.aiAutoBoostLocked = false;
    this.aiGameOverHandled = false;
    this.aiPausedForNav = false;
  }

  private pauseAiForNav(): void {
    if (!this.aiRunning) return;
    this.aiRunToken++;
    this.aiStepInFlight = false;
    if (this.aiIntervalId !== null) {
      clearInterval(this.aiIntervalId);
      this.aiIntervalId = null;
    }
    if (this.aiRunLastStartedAt !== null) {
      this.aiRunAccumulatedMs += Date.now() - this.aiRunLastStartedAt;
      this.aiRunLastStartedAt = null;
    }
    this.aiRunAccumulatedMoves +=
      this.game.getMoveCountSnapshot() - this.aiRunStartMoves;
    this.aiRunning = false;
    this.aiPausedForNav = true;
  }

  private handleRouteActivation(url: string): void {
    const isRuns = url.startsWith('/runs');
    if (isRuns) {
      this.pauseAiForNav();
      return;
    }
    if (this.gameOverActive) return;
    if (this.aiRunning) return;
    if (this.aiPausedForNav) {
      this.startAiLoop(false);
      return;
    }
    const isFreshGame = this.game.isBoardEmpty();
    this.startAiLoop(isFreshGame);
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
