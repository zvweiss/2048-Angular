// game-page.component.ts
// import { Component, OnInit } from '@angular/core';
// import { GameService } from '../../services/game.service';
// import { Observable } from 'rxjs';

import {
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { Observable, Subject, filter, takeUntil } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { GameService } from '../../services/game.service';
import { AiEngine, AiService } from '../../services/ai.service';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { GameBoardComponent } from '../../components/game-board/game-board.component';
import { Board } from '../../types/board';
import { Direction } from '../../types/direction';
import { DebugPanelComponent } from '../../components/debug-panel/debug-panel.component';
import { SwipeDirective } from '../../directives/swipe.directive';
import { DebugService } from '../../services/debug.service';
import { RunHistoryService } from '../../services/run-history.service';
import {
  applyMove,
  boardToRows,
  computeBestMoveBitboardCpp,
  rowsToGrid,
  computeHeuristicBreakdown,
} from '../../services/bitboard-core';

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
  aiMindepth = 2;
  aiDepthCap = 4;
  aiTimeBudgetMs = 250;
  showDebugControls = true;
  aiBoostStatus = '';
  private aiBoostStatusTimeout: number | null = null;
  replayParityStatus = '';
  replaySavedMovesStatus = '';
  replayRunMovesStatus = '';
  runIntegrityStatus = '';
  showRunIntegrityModal = false;
  runIntegrityIssueDetected = false;
  spawnStatus = '';
  tiePauseStatus = '';
  tiePaused = false;
  private lastTiePauseMove: number | null = null;
  private lastTiePauseHash: string | null = null;
  private skipTiePauseOnce = false;
  private resumeFromTiePause = false;
  private lastSpawnMode: 'normal' | 'record' | 'replay' = 'normal';
  private recordingSaved = false;
  savedSpawnsAvailable = false;
  aiFatalBoostCount = 0;
  aiEngine: AiEngine = 'ts';
  spawnMode: 'normal' | 'record' | 'replay' = 'normal';
  batchTotal = 1;
  batchRemaining = 1;
  private aiAutoBoosted = false;
  private aiAutoBoostLocked = false;
  private aiAutoBoostManualOverride = false;
  private autoBoostStage = 0;
  private useTestBoostThresholds = false;
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
  private recentBoardHashes: string[] = [];
  private boardHashCounts = new Map<string, number>();
  hintDirection: Direction | null = null;
  hintLoading = false;
  private hintToken = 0;
  private compareEngines = false;
  private pauseOnDivergence = false;
  aiCompareEnabled = false;
  aiComparePause = false;
  aiComparePauseOnTie = false;
  aiDebugEnabled = false;
  parityMode = false;
  @ViewChild('aiSettings') aiSettings?: ElementRef<HTMLDetailsElement>;

  constructor(
    public game: GameService,
    private ai: AiService,
    private debug: DebugService,
    private runHistory: RunHistoryService,
    private router: Router
  ) {}

  ngOnInit(): void {
    (window as any).setAiDebug = (enabled: boolean) => {
      this.aiDebugEnabled = Boolean(enabled);
      this.ai.setDebugAi(this.aiDebugEnabled);
      return `AI debug ${this.aiDebugEnabled ? 'enabled' : 'disabled'}`;
    };
    (window as any).setAiCompare = (enabled: boolean, pause = false) => {
      this.aiCompareEnabled = Boolean(enabled);
      this.aiComparePause = Boolean(pause);
    this.aiComparePauseOnTie = false;
      this.parityMode = this.aiCompareEnabled;
      this.updateParityMode();
      this.compareEngines = this.aiCompareEnabled;
      this.pauseOnDivergence = this.aiComparePause;
      return `AI compare ${this.compareEngines ? 'enabled' : 'disabled'}${
        this.compareEngines
          ? this.pauseOnDivergence
            ? ' (pause on divergence)'
            : ' (continue running)'
          : ''
      }`;
    };
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
      this.clearDivergences();
      this.resetAiRunTrackingForNewGame();
      this.game.startNewGame();
      this.winFromAiRun = false;
    }
    const config = this.ai.getWrkrConfig();
    this.aiMindepth = config.mindepth;
    const tsConfig = this.ai.getTsConfig();
    this.aiDepthCap = tsConfig.depthCap;
    this.aiTimeBudgetMs = tsConfig.timeBudgetMs;
    this.aiEngine = this.ai.getEngine();
    this.aiDebugEnabled = false;
    this.aiCompareEnabled = false;
    this.aiComparePause = false;
    this.spawnMode = this.game.getSpawnMode();
    this.clearDivergences();
    if (isFreshGame) {
      this.applyDefaultAiConfig();
      this.aiAutoBoosted = false;
      this.aiAutoBoostLocked = false;
      this.aiAutoBoostManualOverride = false;
      this.aiFatalBoostCount = 0;
      this.autoBoostStage = 0;
      this.replayParityStatus = '';
      this.replaySavedMovesStatus = '';
      this.replayRunMovesStatus = '';
      this.spawnStatus = '';
      this.runIntegrityStatus = '';
      this.showRunIntegrityModal = false;
      this.runIntegrityIssueDetected = false;
      this.tiePauseStatus = '';
      this.tiePaused = false;
      this.lastTiePauseMove = null;
      this.lastTiePauseHash = null;
      this.skipTiePauseOnce = false;
      this.resumeFromTiePause = false;
      this.lastSpawnMode = this.spawnMode;
      this.recordingSaved = false;
      this.savedSpawnsAvailable = this.hasRecordedSpawns;
      setTimeout(() => {
        if (this.aiSettings?.nativeElement) {
          this.aiSettings.nativeElement.open = true;
        }
      }, 0);
    } else {
      this.syncAutoBoostFromState();
    }
    this.aiRunning = false;

    this.gameOver$
      .pipe(takeUntil(this.destroy$))
      .subscribe((isOver) => {
        this.gameOverActive = isOver;
        if (isOver) {
          this.gameOverDismissed = false;
        }
        if (isOver && this.aiRunning) {
          if (this.batchRemaining > 1) {
            this.stopAi('game-over');
            if (this.runIntegrityIssueDetected) {
              this.batchRemaining = this.batchTotal;
              return;
            }
            this.batchRemaining -= 1;
            this.clearDivergences();
            this.resetAiRunTrackingForNewGame(true);
            this.game.startNewGame();
            this.winFromAiRun = false;
            this.gameOverDismissed = true;
            this.applyDefaultAiConfig();
            this.startAiLoop(true, false);
            return;
          }
          this.stopAi('game-over');
          this.batchRemaining = this.batchTotal;
        }
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

    this.score$
      .pipe(takeUntil(this.destroy$))
      .subscribe((score) => {
        if (!this.aiRunning) return;
        if (this.aiEngine !== 'ts' && this.aiEngine !== 'wasm') return;
        this.runHistory.updateBestScore(this.aiEngine, score);
      });
  }

  ngOnDestroy(): void {
    this.stopAi('stop');
    this.destroy$.next();
    this.destroy$.complete();
  }

  move(direction: 'up' | 'down' | 'left' | 'right') {
    this.clearHint();
    this.game.move(direction);
  }

  restart(): void {
    if (this.spawnMode === 'record' && this.canSaveSpawns) {
      const shouldExit = window.confirm(
        'Exit recording without saving?'
      );
      if (!shouldExit) return;
    }
    this.stopAi('stop');
    this.resetAiRunTracking();
    this.clearDivergences();
    this.game.startNewGame();
    this.winFromAiRun = false;
    this.applyDefaultAiConfig();
    this.autoBoostStage = 0;
    this.clearHint();
    this.spawnMode = 'normal';
    this.updateSpawnMode();
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
    });
  }

  updateTsConfig(): void {
    this.updateTsConfigInternal();
  }

  updateDepthCap(): void {
    this.updateTsConfigInternal(true);
  }

  private updateTsConfigInternal(manualOverride = false): void {
    this.aiDepthCap = Math.max(3, Math.min(8, this.aiDepthCap));
    this.aiTimeBudgetMs = Math.max(50, Math.min(1500, this.aiTimeBudgetMs));
    this.ai.updateTsConfig({
      depthCap: this.aiDepthCap,
      timeBudgetMs: this.aiTimeBudgetMs,
    });
    this.runHistory.addConfigEntry({
      timestamp: Date.now(),
      depthCap: this.aiDepthCap,
      timeBudgetMs: this.aiTimeBudgetMs,
      engine: this.aiEngine,
    });
    if (manualOverride) {
      this.aiAutoBoostManualOverride = true;
    }
  }

  updateAiEngine(): void {
    this.ai.setEngine(this.aiEngine);
    if (this.spawnMode === 'record' && this.aiEngine !== 'wasm') {
      this.spawnMode = 'normal';
      this.updateSpawnMode();
    }
    if (this.aiEngine === 'wasm') {
      this.aiCompareEnabled = false;
      this.aiComparePause = false;
      this.aiComparePauseOnTie = false;
      this.compareEngines = false;
      this.pauseOnDivergence = this.aiComparePause;
      this.parityMode = false;
      this.updateParityMode();
    }
  }

  get autoBoostPaused(): boolean {
    return this.aiAutoBoostManualOverride;
  }

  resumeAutoBoost(): void {
    if (!this.aiAutoBoostManualOverride) return;
    this.aiAutoBoostManualOverride = false;
    const board = this.game.getBoardSnapshot();
    const maxTile = board.length ? Math.max(...board.flat()) : 0;
    this.applyAutoBoostFromTiles(board, maxTile, true);
    this.aiBoostStatus = 'Auto-boost resumed';
    this.scheduleBoostStatusClear();
  }

  toggleDebugControls(): void {
    this.showDebugControls = !this.showDebugControls;
  }

  updateAiCompare(): void {
    this.compareEngines = this.aiCompareEnabled;
    this.pauseOnDivergence = this.aiComparePause;
    this.parityMode = this.compareEngines;
    this.updateParityMode();
    if (this.compareEngines) {
      this.clearDivergences();
    }
  }

  updateAiDebug(): void {
    this.ai.setDebugAi(this.aiDebugEnabled);
  }

  updateParityMode(): void {
    if (this.parityMode) {
      this.aiAutoBoostManualOverride = false;
      this.aiBoostStatus = '';
    }
  }

  clearDivergences(): void {
    localStorage.removeItem('aiDivergences');
    localStorage.removeItem('aiDivergence');
  }

  dumpDivergences(): void {
    const raw = localStorage.getItem('aiDivergences');
    if (!raw) {
      console.log('No AI divergences found.');
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      console.log('AI divergences:', parsed);
    } finally {
      this.clearDivergences();
      console.log('AI divergences cleared.');
    }
  }

  updateSpawnMode(): void {
    const previousMode = this.lastSpawnMode;
    if (
      previousMode === 'record' &&
      this.spawnMode !== 'record' &&
      !this.recordingSaved &&
      this.canSaveSpawns
    ) {
      window.confirm('Exit recording without saving?');
      this.spawnMode = 'normal';
    }
    if (this.spawnMode === 'record' && this.aiEngine !== 'wasm') {
      this.spawnMode = 'normal';
    }
    this.game.setSpawnMode(this.spawnMode);
    if (this.spawnMode === 'replay') {
      this.stopAi('stop');
      this.game.loadSpawnLog();
      if (
        this.game.getSpawnLogLength() === 0 ||
        this.game.getMoveLogLength() === 0
      ) {
        this.replayParityStatus = 'Replay data missing. Save spawns first.';
        this.replaySavedMovesStatus = '';
        this.replayRunMovesStatus = '';
        this.spawnStatus = '';
        this.spawnMode = 'normal';
        this.game.setSpawnMode(this.spawnMode);
        this.savedSpawnsAvailable = false;
        return;
      }
      this.replayParityStatus = '';
      this.replaySavedMovesStatus = `Saved moves: ${this.game.getMoveLogLength()}`;
      this.replayRunMovesStatus = '';
      this.spawnStatus = 'Replay ready.';
      this.tiePauseStatus = '';
      this.tiePaused = false;
      this.lastTiePauseMove = null;
      this.lastTiePauseHash = null;
      this.skipTiePauseOnce = false;
      this.resumeFromTiePause = false;
      this.recordingSaved = true;
      this.savedSpawnsAvailable = true;
      if (this.aiEngine === 'ts' && !this.aiCompareEnabled) {
        this.aiCompareEnabled = true;
        this.aiComparePause = true;
        this.aiComparePauseOnTie = false;
        this.updateAiCompare();
      }
      this.clearDivergences();
      this.resetAiRunTrackingForNewGame();
      this.game.startNewGame();
    } else if (this.spawnMode === 'record') {
      this.stopAi('stop');
      this.game.clearSpawnLog();
      this.replayParityStatus = 'Recording new game.';
      this.replaySavedMovesStatus = '';
      this.replayRunMovesStatus = '';
      this.spawnStatus = 'Recording spawns.';
      this.tiePauseStatus = '';
      this.tiePaused = false;
      this.lastTiePauseMove = null;
      this.lastTiePauseHash = null;
      this.skipTiePauseOnce = false;
      this.resumeFromTiePause = false;
      this.recordingSaved = false;
      this.savedSpawnsAvailable = false;
      this.clearDivergences();
      this.resetAiRunTrackingForNewGame();
      this.game.startNewGame();
    } else {
      this.replayParityStatus = '';
      this.replaySavedMovesStatus = '';
      this.replayRunMovesStatus = '';
      this.spawnStatus = '';
      this.runIntegrityStatus = '';
      this.showRunIntegrityModal = false;
      this.runIntegrityIssueDetected = false;
    }
    this.lastSpawnMode = this.spawnMode;
  }

  get spawnModeLocked(): boolean {
    return false;
  }

  get hasRecordedSpawns(): boolean {
    const savedSpawns = localStorage.getItem('spawnLog');
    const savedMoves = localStorage.getItem('moveLog');
    if (savedSpawns && savedMoves) {
      try {
        const spawns = JSON.parse(savedSpawns);
        const moves = JSON.parse(savedMoves);
        return (
          Array.isArray(spawns) &&
          spawns.length > 0 &&
          Array.isArray(moves) &&
          moves.length > 0
        );
      } catch {
        return false;
      }
    }
    return false;
  }

  get canSaveSpawns(): boolean {
    return this.spawnMode === 'record' && this.game.getMoveLogLength() > 0;
  }

  get canClearSpawns(): boolean {
    const inProgress =
      this.aiRunning ||
      (!this.gameOverActive && this.game.getMoveCountSnapshot() > 0);
    return this.savedSpawnsAvailable && !inProgress;
  }

  saveSpawnLog(): void {
    if (this.game.getSpawnLogLength() < 2 || this.game.getMoveLogLength() === 0) {
      this.replayParityStatus =
        'No recording found. Switch to Record mode and start a new game.';
      this.spawnStatus = '';
      return;
    }
    this.game.saveSpawnLog();
    this.spawnStatus = `Recorded ${this.game.getMoveLogLength()} moves.`;
    this.tiePauseStatus = '';
    this.tiePaused = false;
    this.lastTiePauseMove = null;
    this.lastTiePauseHash = null;
    this.skipTiePauseOnce = false;
    this.resumeFromTiePause = false;
    this.recordingSaved = true;
    this.savedSpawnsAvailable = true;
    this.stopAi('stop');
  }

  clearSpawnLog(): void {
    this.game.clearSpawnLog();
    this.spawnStatus = 'Recording cleared.';
    this.replayParityStatus = '';
    this.replaySavedMovesStatus = '';
    this.replayRunMovesStatus = '';
    this.tiePauseStatus = '';
    this.tiePaused = false;
    this.lastTiePauseMove = null;
    this.lastTiePauseHash = null;
    this.skipTiePauseOnce = false;
    this.resumeFromTiePause = false;
    this.recordingSaved = false;
    this.savedSpawnsAvailable = false;
    this.spawnMode = 'normal';
    this.updateSpawnMode();
  }


  updateBatchTotal(): void {
    if (this.batchRemaining < 1) {
      this.batchRemaining = 1;
    }
    this.batchTotal = this.batchRemaining;
  }

  async stepAi(): Promise<void> {
    if (this.aiStepInFlight) return;
    if (this.gameOverActive) return;
    this.aiStepInFlight = true;
    const runToken = this.aiRunToken;
    if (this.spawnMode === 'replay') {
      try {
        const board = this.game.getBoardSnapshot();
        const skipTieChecks = this.skipTiePauseOnce || this.resumeFromTiePause;
        if (this.skipTiePauseOnce) {
          this.skipTiePauseOnce = false;
        }
        if (this.resumeFromTiePause) {
          this.resumeFromTiePause = false;
        }
        if (!skipTieChecks && this.aiEngine === 'wasm' && this.aiComparePauseOnTie) {
          const wasmScores = await this.ai.getWasmScores(board);
          const wasmBest = this.getBestMoveSet(wasmScores);
          const moveIndex = this.game.getMoveCountSnapshot();
          const tieHash = board.flat().join(',');
          if (
            wasmBest.size > 1 &&
            (this.lastTiePauseMove !== moveIndex ||
              this.lastTiePauseHash !== tieHash)
          ) {
            const status =
              `Tie at move ${moveIndex}: ` +
              `engine=wasm best=${[...wasmBest].join(', ')} | selected=pending`;
            this.tiePauseStatus = status;
            console.log(status);
            this.lastTiePauseMove = moveIndex;
            this.lastTiePauseHash = tieHash;
            this.tiePaused = true;
            this.resumeFromTiePause = true;
            this.stopAi('stop');
            return;
          }
        }
        const replayMove = this.game.getReplayMove();
        if (!replayMove) {
          this.stopAi('stop');
          return;
        }
        if (this.compareEngines) {
          const tsDepthLimit = this.getTsCompareDepthLimit();
          const tsScores = this.ai.getTsScores(board, tsDepthLimit);
          const tsMove = this.getBestMoveFromScores(tsScores);
          const bestMoves = this.getCompareBestMoveSet(tsScores);
          const replayTie = bestMoves.size > 1 && bestMoves.has(replayMove);
          if (!skipTieChecks && replayTie && this.aiComparePauseOnTie && tsMove) {
            const moveIndex = this.game.getMoveCountSnapshot();
            const tsBest = [...bestMoves];
            const status =
              `Tie at move ${moveIndex}: ` +
              `engine=${this.aiEngine} ` +
              `best=${tsBest.join(', ')} | selected=${replayMove}`;
            const tieHash = board.flat().join(',');
            if (
              this.lastTiePauseMove !== moveIndex ||
              this.lastTiePauseHash !== tieHash
            ) {
              this.tiePauseStatus = status;
              console.log(status);
              this.lastTiePauseMove = moveIndex;
              this.lastTiePauseHash = tieHash;
              this.tiePaused = true;
              this.resumeFromTiePause = true;
              this.stopAi('stop');
              return;
            }
          }
          if (!replayTie && tsMove && tsMove !== replayMove) {
            const wasmScores = await this.ai.getWasmScores(board);
            this.replayParityStatus = `Replay parity mismatch at move ${this.game.getMoveCountSnapshot()}`;
            if (this.aiDebugEnabled) {
              console.log(
                'Replay parity mismatch:\n' +
                  board.map((row) => row.map((cell) => (cell ? cell : '.')).join('\t')).join('\n')
              );
              console.log(`Replay move: ${replayMove} | TS move: ${tsMove}`);
              console.log(
                'Replay mismatch board rows:',
                board.map((row) => row.slice())
              );
              console.log('Replay mismatch row integers:', boardToRows(board));
              console.log('TS heuristic breakdown:', computeHeuristicBreakdown(board));
              const rows = boardToRows(board);
              const directions: Direction[] = ['up', 'down', 'left', 'right'];
              const perMove: Record<string, ReturnType<typeof computeHeuristicBreakdown>> =
                {};
              for (const dir of directions) {
                const move = applyMove(rows, dir);
                if (!move.moved) continue;
                const nextBoard = rowsToGrid(move.rows);
                perMove[dir] = computeHeuristicBreakdown(nextBoard);
              }
              console.log('TS heuristic breakdowns (post-move):', perMove);
            }
            const snapshot = {
              move: this.game.getMoveCountSnapshot(),
              board,
              tsScores,
              wasmScores,
              tsMove,
              wasmMove: replayMove,
              tie: replayTie,
            };
            const existing = localStorage.getItem('aiDivergences');
            const list = existing ? JSON.parse(existing) : [];
            list.push(snapshot);
            localStorage.setItem('aiDivergences', JSON.stringify(list));
            localStorage.setItem('aiDivergence', JSON.stringify(snapshot));
            if (this.aiDebugEnabled) {
              console.log('Saved divergence snapshot to localStorage (aiDivergences).');
            }
            if (this.pauseOnDivergence && !skipTieChecks) {
              this.stopAi('stop');
              return;
            }
        }
        }
        this.game.move(replayMove);
        if (this.aiEngine === 'ts' || this.aiEngine === 'wasm') {
          this.runHistory.updateBestScore(
            this.aiEngine,
            this.game.getScoreSnapshot()
          );
        }
        this.clearHint();
      } finally {
        this.aiStepInFlight = false;
      }
      return;
    }
    const board = this.game.getBoardSnapshot();
    const cycleDetected = this.parityMode
      ? false
      : this.trackBoardHash(this.getBoardHash(board));
    const maxTile = Math.max(...board.flat());
    if (!this.aiAutoBoostLocked && this.aiEngine === 'ts' && !this.parityMode) {
      this.applyAutoBoostFromTiles(board, maxTile);
    }
    try {
      let nextMove: Direction | null = null;
      if (this.compareEngines) {
        const tsDepthLimit = this.getTsCompareDepthLimit();
        const tsScores = this.ai.getTsScores(board, tsDepthLimit);
        const tsFullBest = this.getBestMoveFromScores(tsScores);
        const wasmMove = await this.ai.getMoveForEngine('wasm', board);
        const primary = this.aiEngine === 'ts' ? tsFullBest : wasmMove;
        const other = this.aiEngine === 'ts' ? wasmMove : tsFullBest;
        nextMove = primary;
        if (wasmMove) {
          nextMove = wasmMove;
        }
        if (primary !== other) {
          const wasmScores = await this.ai.getWasmScores(board);
          if (this.aiDebugEnabled) {
            if (tsScores.length) {
              console.log(
                'TS scores:',
                tsScores
                  .map((entry) => `${entry.direction}:${entry.score.toFixed(2)}`)
                  .join(' | ')
              );
              if (tsFullBest) {
                console.log(`TS best (full): ${tsFullBest}`);
              }
            }
            if (wasmScores.length) {
              console.log(
                'WASM scores:',
                wasmScores
                  .map((entry) => `${entry.direction}:${entry.score.toFixed(2)}`)
                  .join(' | ')
              );
            }
          }
          // WASM debug hooks removed after parity check.
          const rows = boardToRows(board);
          const validMoves = (['up', 'down', 'left', 'right'] as Direction[])
            .filter((dir) => applyMove(rows, dir).moved)
            .join(', ');
          if (this.aiDebugEnabled) {
            console.log(
              'AI divergence board:\n' +
                board.map((row) => row.map((cell) => (cell ? cell : '.')).join('\t')).join('\n')
            );
            console.log(`Valid moves: ${validMoves || 'none'}`);
          }
          const isTie = this.isEngineTie(primary, other, tsScores, wasmScores);
          if (this.aiEngine === 'ts' && isTie && other) {
            nextMove = other;
          }
          if (this.aiDebugEnabled) {
            console.log(
              `AI divergence at move ${this.game.getMoveCountSnapshot()}: ` +
                `${this.aiEngine}=${primary ?? 'null'} ` +
                `${this.aiEngine === 'ts' ? 'wasm' : 'ts'}=${other ?? 'null'}` +
                (isTie ? ' (tie)' : '')
            );
          }
          const snapshot = {
            move: this.game.getMoveCountSnapshot(),
            board,
            tsScores,
            wasmScores,
            tsMove: primary,
            wasmMove: other,
            tie: isTie,
          };
          const existing = localStorage.getItem('aiDivergences');
          const list = existing ? JSON.parse(existing) : [];
          list.push(snapshot);
          localStorage.setItem('aiDivergences', JSON.stringify(list));
          localStorage.setItem('aiDivergence', JSON.stringify(snapshot));
          if (this.aiDebugEnabled) {
            console.log('Saved divergence snapshot to localStorage (aiDivergences).');
          }
          const moveIndex = this.game.getMoveCountSnapshot();
          if (isTie && this.aiComparePauseOnTie && primary) {
                const tsBest = [...this.getCompareBestMoveSet(tsScores)];
                const status = this.compareEngines
                  ? `Tie at move ${moveIndex}: ` +
                  `TS best=${tsBest.join(', ')} | WASM best=${[
                    ...this.getCompareBestMoveSet(wasmScores),
                  ].join(', ')} | selected=${primary}`
                  : `Tie at move ${moveIndex}: ` +
                  `engine=${this.aiEngine} ` +
                  `best=${tsBest.join(', ')} | selected=${primary}`;
            const tieHash = board.flat().join(',');
            if (
              this.skipTiePauseOnce &&
              this.lastTiePauseMove === moveIndex &&
              this.lastTiePauseHash === tieHash
            ) {
              this.skipTiePauseOnce = false;
            } else if (
              this.lastTiePauseMove !== moveIndex ||
              this.lastTiePauseHash !== tieHash
            ) {
              this.tiePauseStatus = status;
              console.log(status);
              this.lastTiePauseMove = moveIndex;
              this.lastTiePauseHash = tieHash;
              this.tiePaused = true;
              this.stopAi('stop');
              return;
            }
          }
          if (this.pauseOnDivergence && !isTie) {
            this.stopAi('stop');
          }
        }
      } else {
        if (this.aiEngine === 'wasm' && this.aiComparePauseOnTie) {
          const wasmScores = await this.ai.getWasmScores(board);
          const wasmBest = this.getCompareBestMoveSet(wasmScores);
          const moveIndex = this.game.getMoveCountSnapshot();
          const tieHash = board.flat().join(',');
          if (
            wasmBest.size > 1 &&
            (this.lastTiePauseMove !== moveIndex ||
              this.lastTiePauseHash !== tieHash)
          ) {
            const status =
              `Tie at move ${moveIndex}: ` +
              `engine=wasm best=${[...wasmBest].join(', ')} | selected=pending`;
            this.tiePauseStatus = status;
            console.log(status);
            this.lastTiePauseMove = moveIndex;
            this.lastTiePauseHash = tieHash;
            this.tiePaused = true;
            this.resumeFromTiePause = true;
            this.stopAi('stop');
            return;
          }
        }
        nextMove = await this.ai.getMove(board);
      }
      if (this.aiEngine === 'ts' && nextMove && cycleDetected) {
        const tsScores = this.ai.getTsScores(board, this.getTsDepthLimit(board));
        const bestMoves = [...this.getBestMoveSet(tsScores)];
        const alternate = bestMoves.find((move) => move !== nextMove);
        if (alternate) {
          nextMove = alternate;
        } else {
          const fallback = (['up', 'down', 'left', 'right'] as Direction[])
            .find(
              (move) => move !== nextMove && applyMove(boardToRows(board), move).moved
            );
          if (fallback) nextMove = fallback;
        }
      }
      if (this.aiEngine === 'ts' && nextMove && !this.parityMode) {
        const boostedMove = this.tryBoostedMove(board, nextMove);
        if (boostedMove) {
          nextMove = boostedMove;
        }
      }
      if (runToken !== this.aiRunToken) {
        return;
      }
      if (!nextMove) {
        this.stopAi();
        return;
      }
      this.game.move(nextMove);
      if (this.aiEngine === 'ts' || this.aiEngine === 'wasm') {
        this.runHistory.updateBestScore(
          this.aiEngine,
          this.game.getScoreSnapshot()
        );
      }
      this.clearHint();
    } finally {
      this.aiStepInFlight = false;
    }
  }

  showHint(): void {
    if (this.aiRunning || this.gameOverActive || this.hintLoading) return;
    if (this.hintDirection) {
      this.game.move(this.hintDirection);
      this.clearHint();
      return;
    }
    const token = ++this.hintToken;
    this.hintLoading = true;
    const board = this.game.getBoardSnapshot();
    this.ai
      .getMove(board)
      .then((nextMove) => {
        if (token !== this.hintToken) return;
        this.hintDirection = nextMove;
      })
      .finally(() => {
        if (token !== this.hintToken) return;
        this.hintLoading = false;
      });
  }

  hintArrow(direction: Direction): string {
    switch (direction) {
      case 'up':
        return '⬆️';
      case 'down':
        return '⬇️';
      case 'left':
        return '⬅️';
      case 'right':
        return '➡️';
    }
  }

  hintIcon(): string {
    if (this.hintLoading) return '⏳';
    if (this.hintDirection) return this.hintArrow(this.hintDirection);
    return '💡';
  }

  private clearHint(): void {
    this.hintToken++;
    this.hintDirection = null;
    this.hintLoading = false;
  }

  resumeAfterTiePause(): void {
    this.tiePauseStatus = '';
    this.tiePaused = false;
    if (!this.aiRunning && !this.gameOverActive) {
      this.toggleAiRun();
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
    if (reason === 'stop') {
      this.batchRemaining = this.batchTotal;
    }

    if (reason === 'game-over') {
      const wasReplay = this.spawnMode === 'replay';
      this.spawnMode = 'normal';
      this.updateSpawnMode();
      if (wasReplay) {
        this.replayParityStatus = 'Replay completed.';
        this.replayRunMovesStatus = `Replay moves: ${this.game.getMoveCountSnapshot()}`;
      }
    }

    if (reason === 'game-over') {
      // no batch advance in baseline mode
    }
  }

  private isEngineTie(
    tsMove: Direction | null,
    wasmMove: Direction | null,
    tsScores: { direction: Direction; score: number }[],
    wasmScores: { direction: Direction; score: number }[]
  ): boolean {
    if (!tsMove || !wasmMove) return false;
    const tsBest = this.getCompareBestMoveSet(tsScores);
    const wasmBest = this.getCompareBestMoveSet(wasmScores);
    return tsBest.has(wasmMove) || wasmBest.has(tsMove);
  }

  private getBestMoveFromScores(
    scores: { direction: Direction; score: number }[]
  ): Direction | null {
    if (!scores.length) return null;
    let bestScore = -Infinity;
    for (const entry of scores) {
      if (entry.score > bestScore) bestScore = entry.score;
    }
    const epsilon = Math.max(1, Math.abs(bestScore) * 1e-6);
    const tieOrder: Direction[] = ['up', 'down', 'left', 'right'];
    for (const direction of tieOrder) {
      const entry = scores.find((item) => item.direction === direction);
      if (entry && bestScore - entry.score <= epsilon) {
        return direction;
      }
    }
    return scores[0].direction;
  }

  private getBestMoveSet(
    scores: { direction: Direction; score: number }[],
    quantizeStep?: number
  ): Set<Direction> {
    const bestMoves = new Set<Direction>();
    if (!scores.length) return bestMoves;
    const quantize = (value: number) =>
      quantizeStep ? Math.round(value / quantizeStep) * quantizeStep : value;
    let bestScore = -Infinity;
    for (const entry of scores) {
      const value = quantize(entry.score);
      if (value > bestScore) bestScore = value;
    }
    const epsilon = Math.max(1, Math.abs(bestScore) * 1e-6);
    for (const entry of scores) {
      const value = quantize(entry.score);
      if (bestScore - value <= epsilon) {
        bestMoves.add(entry.direction);
      }
    }
    return bestMoves;
  }

  private getCompareBestMoveSet(
    scores: { direction: Direction; score: number }[]
  ): Set<Direction> {
    return this.getBestMoveSet(scores, 1);
  }

  private tryBoostedMove(board: Board, initialMove: Direction): Direction | null {
    let candidate = initialMove;
    let depth = this.getTsDepthLimit(board);
    const { timeBudgetMs } = this.ai.getTsConfig();
    let counted = false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const simulated = this.simulateMoveBoard(board, candidate);
      if (!simulated || !this.isBoardGameOver(simulated)) {
        return candidate;
      }
      if (!counted) {
        this.aiFatalBoostCount += 1;
        counted = true;
      }
      depth = Math.min(depth + 1, 7);
      this.aiBoostStatus = `Boost attempt ${attempt + 1}: depth=${depth}`;
      this.scheduleBoostStatusClear();
      const boosted =
        computeBestMoveBitboardCpp(board, {
          maxDepth: depth,
          timeBudgetMs,
        }) ?? null;
      if (!boosted) break;
      candidate = boosted;
    }
    return candidate;
  }

  private scheduleBoostStatusClear(): void {
    if (this.aiBoostStatusTimeout !== null) {
      window.clearTimeout(this.aiBoostStatusTimeout);
    }
    this.aiBoostStatusTimeout = window.setTimeout(() => {
      this.aiBoostStatus = '';
      this.aiBoostStatusTimeout = null;
    }, 30000);
  }

  private simulateMoveBoard(board: Board, direction: Direction): Board | null {
    const rows = boardToRows(board);
    const moved = applyMove(rows, direction);
    if (!moved.moved) return null;
    return rowsToGrid(moved.rows);
  }

  private isBoardGameOver(board: Board): boolean {
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[r].length; c++) {
        const value = board[r][c];
        if (value === 0) return false;
        if (c < board[r].length - 1 && value === board[r][c + 1]) return false;
        if (r < board.length - 1 && value === board[r + 1][c]) return false;
      }
    }
    return true;
  }

  private getBoardHash(board: Board): string {
    return board.map((row) => row.join(',')).join('|');
  }

  private trackBoardHash(hash: string): boolean {
    this.recentBoardHashes.push(hash);
    this.boardHashCounts.set(hash, (this.boardHashCounts.get(hash) ?? 0) + 1);
    const maxWindow = 200;
    while (this.recentBoardHashes.length > maxWindow) {
      const removed = this.recentBoardHashes.shift();
      if (removed) {
        const count = (this.boardHashCounts.get(removed) ?? 1) - 1;
        if (count <= 0) {
          this.boardHashCounts.delete(removed);
        } else {
          this.boardHashCounts.set(removed, count);
        }
      }
    }
    return (this.boardHashCounts.get(hash) ?? 0) >= 3;
  }

  private getTsDepthLimit(board: Board): number {
    const distinct = new Set<number>();
    for (const row of board) {
      for (const cell of row) {
        if (cell > 0) distinct.add(cell);
      }
    }
    const { depthCap } = this.ai.getTsConfig();
    return Math.min(Math.max(2, depthCap), Math.max(2, distinct.size - 2));
  }

  private getTsCompareDepthLimit(): number {
    const board = this.game.getBoardSnapshot();
    const distinct = new Set<number>();
    for (const row of board) {
      for (const cell of row) {
        if (cell > 0) distinct.add(cell);
      }
    }
    return Math.max(2, this.aiMindepth, distinct.size - 2);
  }

  updateAiSpeed(): void {
    if (this.aiSpeedMs < 50) {
      this.aiSpeedMs = 5;
    } else {
      this.aiSpeedMs = Math.round(this.aiSpeedMs / 50) * 50;
    }
    if (!this.aiRunning) return;
    if (this.aiIntervalId !== null) {
      clearInterval(this.aiIntervalId);
    }
    this.aiIntervalId = window.setInterval(() => this.stepAi(), this.aiSpeedMs);
  }

  private updateAiSummary(reason: 'win' | 'game-over' | 'stop'): void {
    const board = this.game.getBoardSnapshot();
    const maxTile = Math.max(...board.flat());
    const topTiles = [...board.flat()]
      .filter((value) => value >= 512)
      .sort((a, b) => b - a)
      .slice(0, 4);
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
      ` topTiles=${topTiles.join(',')}` +
      ` score=${score}` +
      ` moves=${movesSinceStart}` +
      ` totalMoves=${totalMoves}` +
      durationLine;
    this.aiSummary = message;
    // Summary is displayed in the UI; no console log needed.
    if (movesSinceStart > totalMoves) {
      this.runIntegrityStatus =
        `Run integrity issue: AI moves (${movesSinceStart}) > total moves (${totalMoves}).`;
      this.showRunIntegrityModal = true;
      this.runIntegrityIssueDetected = true;
      this.aiSummary = '';
      this.aiRunLogged = true;
      return;
    }

    if (reason === 'game-over' && !this.aiRunLogged) {
      this.aiRunLogged = true;
      this.runHistory.addRun({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        reason,
        maxTile,
        topTiles,
        engine: this.aiEngine,
        gameMode: this.spawnMode,
        parity: this.parityMode,
        compare: this.compareEngines,
        depth: this.aiEngine === 'ts' ? this.aiDepthCap : this.aiMindepth,
        score,
        moves: movesSinceStart,
        totalMoves,
        durationMs,
      });
    }
  }

  private startAiLoop(resetBoost = true, resetBatch = true): void {
    this.aiRunning = true;
    this.aiStepInFlight = false;
    this.aiRunToken++;
    this.clearHint();
    this.tiePauseStatus = '';
    this.tiePaused = false;
    this.skipTiePauseOnce = this.lastTiePauseMove !== null;
    this.aiRunLogged = false;
    this.aiGameOverHandled = false;
    this.aiPausedForNav = false;
    if (resetBoost) {
      this.aiAutoBoosted = false;
      this.aiAutoBoostLocked = false;
      this.aiAutoBoostManualOverride = false;
    }
    if (resetBatch) {
      this.batchRemaining = this.batchTotal;
    }
    this.aiRunLastStartedAt = Date.now();
    this.aiRunStartMoves = this.game.getMoveCountSnapshot();
    this.aiIntervalId = window.setInterval(() => this.stepAi(), this.aiSpeedMs);
  }

  private syncAutoBoostFromState(): void {
    const board = this.game.getBoardSnapshot();
    const maxTile = board.length ? Math.max(...board.flat()) : 0;
    this.applyAutoBoostFromTiles(board, maxTile, true);
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
    this.aiAutoBoostManualOverride = false;
    this.aiGameOverHandled = false;
    this.aiPausedForNav = false;
    this.runIntegrityStatus = '';
    this.showRunIntegrityModal = false;
    this.runIntegrityIssueDetected = false;
    this.clearHint();
    this.batchRemaining = this.batchTotal;
    this.autoBoostStage = 0;
    this.aiFatalBoostCount = 0;
    this.recentBoardHashes = [];
    this.boardHashCounts.clear();
    this.runIntegrityStatus = '';
    this.showRunIntegrityModal = false;
    this.runIntegrityIssueDetected = false;
  }

  dismissRunIntegrityModal(): void {
    this.showRunIntegrityModal = false;
  }

  private resetAiRunTrackingForNewGame(keepBatch = false): void {
    this.aiSummary = '';
    this.aiRunLastStartedAt = null;
    this.aiRunAccumulatedMs = 0;
    this.aiRunStartMoves = 0;
    this.aiRunAccumulatedMoves = 0;
    this.aiStepInFlight = false;
    this.aiRunToken++;
    this.aiRunLogged = false;
    this.aiGameOverHandled = false;
    this.aiPausedForNav = false;
    this.clearHint();
    this.autoBoostStage = 0;
    this.aiFatalBoostCount = 0;
    this.recentBoardHashes = [];
    this.boardHashCounts.clear();
    if (!keepBatch) {
      this.batchRemaining = this.batchTotal;
    }
  }

  private applyDefaultAiConfig(): void {
    this.aiMindepth = 3;
    this.aiDepthCap = 3;
    this.aiAutoBoostManualOverride = false;
    this.aiFatalBoostCount = 0;
    this.updateAiConfig();
    this.updateTsConfig();
  }

  private applyAutoBoostFromTiles(
    board: Board,
    maxTile: number,
    suppressLog = false
  ): void {
    if (this.aiAutoBoostManualOverride) {
      return;
    }
    const boost = this.useTestBoostThresholds
      ? {
          t16384: 1024,
          t8192: 512,
          t4096: 256,
          t2048: 128,
          t1024: 64,
          t32768: 2048,
        }
      : {
          t16384: 16384,
          t8192: 8192,
          t4096: 4096,
          t2048: 2048,
          t1024: 1024,
          t32768: 32768,
        };

    if (maxTile >= boost.t32768) {
      if (this.aiMindepth !== 2) {
        this.aiMindepth = 2;
        this.updateAiConfig();
      }
      this.aiAutoBoosted = false;
      this.aiAutoBoostLocked = true;
      return;
    }

    const tiles = new Set<number>();
    for (const row of board) {
      for (const cell of row) {
        if (cell > 0) tiles.add(cell);
      }
    }
    const has16384 = tiles.has(boost.t16384);
    const has8192 = tiles.has(boost.t8192);
    const has4096 = tiles.has(boost.t4096);
    const has2048 = tiles.has(boost.t2048);
    const has1024 = tiles.has(boost.t1024);

    let targetDepth: number | null = null;
    if (has8192 || has16384) {
      if (has4096) {
        targetDepth = 5;
      } else if (has2048) {
        targetDepth = 4;
      } else {
        targetDepth = 3;
      }
    }

    if (targetDepth !== null) {
      let changed = false;
      if (this.aiMindepth !== targetDepth) {
        this.aiMindepth = targetDepth;
        changed = true;
        this.updateAiConfig();
      }
      if (this.aiDepthCap !== targetDepth) {
        this.aiDepthCap = targetDepth;
        changed = true;
        this.updateTsConfig();
      }
      if (changed && !suppressLog) {
        const message = `AI auto-boost: depth=${targetDepth}`;
        console.log(message);
        this.debug.log(message);
      }
    }
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
    const isHome = url === '/' || url.startsWith('/?');
    if (!isHome) {
      this.pauseAiForNav();
      return;
    }
    if (this.gameOverActive) return;
    if (this.aiRunning) return;
    if (this.aiPausedForNav) {
      this.startAiLoop(false, false);
      return;
    }
  }


  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        this.move('up');
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.move('down');
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.move('left');
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.move('right');
        break;
    }
  }
}
