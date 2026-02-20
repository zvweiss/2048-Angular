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
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { Observable, Subject, filter, takeUntil } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { GameService, SavedSpawnMeta } from '../../services/game.service';
import { AiEngine, AiService } from '../../services/ai.service';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { GameBoardComponent } from '../../components/game-board/game-board.component';
import { Board } from '../../types/board';
import { Direction } from '../../types/direction';
import { DebugPanelComponent } from '../../components/debug-panel/debug-panel.component';
import { SwipeDirective } from '../../directives/swipe.directive';
import { DebugService } from '../../services/debug.service';
import { RunHistoryService, RunSummary } from '../../services/run-history.service';
import {
  applyMove,
  boardToRows,
  computeBestMoveBitboardCpp,
  rowsToGrid,
  computeHeuristicBreakdown,
} from '../../services/bitboard-core';

type DivergenceStatus = 'open' | 'investigating';
type DivergenceEntry = {
  label: string;
  createdAt: number;
  note: string;
  status: DivergenceStatus;
};

type ReplayDiagnosticSnapshot = {
  phase: 'non-strict' | 'strict';
  stop:
    | 'diverged'
    | 'tie-stop'
    | 'passed-checkpoint'
    | 'completed'
    | 'stopped-early'
    | 'game-over'
    | 'timeout'
    | 'unknown';
  moveCount: number;
  replayStopReason: string | null;
  divergenceMove?: number;
  tsMove?: string;
  replayMove?: string;
  tsDelta?: number;
};

type ReplayDiagnosticReport = {
  label: string;
  targetMove: number;
  startedAt: number;
  finishedAt: number;
  snapshots: ReplayDiagnosticSnapshot[];
};

type ReplayDiagnosticUiState = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

type ReplayDiagnosticStatusSnapshot = {
  state: ReplayDiagnosticUiState;
  active: boolean;
  step: string;
  status: string;
  phase: 'non-strict' | 'strict' | '';
  targetMove: number | null;
  currentMove: number | null;
  label: string;
  updatedAt: number;
};

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
  replayThroughputStatus = '';
  replayDepthStatus = '';
  runIntegrityStatus = '';
  showRunIntegrityModal = false;
  runIntegrityIssueDetected = false;
  replayDataMissingActive = false;
  replayDataMissingMessage = '';
  divergenceLabelBlockedActive = false;
  divergenceLabelBlockedMessage = '';
  spawnStatus = '';
  spawnLabel = '';
  savedSpawns: SavedSpawnMeta[] = [];
  selectedReplayId: string | null = null;
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
  private lastStopOrigin: 'user' | 'replay-exhausted' | 'divergence' | 'tie' | 'system' =
    'system';
  private replayLastStopOrigin:
    | 'user'
    | 'replay-exhausted'
    | 'divergence'
    | 'tie'
    | 'system' = 'system';
  private lastRunMode: 'normal' | 'record' | 'replay' = 'normal';
  private replayRunLoggedAtCompletion = false;
  private lastReplayUiRefreshAt = 0;
  private readonly replayUiRefreshThrottleMs = 150;
  gameOverMessage = 'No more valid moves. Try again!';
  replayStoppedEarly = false;
  replayStoppedEarlyMessage = '';
  replayCompletedActive = false;
  replayCheckpointLoading = false;
  replayCheckpointArmed = false;
  replayDiagnosticActive = false;
  replayDiagnosticStep = '';
  replayDiagnosticStatus = '';
  replayDiagnosticPhase: 'non-strict' | 'strict' | '' = '';
  replayDiagnosticState: ReplayDiagnosticUiState = 'idle';
  replayDiagnosticCurrentMove: number | null = null;
  replayDiagnosticResultActive = false;
  replayDiagnosticResultText = '';
  private replayDiagnosticAbort = false;
  replayDiagnosticTargetLabel = '';
  replayDiagnosticTargetMove: number | null = null;
  private readonly replayDiagnosticStatusStorageKey = 'replayDiagnosticStatus';
  private replayThroughputLastSampleAt = 0;
  private replayThroughputLastSampleMove = 0;
  private suppressReplayStopPrompt = false;
  replayCompletedMessage = '';
  replayDivergedActive = false;
  replayDivergedMessage = '';
  replayDivergedPendingReset = false;
  validateModalActive = false;
  validateInfoActive = false;
  validateInfoMessage = '';
  validationIssues: {
    id: string;
    label: string;
    kind: 'invalid-saved-spawn' | 'orphan-run' | 'needs-code';
    details: string[];
    selected: boolean;
    fixable: boolean;
  }[] = [];
  confirmStopSaveActive = false;
  confirmStopSaveLabel = '';
  confirmStopSaveError = '';
  restartConfirmActive = false;
  modeChangeConfirmActive = false;
  private pendingModeChange: 'normal' | 'record' | 'replay' | null = null;
  private resumeModeChangeAiOnContinue = false;
  private replayEarlyStopRetryAttempted = false;
  private activeReplayRecordingId: string | null = null;
  private suppressModeChangeConfirm = false;
  private resumeRecordAiOnContinue = false;
  abandonNormalConfirmActive = false;
  exitRecordConfirmActive = false;
  private suppressRecordExitPrompt = false;
  private exitRecordAction: 'restore' | 'restart' = 'restore';
  private saveAndExitRecordPending = false;
  backlogDeleteConfirmActive = false;
  backlogDeleteConfirmMessage = '';
  private backlogDeleteLabel = '';
  private backlogDeleteIsRefreshed = false;
  private preRecordState: {
    spawnMode: 'normal' | 'record' | 'replay';
    aiEngine: 'ts' | 'wasm';
    aiCompareEnabled: boolean;
    aiComparePause: boolean;
    compareEngines: boolean;
    pauseOnDivergence: boolean;
    parityMode: boolean;
    selectedReplayId: string | null;
    spawnLabel: string;
  } | null = null;
  private aiGameOverHandled = false;
  private aiPausedForNav = false;
  private destroy$ = new Subject<void>();
  private recentBoardHashes: string[] = [];
  private boardHashCounts = new Map<string, number>();
  hintDirection: Direction | null = null;
  hintLoading = false;
  private hintToken = 0;
  divergenceStatus = '';
  divergenceDetails = '';
  private readonly autoSaveDivergenceEnabled = true;
  divergenceBacklog: DivergenceEntry[] = [];
  private readonly divergenceBacklogKey = 'divergenceBacklog';
  private readonly divergenceRefreshSeparator = ' — Refreshed ';
  divergenceFixed: DivergenceEntry[] = [];
  private readonly divergenceFixedKey = 'divergenceFixedLog';
  // Strict mode still allows very small near-ties if WASM also considers both moves top-tier.
  private strictReplayNearTieDelta = 48;
  private strictReplayWasmTopTolerance = 24;
  // Strict tie acceptance: allow replay-selected tie move when TS delta stays within this cap.
  private strictReplayTieAcceptDelta = 12;
  // Non-strict compare: allow modest near-tie differences before flagging divergence.
  private replayNonStrictDelta = 16;
  private compareEngines = false;
  private pauseOnDivergence = false;
  aiCompareEnabled = false;
  aiComparePause = false;
  aiDebugEnabled = false;
  replayFastMode = true;
  parityMode = true;
  strictParityMode = false;
  @ViewChild('aiSettings') aiSettings?: ElementRef<HTMLDetailsElement>;
  @ViewChild('spawnModeSelect') spawnModeSelect?: ElementRef<HTMLSelectElement>;

  constructor(
    public game: GameService,
    private ai: AiService,
    private debug: DebugService,
    private runHistory: RunHistoryService,
    private router: Router,
    private cdr: ChangeDetectorRef
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
    this.spawnLabel = this.game.getSpawnLabel();
    this.savedSpawns = this.getSortedSavedSpawns();
    this.selectedReplayId = this.savedSpawns[0]?.id ?? null;
    this.savedSpawnsAvailable = this.savedSpawns.length > 0;
    this.reconcileRecordRunsWithSavedSpawns();
    this.reconcileRecordRunsWithSavedSpawns();
    this.loadDivergenceBacklog();
    this.loadDivergenceFixed();
    this.restoreReplayDiagnosticStatus();
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
      this.savedSpawnsAvailable = this.savedSpawns.length > 0;
      this.spawnLabel = this.game.getSpawnLabel();
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
          this.replayStoppedEarly = false;
          const replayContext = this.spawnMode === 'replay';
          const savedMoves = replayContext ? this.game.getMoveLogLength() : 0;
          const runMoves = replayContext ? this.game.getMoveCountSnapshot() : 0;
          const replayStopReason = replayContext
            ? this.game.getReplayStopReason()
            : null;
          const replayCompleted =
            replayContext &&
            replayStopReason === 'move-log-exhausted' &&
            savedMoves > 0 &&
            runMoves >= savedMoves;
          if (replayContext) {
            this.gameOverMessage =
              replayStopReason === 'spawn-mismatch'
                ? `Replay spawn mismatch at move ${runMoves} / ${savedMoves}.`
                : replayCompleted
                  ? 'Replay completed — all recorded moves consumed.'
                  : `Replay ended early: ${runMoves} / ${savedMoves} moves consumed.`;
          } else {
            this.gameOverMessage = 'No more valid moves. Try again!';
          }
          if (replayContext) {
            if (!this.replayRunLoggedAtCompletion) {
              const replayLabel = this.spawnLabel || this.game.getSpawnLabel();
              if (this.shouldTrackPartialReplay(runMoves, savedMoves)) {
                this.addDivergenceBacklog(
                  replayLabel,
                  `Partial replay: ${runMoves} / ${savedMoves} moves`
                );
                this.replayRunLoggedAtCompletion = true;
                this.spawnStatus = `Partial replay (not logged): ${runMoves} / ${savedMoves} moves.`;
              } else if (savedMoves > 0 && runMoves < savedMoves) {
                this.replayRunLoggedAtCompletion = true;
                this.spawnStatus = `Replay ended too early (${runMoves} / ${savedMoves}); backlog entry skipped.`;
              } else {
                this.ensureRunLoggedIfMissing('game-over', 'replay', replayLabel);
                this.replayRunLoggedAtCompletion = true;
              }
            }
            if (replayCompleted) {
              const replayLabel = this.spawnLabel || this.game.getSpawnLabel();
              this.clearReplayBacklogOnCompareCompletion(replayLabel);
              this.replayCompletedMessage =
                `Replay completed: ${runMoves} / ${savedMoves} moves consumed.`;
              this.replayCompletedActive = true;
            }
          } else if (!this.aiRunning) {
            this.ensureRunLoggedIfMissing('game-over');
          }
          this.promptSaveRecordingOnGameOver();
        }
        if (isOver && this.aiRunning) {
          const wasRecord = this.spawnMode === 'record';
          const isBatch = this.batchTotal >= 1;
          if (isBatch && wasRecord) {
            this.autoSaveBatchRecordRun();
          }
          if (this.batchRemaining > 1) {
            this.stopAi('game-over');
            if (this.runIntegrityIssueDetected) {
              this.batchRemaining = this.batchTotal;
              return;
            }
            if (wasRecord) {
              this.game.clearRecording();
              this.recordingSaved = false;
              this.spawnLabel = '';
              this.spawnMode = 'record';
              this.updateSpawnMode();
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

    this.game.cleanupNotice$
      .pipe(takeUntil(this.destroy$))
      .subscribe((message) => {
        if (!message) return;
        this.spawnStatus = message;
        console.warn(message);
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
    if (this.aiRunning) {
      this.spawnStatus = 'Run in progress. Manual moves are disabled.';
      return;
    }
    if (this.isRecordManualLocked) {
      this.spawnStatus = 'Run in progress. Manual moves are disabled.';
      return;
    }
    if (this.isRecordingLocked) {
      this.spawnStatus = 'Recording saved. Restart to record a new run.';
      return;
    }
    this.clearHint();
    this.game.move(direction);
    this.lastRunMode = this.spawnMode;
  }

  restart(): void {
    if (this.spawnMode === 'record' && this.canSaveSpawns) {
      this.exitRecordAction = 'restart';
      this.resumeRecordAiOnContinue = this.pauseAiForDecisionModal();
      this.exitRecordConfirmActive = true;
      return;
    }
    if (this.spawnMode !== 'record' && this.runInProgress) {
      this.restartConfirmActive = true;
      return;
    }
    this.performRestart();
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
    this.game.dismissGameOver();
    this.stopAi('stop');
    this.resetAiRunTrackingForNewGame();
    this.game.startNewGame();
    this.winFromAiRun = false;
    this.applyDefaultAiConfig();
    this.autoBoostStage = 0;
    this.clearHint();
    this.spawnMode = 'normal';
    this.updateSpawnMode();
  }

  dismissReplayStoppedEarly(): void {
    this.replayStoppedEarly = false;
  }

  abandonReplayStoppedEarly(): void {
    this.replayStoppedEarly = false;
    this.performRestart();
  }

  dismissReplayCompleted(): void {
    this.replayCompletedActive = false;
    this.replayCompletedMessage = '';
    this.game.dismissGameOver();
    this.gameOverActive = false;
    this.gameOverDismissed = true;
    this.stopAi('stop');
    this.resetAiRunTrackingForNewGame();
    this.game.startNewGame();
    this.winFromAiRun = false;
    this.applyDefaultAiConfig();
    this.autoBoostStage = 0;
    this.clearHint();
    this.spawnMode = 'normal';
    this.suppressModeChangeConfirm = true;
    this.updateSpawnMode();
  }

  validateSavedSpawns(): void {
    const raw = localStorage.getItem('savedSpawns');
    if (!raw) {
      this.validationIssues = [];
      this.validateModalActive = false;
      this.validateInfoActive = true;
      this.validateInfoMessage = 'No saved spawns found to validate.';
      this.spawnStatus = 'No saved spawns found to validate.';
      return;
    }
    let parsed: any[] = [];
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.validationIssues = [
        {
          id: 'invalid-json',
          label: '(savedSpawns)',
          kind: 'invalid-saved-spawn',
          details: ['savedSpawns is not valid JSON'],
          selected: true,
          fixable: true,
        },
      ];
      this.validateModalActive = true;
      this.validateInfoActive = false;
      this.spawnStatus = 'Saved spawns data is unreadable.';
      return;
    }
    const boardSize = this.game.getBoardSnapshot().length || 4;
    const validMoves = new Set(['up', 'down', 'left', 'right']);
    const results: {
      id: string;
      label: string;
      kind: 'invalid-saved-spawn' | 'orphan-run' | 'needs-code';
      details: string[];
      selected: boolean;
      fixable: boolean;
    }[] = [];
    for (const entry of parsed) {
      const label = String(entry?.label ?? '').trim() || '(no label)';
      const details: string[] = [];
      const moveLog = Array.isArray(entry?.moveLog) ? entry.moveLog : [];
      const spawnLog = Array.isArray(entry?.spawnLog) ? entry.spawnLog : [];
      if (moveLog.length === 0) {
        details.push('Move log is empty');
      }
      if (spawnLog.length === 0) {
        details.push('Spawn log is empty');
      }
      if (moveLog.length > 0) {
        const badMove = moveLog.find(
          (move: any) =>
            typeof move !== 'string' || !validMoves.has(move.trim().toLowerCase())
        );
        if (badMove !== undefined) {
          details.push(`Invalid move entry: ${String(badMove)}`);
        }
      }
      if (spawnLog.length > 0) {
        const badSpawn = spawnLog.find((spawn: any) => {
          const r = spawn?.r;
          const c = spawn?.c;
          const value = spawn?.value;
          if (
            typeof r !== 'number' ||
            typeof c !== 'number' ||
            typeof value !== 'number'
          ) {
            return true;
          }
          return r < 0 || c < 0 || r >= boardSize || c >= boardSize || value <= 0;
        });
        if (badSpawn !== undefined) {
          details.push('Invalid spawn entry detected');
        }
      }
      if (moveLog.length > 0 && spawnLog.length > 0 && moveLog.length > spawnLog.length) {
        details.push('Move log longer than spawn log');
      }
      if (details.length > 0) {
        results.push({
          id: `invalid-saved-spawn:${label}`,
          label,
          kind: 'invalid-saved-spawn',
          details,
          selected: true,
          fixable: true,
        });
      }
    }
    const savedLabels = new Set(
      parsed.map((entry) => String(entry?.label ?? '').trim()).filter((l) => l)
    );
    const orphanRuns = this.runHistory
      .getRuns()
      .filter(
        (run) =>
          (run.gameMode === 'record' || run.gameMode === 'replay') &&
          Boolean(run.replayLabel?.trim()) &&
          !savedLabels.has(run.replayLabel!.trim())
      );
    const orphanLabels = [...new Set(orphanRuns.map((run) => run.replayLabel!.trim()))];
    for (const label of orphanLabels) {
      const hasArchive = this.game.hasRecordSpawnsArchiveForLabel(label);
      results.push({
        id: `orphan-run:${label}`,
        label,
        kind: 'orphan-run',
        details: hasArchive
          ? ['Runs exist but saved spawns are missing (archive available)']
          : ['Runs exist but saved spawns are missing (archive missing)'],
        selected: true,
        fixable: hasArchive,
      });
    }
    this.validationIssues = results;
    const total = parsed.length;
    const invalid = results.length;
    this.spawnStatus =
      invalid === 0
        ? `Validated ${total} saved spawns. No issues found.`
        : `Validated ${total} saved spawns. ${invalid} flagged.`;
    this.validateModalActive = results.length > 0;
    if (results.length === 0) {
      this.validateInfoActive = true;
      this.validateInfoMessage = `Validated ${total} saved spawns. No issues found.`;
    } else {
      this.validateInfoActive = false;
    }
  }

  dismissValidateModal(): void {
    this.validateModalActive = false;
  }

  dismissValidateInfo(): void {
    this.validateInfoActive = false;
  }

  toggleValidationIssue(issue: { selected: boolean }): void {
    issue.selected = !issue.selected;
  }

  fixSelectedValidationIssues(): void {
    const selected = this.validationIssues.filter((issue) => issue.selected);
    if (selected.length === 0) {
      this.spawnStatus = 'No validation issues selected.';
      return;
    }
    const needsCode = selected.filter((issue) => !issue.fixable);
    let removedRuns = 0;
    let removedSpawns = 0;
    let removedDivergences = 0;
    let restoredSpawns = 0;
    let restoredRuns = 0;
    for (const issue of selected) {
      if (!issue.fixable) {
        this.addDivergenceBacklog(
          issue.label,
          `Validate needs code fix: ${issue.details.join('; ')}`
        );
        continue;
      }
      if (issue.kind === 'orphan-run') {
        const restored = this.game.restoreSavedSpawnsFromArchive(issue.label);
        if (restored) {
          restoredSpawns += 1;
          const savedId =
            this.game.getSavedSpawnIdByLabelCached(issue.label) ?? undefined;
          if (typeof savedId === 'number') {
            this.runHistory.updateRecordSavedId(issue.label, savedId);
          }
          restoredRuns += 1;
        } else {
          this.addDivergenceBacklog(
            issue.label,
            'Validate could not restore saved spawns: archive missing.'
          );
        }
      } else if (issue.kind === 'invalid-saved-spawn') {
        this.addDivergenceBacklog(
          issue.label,
          'Validate blocked auto-delete for safety. Delete manually if truly intended.'
        );
        continue;
      }
    }
    this.refreshReplaySelectionState(
      'Replay selection was removed. Switched to normal mode.'
    );
    const divergencePart = removedDivergences
      ? ` and ${removedDivergences} divergence entr${removedDivergences === 1 ? 'y' : 'ies'}`
      : '';
    const restoredPart =
      restoredSpawns || restoredRuns
        ? ` Restored ${restoredSpawns} saved spawn${restoredSpawns === 1 ? '' : 's'} for ${restoredRuns} run${restoredRuns === 1 ? '' : 's'}.`
        : '';
    const fixedCount = selected.length - needsCode.length;
    const needsCodePart =
      needsCode.length > 0
        ? `, ${needsCode.length} sent to backlog`
        : '';
    this.spawnStatus =
      `Fixed ${fixedCount} issue${fixedCount === 1 ? '' : 's'}: ` +
      `${removedRuns} run${removedRuns === 1 ? '' : 's'}, ` +
      `${removedSpawns} saved spawn${removedSpawns === 1 ? '' : 's'}${divergencePart}${needsCodePart}.${restoredPart}`;
    this.validateModalActive = false;
  }

  private reconcileRecordRunsWithSavedSpawns(): void {
    const savedLabels = new Set(
      this.savedSpawns.map((entry) => entry.label.trim())
    );
    const runs = this.runHistory.getRuns();
    for (const run of runs) {
      if (run.gameMode !== 'record') continue;
      const label = run.replayLabel?.trim() ?? '';
      if (!label) continue;
      const hasSaved =
        savedLabels.has(label) || this.game.hasRecordSpawnsArchiveForLabel(label);
      if (!hasSaved) {
        continue;
      }
      if (typeof run.savedId !== 'number') {
        const savedId = this.game.getSavedSpawnIdByLabelCached(label) ?? undefined;
        if (typeof savedId === 'number') {
          this.runHistory.updateRecordSavedId(label, savedId);
        }
      }
    }
  }

  get fixableValidationIssues() {
    return this.validationIssues.filter((issue) => issue.fixable);
  }

  get needsCodeValidationIssues() {
    return this.validationIssues.filter((issue) => !issue.fixable);
  }

  onSwipe(direction: 'up' | 'down' | 'left' | 'right') {
    this.move(direction);
  }

  toggleAiRun(): void {
    if (this.aiRunning) {
      this.lastStopOrigin = 'user';
      this.stopAi('stop');
      return;
    }
    if (this.isRecordingLocked) {
      this.spawnStatus = 'Recording saved. Restart to record a new run.';
      return;
    }
    if (this.spawnMode === 'replay' && this.gameOverActive) {
      // Replay may inherit stale game-over state from prior replay lifecycle.
      // Clear it so replay can be started without manual DevTools intervention.
      this.game.dismissGameOver();
      this.gameOverActive = false;
      this.gameOverDismissed = true;
    }
    if (this.gameOverActive) return;
    if (this.spawnMode === 'replay' && this.game.getMoveLogLength() === 0) {
      this.replayDataMissingActive = true;
      this.replayDataMissingMessage =
        'Replay data is missing. Select a valid recording or save spawns again.';
      return;
    }
    if (this.spawnMode === 'replay') {
      this.game.dismissGameOver();
      this.gameOverActive = false;
      this.gameOverDismissed = true;
      const replayId = this.selectedReplayId;
      const hasCheckpointReady =
        this.replayCheckpointArmed &&
        !!replayId &&
        this.activeReplayRecordingId === replayId &&
        this.game.getMoveCountSnapshot() > 0;
      if (!hasCheckpointReady) {
        // Default replay start path: reload from move 0 for deterministic replay.
        if (!replayId || !this.game.loadSavedSpawn(replayId)) {
          this.replayDataMissingActive = true;
          this.replayDataMissingMessage =
            'Replay data is missing. Select a valid recording or save spawns again.';
          return;
        }
        this.activeReplayRecordingId = replayId;
        this.replayEarlyStopRetryAttempted = false;
        this.resetAiRunTrackingForNewGame();
        this.game.startNewGame();
      } else {
        // One-shot checkpoint resume: run exactly from replay N-1 cursor.
        this.replayCheckpointArmed = false;
        this.replayEarlyStopRetryAttempted = false;
      }
      this.spawnLabel = this.game.getSpawnLabel();
      this.replaySavedMovesStatus = `Saved moves: ${this.game.getMoveLogLength()}`;
      this.refreshReplayUi(true);
      this.spawnStatus = this.spawnLabel
        ? `Replay ready (${this.spawnLabel}).`
        : 'Replay ready.';
      console.info('Replay start state:', this.game.getReplayDebugState());
    }
    this.startAiLoop();
  }

  logCurrentRunForTest(): void {
    this.ensureRunLoggedIfMissing('stop');
    this.runHistory.refreshRuns();
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
      this.compareEngines = false;
      this.pauseOnDivergence = this.aiComparePause;
    }
    this.updateParityMode();
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
    const wasCompareEnabled = this.compareEngines;
    if (!this.aiCompareEnabled) {
      this.aiComparePause = false;
    } else if (
      !wasCompareEnabled &&
      this.aiEngine === 'ts' &&
      this.spawnMode === 'replay'
    ) {
      // Replay compare defaults to non-strict parity for faster, less noisy validation.
      this.strictParityMode = false;
    }
    this.compareEngines = this.aiCompareEnabled;
    this.pauseOnDivergence = this.aiComparePause;
    this.updateParityMode();
    this.updateShadowRecording();
    if (!this.compareEngines) {
      this.clearDivergences();
    }
  }

  updateAiDebug(): void {
    this.ai.setDebugAi(this.aiDebugEnabled);
  }

  updateParityMode(): void {
    if (this.aiEngine === 'ts' && this.spawnMode === 'normal') {
      this.parityMode = true;
    }
    if (this.parityMode) {
      this.aiAutoBoostManualOverride = false;
      this.aiBoostStatus = '';
    }
  }

  get replayProgressText(): string | null {
    return this.replayRunMovesStatus || null;
  }

  get replayThroughputText(): string | null {
    return this.replayThroughputStatus || null;
  }

  get replayDepthText(): string | null {
    return this.replayDepthStatus || null;
  }

  clearDivergences(): void {
    localStorage.removeItem('aiDivergences');
    localStorage.removeItem('aiDivergence');
    this.divergenceStatus = '';
    this.divergenceDetails = '';
  }

  private loadDivergenceBacklog(): void {
    const raw = localStorage.getItem(this.divergenceBacklogKey);
    if (!raw) {
      this.divergenceBacklog = [];
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      this.divergenceBacklog = Array.isArray(parsed)
        ? parsed
            .map((entry) => this.normalizeDivergenceEntry(entry))
            .filter((entry): entry is DivergenceEntry => !!entry)
        : [];
    } catch {
      this.divergenceBacklog = [];
    }
  }

  private saveDivergenceBacklog(): void {
    localStorage.setItem(
      this.divergenceBacklogKey,
      JSON.stringify(this.divergenceBacklog)
    );
  }

  private loadDivergenceFixed(): void {
    const raw = localStorage.getItem(this.divergenceFixedKey);
    if (!raw) {
      this.divergenceFixed = [];
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      this.divergenceFixed = Array.isArray(parsed)
        ? parsed
            .map((entry) => this.normalizeDivergenceEntry(entry))
            .filter((entry): entry is DivergenceEntry => !!entry)
        : [];
    } catch {
      this.divergenceFixed = [];
    }
  }

  private normalizeDivergenceEntry(entry: unknown): DivergenceEntry | null {
    if (!entry || typeof entry !== 'object') return null;
    const raw = entry as {
      label?: unknown;
      createdAt?: unknown;
      note?: unknown;
      status?: unknown;
    };
    const label = String(raw.label ?? '').trim();
    if (!label) return null;
    const createdAt = Number(raw.createdAt);
    const note = String(raw.note ?? '').trim();
    const status: DivergenceStatus =
      raw.status === 'investigating' ? 'investigating' : 'open';
    return {
      label,
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      note,
      status,
    };
  }

  getBacklogStatusLabel(entry: DivergenceEntry): string {
    return entry.status === 'investigating' ? 'Investigating' : 'Open';
  }

  getBacklogKindLabel(entry: DivergenceEntry): 'Tie' | 'Divergence' {
    const note = String(entry?.note ?? '');
    return /\btie\b/i.test(note) ? 'Tie' : 'Divergence';
  }

  private markBacklogInvestigating(baseLabel: string): void {
    const trimmed = baseLabel.trim();
    if (!trimmed) return;
    let changed = false;
    this.divergenceBacklog = this.divergenceBacklog.map((entry) => {
      const entryBase = this.getBacklogBaseLabel(entry.label);
      if (entryBase !== trimmed || entry.status === 'investigating') return entry;
      changed = true;
      return { ...entry, status: 'investigating' };
    });
    if (changed) {
      this.saveDivergenceBacklog();
    }
  }

  private saveDivergenceFixed(): void {
    localStorage.setItem(
      this.divergenceFixedKey,
      JSON.stringify(this.divergenceFixed)
    );
  }

  private getBacklogBaseLabel(label: string): string {
    const cleaned = label.trim();
    if (!cleaned) return '';
    const separatorIndex = cleaned.indexOf(this.divergenceRefreshSeparator);
    if (separatorIndex === -1) return cleaned;
    return cleaned.slice(0, separatorIndex).trim();
  }

  private isBacklogRefreshed(label: string): boolean {
    return label.includes(this.divergenceRefreshSeparator);
  }

  private addDivergenceBacklog(label: string, note: string): void {
    const baseLabel = this.getBacklogBaseLabel(label);
    if (!baseLabel) return;
    const existingBase = this.divergenceBacklog.find(
      (entry) => entry.label === baseLabel
    );
    const baseEntry =
      existingBase
        ? { ...existingBase, note, status: 'open' as const }
        : { label: baseLabel, createdAt: Date.now(), note, status: 'open' as const };
    const refreshedLabel = `${baseLabel}${this.divergenceRefreshSeparator}${new Date().toLocaleString()}`;
    const refreshedEntry = {
      label: refreshedLabel,
      createdAt: Date.now(),
      note: `Refreshed: ${note}`,
      status: 'open' as const,
    };
    this.divergenceBacklog = [
      baseEntry,
      refreshedEntry,
      ...this.divergenceBacklog.filter((entry) => {
        if (entry.label === baseLabel) return false;
        return !entry.label.startsWith(
          `${baseLabel}${this.divergenceRefreshSeparator}`
        );
      }),
    ];
    this.saveDivergenceBacklog();
  }

  deleteBacklogEntry(label: string): void {
    const baseLabel = this.getBacklogBaseLabel(label);
    if (!baseLabel) return;
    this.backlogDeleteLabel = baseLabel;
    this.backlogDeleteIsRefreshed = this.isBacklogRefreshed(label);
    this.backlogDeleteConfirmMessage = this.backlogDeleteIsRefreshed
      ? `Clear replay runs for "${baseLabel}" and remove the refreshed backlog entry? The original backlog entry and saved spawns will remain.`
      : `Delete all runs, saved spawns, and backlog entries for "${baseLabel}"? This cannot be undone.`;
    this.backlogDeleteConfirmActive = true;
  }

  dismissBacklogDeleteConfirm(): void {
    this.backlogDeleteConfirmActive = false;
    this.backlogDeleteConfirmMessage = '';
    this.backlogDeleteLabel = '';
    this.backlogDeleteIsRefreshed = false;
  }

  confirmBacklogDelete(): void {
    const baseLabel = this.backlogDeleteLabel;
    if (!baseLabel) {
      this.dismissBacklogDeleteConfirm();
      return;
    }
    if (this.backlogDeleteIsRefreshed) {
      const removedRuns = this.runHistory.deleteReplayRunsByReplayLabel(
        baseLabel
      );
      this.divergenceBacklog = this.divergenceBacklog.filter(
        (entry) =>
          !entry.label.startsWith(
            `${baseLabel}${this.divergenceRefreshSeparator}`
          )
      );
      this.saveDivergenceBacklog();
      if (removedRuns > 0) {
        this.spawnStatus = `Cleared ${removedRuns} replay run${removedRuns === 1 ? '' : 's'} for ${baseLabel}.`;
      }
      this.dismissBacklogDeleteConfirm();
      return;
    }
    const confirmText = `DELETE ${baseLabel}`;
    const typed = window.prompt(
      `Type exactly:\n${confirmText}\n\nto confirm permanent deletion.`
    );
    if (typed === null) {
      this.dismissBacklogDeleteConfirm();
      return;
    }
    if (typed.trim() !== confirmText) {
      this.spawnStatus = 'Deletion cancelled: confirmation text did not match.';
      this.dismissBacklogDeleteConfirm();
      return;
    }
    const removedRuns = this.runHistory.deleteRunsByReplayLabel(baseLabel);
    const removedSpawns = this.game.deleteSavedSpawnsByLabel(baseLabel);
    const removedDivergences = this.removeDivergenceEntriesForLabel(baseLabel);
    this.refreshReplaySelectionState(
      'Replay selection was removed. Switched to normal mode.'
    );
    const divergencePart = removedDivergences
      ? ` and ${removedDivergences} divergence entr${removedDivergences === 1 ? 'y' : 'ies'}`
      : '';
    this.spawnStatus = `Deleted ${removedRuns} run${removedRuns === 1 ? '' : 's'} and ${removedSpawns} saved spawn${removedSpawns === 1 ? '' : 's'}${divergencePart}.`;
    this.dismissBacklogDeleteConfirm();
  }

  async copyDivergenceSnapshot(): Promise<void> {
    const raw = localStorage.getItem('aiDivergence');
    if (!raw) {
      this.spawnStatus = 'No divergence snapshot found.';
      return;
    }
    try {
      const snapshot = JSON.parse(raw);
      const payload = {
        label: this.spawnLabel || this.game.getSpawnLabel() || '',
        createdAt: new Date().toISOString(),
        ...snapshot,
        note: this.divergenceStatus || '',
      };
      const board = Array.isArray(payload.board)
        ? payload.board
            .map((row: number[]) =>
              row.map((cell) => (cell === 0 ? '.' : String(cell))).join(' ')
            )
            .join('\n')
        : '';
      const formatScores = (scores: Array<{ direction: string; score: number }> | undefined) => {
        if (!scores || !scores.length) return '';
        return scores
          .map((entry) => `${entry.direction}:${entry.score.toFixed(3)}`)
          .join(' | ');
      };
      const tsScores = formatScores(payload.tsScores);
      const tsScoresCpp = formatScores(payload.tsScoresCpp);
      const tsScoresNoCache = formatScores(payload.tsScoresNoCache);
      const wasmScores = formatScores(payload.wasmScores);
      const tsDelta =
        typeof payload.tsReplayScoreDelta === 'number'
          ? payload.tsReplayScoreDelta.toFixed(6)
          : '';
      const tsNoCacheDelta =
        typeof payload.tsNoCacheReplayScoreDelta === 'number'
          ? payload.tsNoCacheReplayScoreDelta.toFixed(6)
          : '';
      const tsCppDelta =
        typeof payload.tsCppReplayScoreDelta === 'number'
          ? payload.tsCppReplayScoreDelta.toFixed(6)
          : '';
      const wasmDelta =
        typeof payload.wasmReplayScoreDelta === 'number'
          ? payload.wasmReplayScoreDelta.toFixed(6)
          : '';
      const tsBreakdown = payload.tsCurrentBreakdown
        ? JSON.stringify(payload.tsCurrentBreakdown)
        : '';
      const tsPostBreakdowns = payload.tsPostMoveBreakdowns
        ? JSON.stringify(payload.tsPostMoveBreakdowns)
        : '';
      const tsDepthUsed =
        typeof payload.tsDepthUsed === 'number' ? String(payload.tsDepthUsed) : '';
      const wasmMindepth =
        typeof payload.wasmMindepth === 'number'
          ? String(payload.wasmMindepth)
          : '';
      const distinctTiles =
        typeof payload.distinctTileCount === 'number'
          ? String(payload.distinctTileCount)
          : '';
      const tsDepthSweep = payload.tsDepthSweep
        ? JSON.stringify(payload.tsDepthSweep)
        : '';
      const wasmDepthSweep = payload.wasmDepthSweep
        ? JSON.stringify(payload.wasmDepthSweep)
        : '';
      const mdBlock = [
        '---',
        `Label: ${payload.label}`,
        `Created: ${payload.createdAt}`,
        `Note: ${payload.note ?? ''}`,
        `Move: ${payload.move ?? ''}`,
        `TS move: ${payload.tsMove ?? ''}`,
        `TS scores (decision): ${tsScores}`,
        `TS delta decision (tsMove - replayMove): ${tsDelta}`,
        `TS scores (cpp): ${tsScoresCpp}`,
        `TS delta cpp (tsMove - replayMove): ${tsCppDelta}`,
        `TS scores (cpp no cache): ${tsScoresNoCache}`,
        `TS delta cpp no-cache (tsMove - replayMove): ${tsNoCacheDelta}`,
        `TS depth used: ${tsDepthUsed}`,
        `WASM move: ${payload.wasmMove ?? ''}`,
        `WASM scores: ${wasmScores}`,
        `WASM delta (tsMove - replayMove): ${wasmDelta}`,
        `WASM mindepth: ${wasmMindepth}`,
        `Distinct tiles: ${distinctTiles}`,
        `TS depth sweep: ${tsDepthSweep}`,
        `WASM depth sweep: ${wasmDepthSweep}`,
        `TS breakdown: ${tsBreakdown}`,
        `TS breakdowns (post-move): ${tsPostBreakdowns}`,
        'Board:',
        board,
        '---',
      ].join('\n');
      await navigator.clipboard.writeText(mdBlock);
      this.spawnStatus = 'Divergence backlog entry copied to clipboard.';
      if (this.replayDivergedActive) {
        this.dismissReplayDiverged();
      }
    } catch {
      this.spawnStatus = 'Failed to copy divergence snapshot.';
    }
  }

  canReplayFromDivergenceCheckpoint(): boolean {
    const raw = localStorage.getItem('aiDivergence');
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      return Number.isFinite(parsed?.move) && Number(parsed.move) >= 2;
    } catch {
      return false;
    }
  }

  canReplayFromDivergenceCheckpointForLabel(label: string): boolean {
    const raw = localStorage.getItem('aiDivergence');
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      const move = Number(parsed?.move ?? NaN);
      const replayLabel = String(parsed?.replayLabel ?? '').trim();
      const base = this.getBacklogBaseLabel(label);
      return Number.isFinite(move) && move >= 2 && !!base && replayLabel === base;
    } catch {
      return false;
    }
  }

  async replayFromDivergenceCheckpoint(): Promise<void> {
    const raw = localStorage.getItem('aiDivergence');
    if (!raw) {
      this.spawnStatus = 'No divergence snapshot found.';
      return;
    }
    let snapshot: { move?: number; replayLabel?: string } | null = null;
    try {
      snapshot = JSON.parse(raw);
    } catch {
      this.spawnStatus = 'Invalid divergence snapshot.';
      return;
    }

    const divergenceMove = Number(snapshot?.move ?? NaN);
    if (!Number.isFinite(divergenceMove) || divergenceMove < 2) {
      this.spawnStatus = 'Divergence move is too early for N-1 replay.';
      return;
    }

    const replayLabel = String(snapshot?.replayLabel ?? '').trim();
    if (!replayLabel) {
      this.spawnStatus = 'Divergence snapshot missing replay label.';
      return;
    }
    this.markBacklogInvestigating(replayLabel);
    const match = this.game
      .getSavedSpawnsMeta()
      .find((spawn) => spawn.label === replayLabel);
    if (!match) {
      this.spawnStatus = `No saved spawns found for ${replayLabel}.`;
      return;
    }

    this.replayCheckpointLoading = true;
    try {
      this.replayDivergedActive = false;
      this.replayDivergedMessage = '';
      this.startReplayFromSavedSpawn(match.id);
      const targetMove = Math.max(0, Math.floor(divergenceMove - 1));
      const ok = await this.fastForwardReplayToMove(targetMove);
      if (!ok) {
        this.spawnStatus = `Could not fast-forward replay to move ${targetMove}.`;
        return;
      }
      this.replayCheckpointArmed = true;
      this.spawnStatus = `Replay checkpoint loaded at move ${targetMove}.`;
    } finally {
      this.replayCheckpointLoading = false;
    }
  }

  canRunReplayDiagnostic(): boolean {
    return !this.replayDiagnosticActive && this.canReplayFromDivergenceCheckpoint();
  }

  canRunReplayDiagnosticForEntry(entry: DivergenceEntry): boolean {
    if (this.replayDiagnosticActive) return false;
    const label = this.getBacklogBaseLabel(entry.label);
    const move = this.getDivergenceMoveFromEntry(entry);
    if (!label || !Number.isFinite(move) || !move || move < 2) return false;
    return this.game.getSavedSpawnsMeta().some((spawn) => spawn.label === label);
  }

  runReplayDiagnosticFromBacklogEntry(entry: DivergenceEntry): void {
    const label = this.getBacklogBaseLabel(entry.label);
    const move = this.getDivergenceMoveFromEntry(entry);
    const seed =
      label && Number.isFinite(move) && move && move >= 2
        ? { move, label }
        : null;
    if (!seed) {
      this.spawnStatus = `No divergence snapshot found for ${this.getBacklogBaseLabel(
        entry.label
      )}.`;
      return;
    }
    void this.runReplayDiagnostic(seed);
  }

  async runReplayDiagnosticFromLatestDivergence(): Promise<void> {
    const seed = this.getLatestDivergenceSeed();
    if (!seed) {
      this.spawnStatus = 'No divergence snapshot found for diagnostic.';
      return;
    }
    await this.runReplayDiagnostic(seed);
  }

  private async runReplayDiagnostic(seed: { move: number; label: string }): Promise<void> {
    if (this.replayDiagnosticActive) return;
    const previous = {
      compareEnabled: this.aiCompareEnabled,
      comparePause: this.aiComparePause,
      compareEngines: this.compareEngines,
      strictParityMode: this.strictParityMode,
      logAiScores: this.aiDebugEnabled,
    };
    this.replayDiagnosticActive = true;
    this.replayDiagnosticAbort = false;
    this.replayDiagnosticResultActive = false;
    this.replayDiagnosticResultText = '';
    this.replayDiagnosticState = 'running';
    this.replayDiagnosticPhase = '';
    this.replayDiagnosticCurrentMove = this.game.getMoveCountSnapshot();
    this.replayDiagnosticStatus = `Diagnostic target: move ${seed.move} (${seed.label}).`;
    this.replayDiagnosticTargetLabel = seed.label;
    this.replayDiagnosticTargetMove = seed.move;
    this.persistReplayDiagnosticStatus();
    const startedAt = Date.now();
    const snapshots: ReplayDiagnosticSnapshot[] = [];
    try {
      if (this.aiRunning) {
        this.lastStopOrigin = 'user';
        this.stopAi('stop');
      }
      this.aiDebugEnabled = true;
      this.aiCompareEnabled = true;
      this.aiComparePause = false;
      this.compareEngines = true;
      this.updateAiDebug();
      this.updateAiCompare();

      snapshots.push(
        await this.runReplayDiagnosticPhase('non-strict', false)
      );
      if (!this.replayDiagnosticAbort) {
        snapshots.push(await this.runReplayDiagnosticPhase('strict', true));
      }

      const finishedAt = Date.now();
      const report: ReplayDiagnosticReport = {
        label: seed.label,
        targetMove: seed.move,
        startedAt,
        finishedAt,
        snapshots,
      };
      this.replayDiagnosticResultText = this.formatReplayDiagnosticReport(report);
      this.logReplayDiagnosticRun(report);
      this.replayDiagnosticResultActive = true;
      this.replayDiagnosticState = 'completed';
      const fullyPassed = snapshots.every(
        (snapshot) => snapshot.stop === 'passed-checkpoint'
      );
      this.replayDiagnosticStatus = fullyPassed
        ? 'Replay @ N-1 diagnostic completed: checkpoint passed in non-strict + strict. You can Mark Fixed for this backlog item.'
        : 'Replay diagnostic completed.';
      this.persistReplayDiagnosticStatus();
    } catch (error) {
      this.replayDiagnosticState = 'failed';
      this.replayDiagnosticStatus = `Replay diagnostic failed: ${
        error instanceof Error ? error.message : 'unknown error'
      }`;
      this.persistReplayDiagnosticStatus();
    } finally {
      this.replayDiagnosticTargetLabel = '';
      this.replayDiagnosticTargetMove = null;
      this.strictParityMode = previous.strictParityMode;
      this.aiDebugEnabled = previous.logAiScores;
      this.aiCompareEnabled = previous.compareEnabled;
      this.aiComparePause = previous.comparePause;
      this.compareEngines = previous.compareEngines;
      this.updateAiDebug();
      this.updateAiCompare();
      this.replayDiagnosticActive = false;
      this.replayDiagnosticStep = '';
      this.replayDiagnosticPhase = '';
      this.replayDiagnosticCurrentMove = this.game.getMoveCountSnapshot();
      this.persistReplayDiagnosticStatus();
    }
  }

  cancelReplayDiagnostic(): void {
    if (!this.replayDiagnosticActive) return;
    this.replayDiagnosticAbort = true;
    if (this.aiRunning) {
      this.lastStopOrigin = 'user';
      this.stopAi('stop');
    }
    this.replayDiagnosticState = 'cancelled';
    this.replayDiagnosticCurrentMove = this.game.getMoveCountSnapshot();
    this.replayDiagnosticStatus = 'Replay diagnostic cancelled.';
    this.persistReplayDiagnosticStatus();
  }

  dismissReplayDiagnosticResult(): void {
    this.clearReplayDiagnosticUiState(true, true);
  }

  async copyReplayDiagnosticResult(): Promise<void> {
    if (!this.replayDiagnosticResultText) return;
    try {
      await navigator.clipboard.writeText(this.replayDiagnosticResultText);
      this.spawnStatus = 'Replay diagnostic report copied to clipboard.';
    } catch {
      this.spawnStatus = 'Failed to copy replay diagnostic report.';
    }
  }

  private getLatestDivergenceSeed(): { move: number; label: string } | null {
    return this.getLatestDivergenceSeedForLabel();
  }

  private getLatestDivergenceSeedForLabel(
    labelFilter?: string,
    moveFilter?: number | null
  ): { move: number; label: string } | null {
    const normalizedLabel = labelFilter?.trim() ?? '';
    const normalizedMove = Number(moveFilter ?? NaN);
    let many: any[] = [];
    try {
      const parsedMany = JSON.parse(localStorage.getItem('aiDivergences') || '[]');
      many = Array.isArray(parsedMany) ? parsedMany : [];
    } catch {
      many = [];
    }
    const all = [
      localStorage.getItem('aiDivergence'),
      ...many.map((entry: any) => JSON.stringify(entry)),
    ]
      .filter(Boolean)
      .map((raw) => {
        try {
          return JSON.parse(String(raw));
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const match = all
      .reverse()
      .find((entry: any) => {
        const move = Number(entry?.move ?? NaN);
        const label = String(entry?.replayLabel ?? '').trim();
        if (!Number.isFinite(move) || move < 2 || !label) return false;
        if (normalizedLabel && label !== normalizedLabel) return false;
        if (Number.isFinite(normalizedMove) && move !== normalizedMove) return false;
        return true;
      });
    if (!match) return null;
    return {
      move: Number(match.move),
      label: String(match.replayLabel).trim(),
    };
  }

  private async replayFromDiagnosticSeed(
    label: string,
    divergenceMove: number
  ): Promise<boolean> {
    const match = this.game
      .getSavedSpawnsMeta()
      .find((spawn) => spawn.label === label);
    if (!match) return false;
    this.replayCheckpointLoading = true;
    try {
      this.replayDivergedActive = false;
      this.replayDivergedMessage = '';
      this.startReplayFromSavedSpawn(match.id);
      const targetMove = Math.max(0, Math.floor(divergenceMove - 1));
      const ok = await this.fastForwardReplayToMove(targetMove);
      if (!ok) return false;
      this.replayCheckpointArmed = true;
      this.spawnStatus = `Replay checkpoint loaded at move ${targetMove}.`;
      return true;
    } finally {
      this.replayCheckpointLoading = false;
    }
  }

  private getDivergenceMoveFromEntry(entry: DivergenceEntry): number | null {
    const text = `${entry.note} ${entry.label}`;
    const match = text.match(/move\s+(\d+)/i);
    if (!match) return null;
    const move = Number(match[1]);
    return Number.isFinite(move) ? move : null;
  }

  private persistReplayDiagnosticStatus(): void {
    const snapshot: ReplayDiagnosticStatusSnapshot = {
      state: this.replayDiagnosticState,
      active: this.replayDiagnosticActive,
      step: this.replayDiagnosticStep,
      status: this.replayDiagnosticStatus,
      phase: this.replayDiagnosticPhase,
      targetMove: this.replayDiagnosticTargetMove,
      currentMove: this.replayDiagnosticCurrentMove,
      label: this.replayDiagnosticTargetLabel,
      updatedAt: Date.now(),
    };
    localStorage.setItem(
      this.replayDiagnosticStatusStorageKey,
      JSON.stringify(snapshot)
    );
  }

  private restoreReplayDiagnosticStatus(): void {
    const raw = localStorage.getItem(this.replayDiagnosticStatusStorageKey);
    if (!raw) return;
    try {
      const snapshot = JSON.parse(raw) as ReplayDiagnosticStatusSnapshot;
      this.replayDiagnosticState = snapshot.state ?? 'idle';
      this.replayDiagnosticActive = false;
      this.replayDiagnosticStep = snapshot.step ?? '';
      this.replayDiagnosticStatus = snapshot.status ?? '';
      this.replayDiagnosticPhase = snapshot.phase ?? '';
      this.replayDiagnosticTargetMove = snapshot.targetMove ?? null;
      this.replayDiagnosticCurrentMove = snapshot.currentMove ?? null;
      this.replayDiagnosticTargetLabel = snapshot.label ?? '';
    } catch {
      localStorage.removeItem(this.replayDiagnosticStatusStorageKey);
    }
  }

  private clearReplayDiagnosticUiState(
    clearResult = false,
    force = false
  ): void {
    if (this.replayDiagnosticActive && !force) return;
    this.replayDiagnosticState = 'idle';
    this.replayDiagnosticActive = false;
    this.replayDiagnosticStep = '';
    this.replayDiagnosticStatus = '';
    this.replayDiagnosticPhase = '';
    this.replayDiagnosticTargetMove = null;
    this.replayDiagnosticCurrentMove = null;
    this.replayDiagnosticTargetLabel = '';
    if (clearResult) {
      this.replayDiagnosticResultActive = false;
      this.replayDiagnosticResultText = '';
    }
    localStorage.removeItem(this.replayDiagnosticStatusStorageKey);
  }

  getReplayDiagnosticStateLabel(): string {
    switch (this.replayDiagnosticState) {
      case 'running':
        return 'Running';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return 'Idle';
    }
  }

  private async runReplayDiagnosticPhase(
    phase: 'non-strict' | 'strict',
    strict: boolean
  ): Promise<ReplayDiagnosticSnapshot> {
    if (this.replayDiagnosticAbort) {
      return {
        phase,
        stop: 'unknown',
        moveCount: this.game.getMoveCountSnapshot(),
        replayStopReason: this.game.getReplayStopReason(),
      };
    }
    this.replayDiagnosticStep = `Running ${phase} diagnostic`;
    this.replayDiagnosticPhase = phase;
    this.replayDiagnosticCurrentMove = this.game.getMoveCountSnapshot();
    this.replayLastStopOrigin = 'system';
    this.replayDiagnosticStatus = `Preparing ${phase} replay @ N-1...`;
    this.persistReplayDiagnosticStatus();
    this.strictParityMode = strict;
    this.replayStoppedEarly = false;
    this.replayCompletedActive = false;
    this.replayDivergedActive = false;
    this.replayDivergedMessage = '';
    const targetLabel = this.replayDiagnosticTargetLabel.trim();
    const targetMove = this.replayDiagnosticTargetMove;
    const seeded =
      targetLabel && Number.isFinite(targetMove)
        ? await this.replayFromDiagnosticSeed(targetLabel, Number(targetMove))
        : false;
    if (!seeded) {
      throw new Error('Could not prepare replay diagnostic seed.');
    }
    if (this.replayDiagnosticAbort) {
      return {
        phase,
        stop: 'unknown',
        moveCount: this.game.getMoveCountSnapshot(),
        replayStopReason: this.game.getReplayStopReason(),
      };
    }
    if (!this.aiRunning) {
      this.toggleAiRun();
    }
    this.replayDiagnosticStatus = `Waiting for ${phase} stop condition...`;
    this.persistReplayDiagnosticStatus();
    const baselineSignature = this.getLatestDivergenceSignatureForDiagnostic();
    const targetMoveForStop = this.replayDiagnosticTargetMove;
    const stop = await this.waitForReplayDiagnosticStop(
      180000,
      baselineSignature,
      Number.isFinite(targetMoveForStop) ? Number(targetMoveForStop) : null
    );
    const latest = this.getLatestDivergenceSnapshotForDiagnostic();
    return {
      phase,
      stop,
      moveCount: this.game.getMoveCountSnapshot(),
      replayStopReason: this.game.getReplayStopReason(),
      divergenceMove: latest?.move,
      tsMove: latest?.tsMove,
      replayMove: latest?.wasmMove,
      tsDelta:
        typeof latest?.tsReplayScoreDelta === 'number'
          ? latest.tsReplayScoreDelta
          : undefined,
    };
  }

  private async waitForReplayDiagnosticStop(
    timeoutMs: number,
    baselineDivergenceSignature: string | null,
    targetMove: number | null
  ): Promise<ReplayDiagnosticSnapshot['stop']> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (this.replayDiagnosticAbort) return 'unknown';
      this.replayDiagnosticCurrentMove = this.game.getMoveCountSnapshot();
      this.persistReplayDiagnosticStatus();
      if (this.replayDivergedActive) return 'diverged';
      if (
        this.didDiagnosticTargetDivergeSinceSignature(baselineDivergenceSignature)
      ) {
        return 'diverged';
      }
      if (
        Number.isFinite(targetMove) &&
        targetMove !== null &&
        this.aiRunning &&
        this.replayDiagnosticCurrentMove >= targetMove + 1
      ) {
        this.lastStopOrigin = 'system';
        this.stopAi('stop');
        return 'passed-checkpoint';
      }
      if (this.replayCompletedActive) return 'completed';
      if (this.replayStoppedEarly) return 'stopped-early';
      if (this.gameOverActive && !this.aiRunning) return 'game-over';
      if (!this.aiRunning && this.replayLastStopOrigin === 'tie') return 'tie-stop';
      if (
        !this.aiRunning &&
        Number.isFinite(targetMove) &&
        targetMove !== null &&
        this.replayDiagnosticCurrentMove === targetMove
      ) {
        if (this.replayParityStatus.includes(`Replay tie at move ${targetMove}`)) {
          return 'tie-stop';
        }
        if (
          this.replayParityStatus.includes(
            `Replay parity mismatch at move ${targetMove}`
          ) ||
          this.replayParityStatus.includes(`Replay divergence at move ${targetMove}`)
        ) {
          return 'diverged';
        }
      }
      if (!this.aiRunning) return 'unknown';
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (this.aiRunning) {
      this.lastStopOrigin = 'user';
      this.stopAi('stop');
    }
    return 'timeout';
  }

  private getLatestDivergenceSnapshotForDiagnostic(): any | null {
    const raw = localStorage.getItem('aiDivergence');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private getLatestDivergenceSignatureForDiagnostic(): string | null {
    const snapshot = this.getLatestDivergenceSnapshotForDiagnostic();
    if (!snapshot) return null;
    const created = Number(
      snapshot?.createdAt ?? snapshot?.timestamp ?? snapshot?.capturedAt ?? NaN
    );
    if (Number.isFinite(created)) return `t:${created}`;
    return JSON.stringify([
      snapshot?.move ?? null,
      snapshot?.replayLabel ?? null,
      snapshot?.tsMove ?? null,
      snapshot?.wasmMove ?? null,
      snapshot?.tsReplayScoreDelta ?? null,
    ]);
  }

  private didDiagnosticTargetDivergeSinceSignature(
    baselineSignature: string | null
  ): boolean {
    const snapshot = this.getLatestDivergenceSnapshotForDiagnostic();
    if (!snapshot) return false;

    const targetMove = this.replayDiagnosticTargetMove;
    const targetLabel = this.replayDiagnosticTargetLabel;
    const snapshotMove = Number(snapshot?.move ?? NaN);
    const snapshotLabel = String(snapshot?.replayLabel ?? '').trim();
    if (
      !Number.isFinite(targetMove) ||
      !targetLabel ||
      !Number.isFinite(snapshotMove) ||
      snapshotMove !== targetMove ||
      snapshotLabel !== targetLabel
    ) {
      return false;
    }

    const currentSignature = this.getLatestDivergenceSignatureForDiagnostic();
    if (!currentSignature) return false;
    if (!baselineSignature) return true;
    return currentSignature !== baselineSignature;
  }

  private formatReplayDiagnosticReport(report: ReplayDiagnosticReport): string {
    const lines = [
      '---',
      'Replay Diagnostic Report',
      `Label: ${report.label}`,
      `Target move: ${report.targetMove}`,
      `Finished: ${new Date(report.finishedAt).toLocaleString()}`,
      '',
    ];
    for (const snapshot of report.snapshots) {
      lines.push(
        `[${snapshot.phase}] stop=${snapshot.stop} move=${snapshot.moveCount} replayStopReason=${snapshot.replayStopReason ?? ''}`
      );
      if (typeof snapshot.divergenceMove === 'number') {
        lines.push(
          `  divergenceMove=${snapshot.divergenceMove} tsMove=${snapshot.tsMove ?? ''} replayMove=${snapshot.replayMove ?? ''} tsDelta=${typeof snapshot.tsDelta === 'number' ? snapshot.tsDelta.toFixed(3) : ''}`
        );
      }
    }
    const fullyPassed = report.snapshots.every(
      (snapshot) => snapshot.stop === 'passed-checkpoint'
    );
    lines.push('');
    lines.push(
      `Verdict: ${
        fullyPassed
          ? 'PASS checkpoint in non-strict and strict (candidate to mark fixed).'
          : 'NOT PASSED (see phase stop reasons above).'
      }`
    );
    lines.push('---');
    return lines.join('\n');
  }

  private logReplayDiagnosticRun(report: ReplayDiagnosticReport): void {
    const snapshots = report.snapshots;
    const maxMove = snapshots.reduce(
      (acc, snapshot) => Math.max(acc, snapshot.moveCount),
      0
    );
    const allPassed = snapshots.every(
      (snapshot) => snapshot.stop === 'passed-checkpoint'
    );
    const nonStrict = snapshots.find((snapshot) => snapshot.phase === 'non-strict');
    const strict = snapshots.find((snapshot) => snapshot.phase === 'strict');
    const outcome = allPassed ? 'Diagnostic PASS' : 'Diagnostic NOT PASSED';
    const noteParts: string[] = [];
    if (nonStrict) noteParts.push(`non-strict:${nonStrict.stop}`);
    if (strict) noteParts.push(`strict:${strict.stop}`);
    const board = this.game.getBoardSnapshot();
    const topTiles = [...board.flat()].sort((a, b) => b - a).slice(0, 4);
    const maxTile = topTiles[0] ?? 0;
    const savedId = this.game.getSavedSpawnIdByLabelCached?.(report.label);
    const totalMovesRaw = this.game.getSavedSpawnMoveCountByLabel(report.label);
    const totalMoves =
      typeof totalMovesRaw === 'number' && Number.isFinite(totalMovesRaw)
        ? totalMovesRaw
        : 0;
    this.runHistory.addRun({
      id: `${Date.now()}-diagnostic`,
      timestamp: report.finishedAt,
      reason: 'stop',
      kind: 'diagnostic',
      outcome: noteParts.length ? `${outcome} (${noteParts.join(', ')})` : outcome,
      maxTile,
      topTiles,
      engine: this.aiEngine,
      gameMode: 'replay',
      parity: true,
      compare: true,
      depth: this.aiDepthCap,
      replayLabel: report.label,
      savedId: typeof savedId === 'number' ? savedId : undefined,
      score: this.game.getScoreSnapshot(),
      moves: maxMove,
      totalMoves: totalMoves > 0 ? totalMoves : maxMove,
      durationMs: Math.max(0, report.finishedAt - report.startedAt),
    });
    this.runHistory.refreshRuns();
  }

  private async fastForwardReplayToMove(targetMove: number): Promise<boolean> {
    const maxSteps = Math.max(1, this.game.getMoveLogLength() * 2);
    let steps = 0;
    while (this.game.getMoveCountSnapshot() < targetMove) {
      if (steps >= maxSteps) return false;
      const beforeMoves = this.game.getMoveCountSnapshot();
      const next = this.game.getReplayMove();
      if (!next) return false;
      this.game.move(next);
      steps += 1;
      if (this.game.isGameOverActive()) return false;
      const afterMoves = this.game.getMoveCountSnapshot();
      if (afterMoves < beforeMoves) return false;
      if (steps % 250 === 0) {
        this.refreshReplayUi(true);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    // Checkpoint loading should not leave the win popup in front of controls.
    this.game.dismissWin();
    this.winFromAiRun = false;
    this.refreshReplayUi(true);
    return true;
  }

  private async tryRecoverReplayEarlyStop(consumedMoves: number): Promise<boolean> {
    const replayId = this.activeReplayRecordingId ?? this.selectedReplayId;
    if (!replayId) return false;
    if (!this.game.loadSavedSpawn(replayId)) return false;
    this.game.startNewGame();
    const ok = await this.fastForwardReplayToMove(Math.max(0, consumedMoves));
    if (!ok) return false;
    this.refreshReplayUi(true);
    return true;
  }

  private extractReplayMoveFromNote(note: string): number | null {
    const text = String(note ?? '');
    const match = text.match(/move\s+(\d+)(?:\/\d+)?/i);
    if (!match) return null;
    const move = Number(match[1]);
    return Number.isFinite(move) ? move : null;
  }

  markBacklogFixed(label: string): void {
    const baseLabel = this.getBacklogBaseLabel(label);
    if (!baseLabel) return;
    const entry = this.divergenceBacklog.find(
      (item) => item.label === baseLabel
    );
    if (!entry) return;
    this.divergenceBacklog = this.divergenceBacklog.filter((item) => {
      if (item.label === baseLabel) return false;
      return !item.label.startsWith(
        `${baseLabel}${this.divergenceRefreshSeparator}`
      );
    });
    this.divergenceFixed = [
      { ...entry, note: `Fixed: ${entry.note}` },
      ...this.divergenceFixed,
    ];
    this.saveDivergenceBacklog();
    this.saveDivergenceFixed();
  }

  dismissFixedEntry(label: string): void {
    const cleaned = label.trim();
    this.divergenceFixed = this.divergenceFixed.filter(
      (entry) => entry.label !== cleaned
    );
    this.saveDivergenceFixed();
  }

  replayBacklogEntry(label: string): void {
    this.clearReplayDiagnosticUiState(true);
    const baseLabel = this.getBacklogBaseLabel(label);
    if (!baseLabel) return;
    this.markBacklogInvestigating(baseLabel);
    const match = this.game
      .getSavedSpawnsMeta()
      .find((spawn) => spawn.label === baseLabel);
    if (!match) {
      this.spawnStatus = `No saved spawns found for ${baseLabel}.`;
      return;
    }
    this.startReplayFromSavedSpawn(match.id);
  }

  canReplayFromBacklogEntryCheckpoint(entry: DivergenceEntry): boolean {
    const baseLabel = this.getBacklogBaseLabel(String(entry?.label ?? ''));
    if (!baseLabel) return false;
    const move = this.extractReplayMoveFromNote(String(entry?.note ?? ''));
    if (!move || move < 2) return false;
    return this.game
      .getSavedSpawnsMeta()
      .some((spawn) => spawn.label === baseLabel);
  }

  async replayBacklogEntryCheckpoint(entry: DivergenceEntry): Promise<void> {
    this.clearReplayDiagnosticUiState(true);
    const baseLabel = this.getBacklogBaseLabel(String(entry?.label ?? ''));
    if (!baseLabel) return;
    this.markBacklogInvestigating(baseLabel);
    const move =
      this.extractReplayMoveFromNote(String(entry?.note ?? '')) ??
      this.findLatestDivergenceMoveForLabel(baseLabel);
    if (!move || move < 2) {
      this.spawnStatus = 'Backlog entry missing replay move for N-1.';
      return;
    }
    const match = this.game
      .getSavedSpawnsMeta()
      .find((spawn) => spawn.label === baseLabel);
    if (!match) {
      this.spawnStatus = `No saved spawns found for ${baseLabel}.`;
      return;
    }
    this.replayCheckpointLoading = true;
    try {
      this.startReplayFromSavedSpawn(match.id);
      const targetMove = Math.max(0, Math.floor(move - 1));
      const ok = await this.fastForwardReplayToMove(targetMove);
      if (!ok) {
        this.spawnStatus = `Could not fast-forward replay to move ${targetMove}.`;
        return;
      }
      this.replayCheckpointArmed = true;
      const reached = this.game.getMoveCountSnapshot();
      this.spawnStatus = `Replay checkpoint loaded at move ${reached}.`;
    } finally {
      this.replayCheckpointLoading = false;
    }
  }

  private findLatestDivergenceMoveForLabel(label: string): number | null {
    const normalized = label.trim().toLowerCase();
    if (!normalized) return null;
    const candidates: Array<{ move?: number; replayLabel?: string }> = [];
    try {
      const one = JSON.parse(localStorage.getItem('aiDivergence') || 'null');
      if (one) candidates.push(one);
    } catch {}
    try {
      const many = JSON.parse(localStorage.getItem('aiDivergences') || '[]');
      if (Array.isArray(many)) {
        for (const item of many) candidates.push(item);
      }
    } catch {}
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      const item = candidates[i];
      const itemLabel = String(item?.replayLabel ?? '').trim().toLowerCase();
      const move = Number(item?.move ?? NaN);
      if (itemLabel === normalized && Number.isFinite(move)) {
        return move;
      }
    }
    return null;
  }

  replayFixedEntry(label: string): void {
    this.replayBacklogEntry(label);
  }

  private moveFixedToBacklog(label: string, note: string): void {
    const baseLabel = this.getBacklogBaseLabel(label);
    if (!baseLabel) return;
    const entry = this.divergenceFixed.find(
      (item) => item.label === baseLabel
    );
    if (!entry) return;
    this.divergenceFixed = this.divergenceFixed.filter(
      (item) => item.label !== baseLabel
    );
    this.divergenceBacklog = [
      { ...entry, note },
      ...this.divergenceBacklog,
    ];
    this.saveDivergenceBacklog();
    this.saveDivergenceFixed();
  }

  private removeDivergenceEntriesForLabel(label: string): number {
    const baseLabel = label.trim();
    if (!baseLabel) return 0;
    const refreshSeparator = this.divergenceRefreshSeparator;
    const matchesLabel = (entryLabel: string) =>
      entryLabel === baseLabel ||
      entryLabel.startsWith(`${baseLabel}${refreshSeparator}`);
    const backlogBefore = this.divergenceBacklog.length;
    const fixedBefore = this.divergenceFixed.length;
    this.divergenceBacklog = this.divergenceBacklog.filter(
      (entry) => !matchesLabel(String(entry.label ?? '').trim())
    );
    this.divergenceFixed = this.divergenceFixed.filter(
      (entry) => !matchesLabel(String(entry.label ?? '').trim())
    );
    const removed =
      backlogBefore -
      this.divergenceBacklog.length +
      (fixedBefore - this.divergenceFixed.length);
    if (removed > 0) {
      this.saveDivergenceBacklog();
      this.saveDivergenceFixed();
    }
    return removed;
  }

  private clearReplayBacklogOnCompareCompletion(label: string): void {
    if (!this.compareEngines) return;
    const replayLabel = label.trim();
    if (!replayLabel) return;
    const removed = this.removeDivergenceEntriesForLabel(replayLabel);
    if (removed <= 0) return;
    this.spawnStatus =
      `Replay compare completed. Cleared ${removed} backlog ` +
      `entr${removed === 1 ? 'y' : 'ies'} for ${replayLabel}.`;
  }

  private resolveReplayLabel(): string {
    if (this.spawnLabel) return this.spawnLabel;
    const gameLabel = this.game.getSpawnLabel();
    if (gameLabel) return gameLabel;
    const match = this.game
      .getSavedSpawnsMeta()
      .find((spawn) => spawn.id === this.selectedReplayId);
    return match?.label ?? '';
  }

  private shouldTrackPartialReplay(runMoves: number, savedMoves: number): boolean {
    // Ignore 0/1-move partials; they are usually replay-init noise, not useful divergence.
    return savedMoves > 0 && runMoves >= 2 && runMoves < savedMoves;
  }

  private startReplayFromSavedSpawn(id: string): void {
    this.suppressReplayStopPrompt = true;
    this.stopAi('stop');
    this.suppressReplayStopPrompt = false;
    this.replayStoppedEarly = false;
    this.replayCheckpointArmed = false;
    this.activeReplayRecordingId = id;
    this.replayEarlyStopRetryAttempted = false;
    this.spawnMode = 'replay';
    this.game.setSpawnMode('replay');
    const loaded = this.game.loadSavedSpawn(id);
    if (!loaded) {
      this.spawnStatus = 'Replay data missing. Save spawns first.';
      this.replayDataMissingActive = true;
      this.replayDataMissingMessage =
        'Replay data is missing. Select a valid recording or save spawns again.';
      this.savedSpawnsAvailable = false;
      return;
    }
    this.selectedReplayId = id;
    this.spawnLabel = this.game.getSpawnLabel();
    if (
      this.game.getSpawnLogLength() === 0 ||
      this.game.getMoveLogLength() === 0
    ) {
      this.replayParityStatus = 'Replay data missing. Save spawns first.';
      this.replaySavedMovesStatus = '';
      this.replayRunMovesStatus = '';
      this.spawnStatus = '';
      this.replayDataMissingActive = true;
      this.replayDataMissingMessage =
        'Replay data is missing. Select a valid recording or save spawns again.';
      this.savedSpawnsAvailable = false;
      return;
    }
    this.replayParityStatus = '';
    this.replaySavedMovesStatus = `Saved moves: ${this.game.getMoveLogLength()}`;
    this.refreshReplayUi(true);
    this.spawnStatus = this.spawnLabel
      ? `Replay ready (${this.spawnLabel}).`
      : 'Replay ready.';
    this.tiePauseStatus = '';
    this.tiePaused = false;
    this.lastTiePauseMove = null;
    this.lastTiePauseHash = null;
    this.skipTiePauseOnce = false;
    this.resumeFromTiePause = false;
    this.recordingSaved = true;
    this.savedSpawnsAvailable = true;
    this.clearDivergences();
    this.resetAiRunTrackingForNewGame();
    this.game.startNewGame();
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
    const modeChanged = this.spawnMode !== previousMode;
    const hasUnsavedRecord =
      !this.recordingSaved &&
      (this.game.getSpawnLogLength() > 0 ||
        this.game.getMoveLogLength() > 0 ||
        this.game.getMoveCountSnapshot() > 0);
    if (hasUnsavedRecord && this.spawnMode !== 'record') {
      if (!this.suppressRecordExitPrompt) {
        this.spawnMode = 'record';
        this.exitRecordAction = 'restore';
        this.resumeRecordAiOnContinue = this.pauseAiForDecisionModal();
        this.exitRecordConfirmActive = true;
        this.cdr.detectChanges();
        return;
      }
    }
    if (this.spawnMode === 'record' && previousMode !== 'record') {
      this.preRecordState = {
        spawnMode: previousMode,
        aiEngine: this.aiEngine,
        aiCompareEnabled: this.aiCompareEnabled,
        aiComparePause: this.aiComparePause,
        compareEngines: this.compareEngines,
        pauseOnDivergence: this.pauseOnDivergence,
        parityMode: this.parityMode,
        selectedReplayId: this.selectedReplayId,
        spawnLabel: this.spawnLabel,
      };
    }
    if (
      previousMode === 'record' &&
      this.spawnMode !== 'record' &&
      !this.recordingSaved &&
      (this.game.getSpawnLogLength() > 0 ||
        this.game.getMoveLogLength() > 0 ||
        this.game.getMoveCountSnapshot() > 0)
    ) {
      if (!this.suppressRecordExitPrompt) {
        this.spawnMode = 'record';
        this.exitRecordAction = 'restore';
        this.resumeRecordAiOnContinue = this.pauseAiForDecisionModal();
        this.exitRecordConfirmActive = true;
        this.cdr.detectChanges();
        return;
      }
    }
    if (
      modeChanged &&
      this.game.getMoveCountSnapshot() > 0 &&
      !this.gameOverActive &&
      !this.suppressModeChangeConfirm
    ) {
      this.pendingModeChange = this.spawnMode;
      this.spawnMode = previousMode;
      this.resumeModeChangeAiOnContinue = this.pauseAiForDecisionModal();
      this.modeChangeConfirmActive = true;
      this.cdr.detectChanges();
      return;
    }
    if (this.suppressModeChangeConfirm) {
      this.suppressModeChangeConfirm = false;
    }
    if (this.suppressRecordExitPrompt) {
      this.suppressRecordExitPrompt = false;
    }
    if (modeChanged) {
      this.clearReplayDiagnosticUiState(true);
    }
    if (this.spawnMode === 'record' && this.aiEngine !== 'wasm') {
      this.spawnMode = 'normal';
    }
    this.game.setSpawnMode(this.spawnMode);
    this.updateShadowRecording();
    if (this.spawnMode === 'replay') {
      this.stopAi('stop');
      this.savedSpawns = this.getSortedSavedSpawns();
      if (!this.selectedReplayId || !this.savedSpawns.some((s) => s.id === this.selectedReplayId)) {
        this.selectedReplayId = this.savedSpawns[0]?.id ?? null;
      }
      if (!this.selectedReplayId) {
        this.game.resetReplayState();
        this.spawnMode = 'normal';
        this.game.setSpawnMode('normal');
        this.replayParityStatus = 'Replay data missing. Save spawns first.';
        this.replaySavedMovesStatus = '';
        this.replayRunMovesStatus = '';
        this.spawnStatus = 'Replay data missing.';
        this.replayDataMissingActive = true;
        this.replayDataMissingMessage =
          'Replay data is missing. Select a valid recording or save spawns again.';
        this.savedSpawnsAvailable = false;
        this.lastSpawnMode = this.spawnMode;
        return;
      }
      this.game.loadSavedSpawn(this.selectedReplayId);
      this.spawnLabel = this.game.getSpawnLabel();
      this.replayDataMissingActive = false;
      this.replayDataMissingMessage = '';
      if (
        this.game.getSpawnLogLength() === 0 ||
        this.game.getMoveLogLength() === 0
      ) {
        this.replayParityStatus = 'Replay data missing. Save spawns first.';
        this.replaySavedMovesStatus = '';
        this.replayRunMovesStatus = '';
        this.spawnStatus = 'Replay data missing.';
        this.replayDataMissingActive = true;
        this.replayDataMissingMessage =
          'Replay data is missing. Select a valid recording or save spawns again.';
        return;
      }
      this.replayParityStatus = '';
      this.replaySavedMovesStatus = `Saved moves: ${this.game.getMoveLogLength()}`;
      this.refreshReplayUi(true);
      this.spawnStatus = this.spawnLabel
        ? `Replay ready (${this.spawnLabel}).`
        : 'Replay ready.';
      this.tiePauseStatus = '';
      this.tiePaused = false;
      this.lastTiePauseMove = null;
      this.lastTiePauseHash = null;
      this.skipTiePauseOnce = false;
      this.resumeFromTiePause = false;
      this.recordingSaved = true;
      this.savedSpawnsAvailable = this.savedSpawns.length > 0;
      if (this.aiEngine === 'ts') {
        // Safety default while stabilizing replay startup: start replay with compare OFF.
        this.aiCompareEnabled = false;
        this.aiComparePause = false;
        this.compareEngines = false;
        this.pauseOnDivergence = false;
        this.parityMode = true;
        this.updateParityMode();
        this.updateAiCompare();
      }
      this.clearDivergences();
      this.resetAiRunTrackingForNewGame();
      this.game.startNewGame();
    } else if (this.spawnMode === 'record') {
      this.stopAi('stop');
      this.game.clearRecording();
      this.replayParityStatus = 'Recording new game.';
      this.replaySavedMovesStatus = '';
      this.replayRunMovesStatus = '';
      this.spawnStatus = 'Recording spawns. Save to finalize, or abandon the recording run.';
      this.tiePauseStatus = '';
      this.tiePaused = false;
      this.lastTiePauseMove = null;
      this.lastTiePauseHash = null;
      this.skipTiePauseOnce = false;
      this.resumeFromTiePause = false;
      this.recordingSaved = false;
      this.savedSpawns = this.getSortedSavedSpawns();
      this.savedSpawnsAvailable = this.savedSpawns.length > 0;
      this.clearDivergences();
      this.resetAiRunTrackingForNewGame();
      this.game.startNewGame();
    } else {
      this.replayParityStatus = '';
      this.replaySavedMovesStatus = '';
      this.replayRunMovesStatus = '';
      this.spawnStatus = '';
      this.spawnLabel = this.game.getSpawnLabel();
      this.replayDataMissingActive = false;
      this.replayDataMissingMessage = '';
      this.savedSpawns = this.getSortedSavedSpawns();
      if (!this.selectedReplayId || !this.savedSpawns.some((s) => s.id === this.selectedReplayId)) {
        this.selectedReplayId = this.savedSpawns[0]?.id ?? null;
      }
      this.runIntegrityStatus = '';
      this.showRunIntegrityModal = false;
      this.runIntegrityIssueDetected = false;
    }
    this.lastSpawnMode = this.spawnMode;
    this.updateParityMode();
  }

  private updateShadowRecording(): void {
    const shouldEnable =
      this.spawnMode === 'normal' &&
      this.compareEngines &&
      this.pauseOnDivergence;
    const wasEnabled = this.game.isShadowRecording();
    if (shouldEnable === wasEnabled) return;
    this.game.setShadowRecording(shouldEnable);
    if (shouldEnable && !this.game.isBoardEmpty()) {
      this.spawnStatus = 'Compare+Pause enabled: restarting to record spawns.';
      this.stopAi('stop');
      this.resetAiRunTrackingForNewGame();
      this.game.startNewGame();
    }
  }

  getReplayLabel(spawn: SavedSpawnMeta): string {
    return spawn.label?.trim() ? spawn.label : 'Untitled';
  }

  onReplaySelectionChange(nextId: string): void {
    if (this.aiRunning && this.spawnMode === 'replay') {
      if (this.activeReplayRecordingId) {
        this.selectedReplayId = this.activeReplayRecordingId;
      }
      this.spawnStatus = 'Stop replay before changing Replay Recording.';
      return;
    }
    this.clearReplayDiagnosticUiState(true);
    this.selectedReplayId = nextId;
    this.game.loadSavedSpawn(nextId);
    if (this.spawnMode === 'replay') {
      this.resetAiRunTrackingForNewGame();
      this.game.startNewGame();
    }
    this.spawnLabel = this.game.getSpawnLabel();
    this.replaySavedMovesStatus = `Saved moves: ${this.game.getMoveLogLength()}`;
    this.refreshReplayUi(true);
    this.spawnStatus = this.spawnLabel
      ? `Replay ready (${this.spawnLabel}).`
      : 'Replay ready.';
  }

  private refreshReplaySelectionState(fallbackStatus: string): void {
    this.savedSpawns = this.getSortedSavedSpawns();
    this.savedSpawnsAvailable = this.savedSpawns.length > 0;
    if (
      this.selectedReplayId &&
      this.savedSpawns.some((spawn) => spawn.id === this.selectedReplayId)
    ) {
      return;
    }
    this.selectedReplayId = this.savedSpawns[0]?.id ?? null;
    if (this.spawnMode !== 'replay' || this.selectedReplayId) return;
    this.game.resetReplayState();
    this.spawnMode = 'normal';
    this.lastSpawnMode = 'normal';
    this.game.setSpawnMode('normal');
    this.spawnLabel = '';
    this.replayParityStatus = 'Replay data missing. Save spawns first.';
    this.replaySavedMovesStatus = '';
    this.replayRunMovesStatus = '';
    this.replayDataMissingActive = true;
    this.replayDataMissingMessage =
      'Replay data is missing. Select a valid recording or save spawns again.';
    this.spawnStatus = fallbackStatus;
  }

  private getSortedSavedSpawns(): SavedSpawnMeta[] {
    const divergenceLabels = this.getDivergenceLabels();
    const activeRecordLabels = new Set(
      this.runHistory
        .getRuns()
        .filter(
          (run) =>
            run.gameMode === 'record' &&
            Boolean(run.replayLabel?.trim()) &&
            true
        )
        .map((run) => run.replayLabel!.trim())
    );
    return this.game
      .getSavedSpawnsMeta()
      .filter((spawn) => {
        const label = spawn.label?.trim() ?? '';
        if (!label) return false;
        if (divergenceLabels.has(label)) return true;
        return activeRecordLabels.has(label);
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  private getDivergenceLabels(): Set<string> {
    const raw = localStorage.getItem('divergenceBacklog');
    if (!raw) return new Set();
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set();
      const labels = new Set<string>();
      for (const entry of parsed) {
        const label = String(entry?.label ?? '').trim();
        if (!label) continue;
        const base = this.getBacklogBaseLabel(label);
        if (base) labels.add(base);
      }
      return labels;
    } catch {
      return new Set();
    }
  }

  private reconcileRunsWithSavedSpawns(): void {
    const savedLabels = new Set(
      this.game
        .getSavedSpawnsMeta()
        .map((spawn) => spawn.label?.trim() ?? '')
        .filter((label) => label.length > 0)
    );
    void savedLabels;
  }

  get hasUnsavedRecordData(): boolean {
    return (
      this.spawnMode === 'record' &&
      !this.recordingSaved &&
      (this.game.getMoveLogLength() > 0 ||
        this.game.getSpawnLogLength() > 0 ||
        this.game.getMoveCountSnapshot() > 0)
    );
  }

  get runInProgress(): boolean {
    return !this.gameOverActive && (this.aiRunning || this.game.getMoveCountSnapshot() > 0);
  }

  get replayRunActive(): boolean {
    return this.spawnMode === 'replay' && this.runInProgress;
  }

  get spawnModeLocked(): boolean {
    return this.replayRunActive;
  }

  get engineLocked(): boolean {
    return this.replayRunActive;
  }

  get replaySelectionLocked(): boolean {
    return this.replayRunActive;
  }

  get restartLocked(): boolean {
    return this.hasUnsavedRecordData;
  }

  get hasRecordedSpawns(): boolean {
    return this.getSortedSavedSpawns().length > 0;
  }

  get canSaveSpawns(): boolean {
    return (
      this.spawnMode === 'record' &&
      (this.game.getMoveLogLength() > 0 ||
        this.game.getMoveCountSnapshot() > 0) &&
      !this.recordingSaved &&
      !this.aiRunning
    );
  }

  dismissReplayDataMissing(): void {
    this.replayDataMissingActive = false;
  }

  dismissConfirmStopSave(): void {
    this.confirmStopSaveActive = false;
    this.confirmStopSaveLabel = '';
    this.confirmStopSaveError = '';
    this.saveAndExitRecordPending = false;
  }

  requestAbandonNormalRun(): void {
    this.abandonNormalConfirmActive = true;
  }

  dismissAbandonNormalRun(): void {
    this.abandonNormalConfirmActive = false;
  }

  confirmAbandonNormalRun(): void {
    this.abandonNormalConfirmActive = false;
    this.performRestart();
  }

  dismissRestartConfirm(): void {
    this.restartConfirmActive = false;
  }

  confirmRestartRun(): void {
    this.restartConfirmActive = false;
    this.performRestart();
  }

  dismissModeChangeConfirm(): void {
    this.modeChangeConfirmActive = false;
    this.pendingModeChange = null;
    this.spawnMode = this.lastSpawnMode;
    const resumeAi = this.resumeModeChangeAiOnContinue;
    this.resumeModeChangeAiOnContinue = false;
    if (resumeAi && !this.aiRunning && !this.gameOverActive) {
      setTimeout(() => this.startAiLoop(false, false), 0);
    }
  }

  confirmModeChangeEndRun(): void {
    const targetMode = this.pendingModeChange ?? this.lastSpawnMode;
    this.modeChangeConfirmActive = false;
    this.pendingModeChange = null;
    this.resumeModeChangeAiOnContinue = false;
    this.performRestartBase();
    this.spawnMode = targetMode;
    this.suppressModeChangeConfirm = true;
    this.updateSpawnMode();
  }

  dismissExitRecordConfirm(): void {
    this.exitRecordConfirmActive = false;
    this.exitRecordAction = 'restore';
    this.resumeRecordAiOnContinue = false;
  }

  requestAbandonRecord(): void {
    this.exitRecordAction = 'restore';
    this.resumeRecordAiOnContinue = this.pauseAiForDecisionModal();
    this.exitRecordConfirmActive = true;
  }

  confirmExitRecordWithoutSaving(): void {
    this.exitRecordConfirmActive = false;
    this.resumeRecordAiOnContinue = false;
    this.game.clearRecording();
    this.recordingSaved = false;
    if (this.exitRecordAction === 'restart') {
      this.exitRecordAction = 'restore';
      this.suppressRecordExitPrompt = true;
      this.stopAi('stop');
      this.replayStoppedEarly = false;
      this.resetAiRunTracking();
      this.clearDivergences();
      this.game.startNewGame();
      this.winFromAiRun = false;
      this.applyDefaultAiConfig();
      this.autoBoostStage = 0;
      this.clearHint();
      this.spawnMode = 'normal';
      this.updateSpawnMode();
      return;
    }
    const snapshot = this.preRecordState;
    this.suppressRecordExitPrompt = true;
    if (snapshot) {
      this.spawnMode = snapshot.spawnMode;
      this.aiEngine = snapshot.aiEngine;
      this.aiCompareEnabled = snapshot.aiCompareEnabled;
      this.aiComparePause = snapshot.aiComparePause;
      this.compareEngines = snapshot.compareEngines;
      this.pauseOnDivergence = snapshot.pauseOnDivergence;
      this.parityMode = snapshot.parityMode;
      this.selectedReplayId = snapshot.selectedReplayId;
      this.spawnLabel = snapshot.spawnLabel;
      this.updateAiCompare();
      this.updateParityMode();
    } else {
      this.spawnMode = 'normal';
    }
    this.updateSpawnMode();
    this.resetAiRunTrackingForNewGame();
    this.game.startNewGame();
  }

  continueRecordRun(): void {
    this.exitRecordConfirmActive = false;
    this.spawnMode = 'record';
    const resumeAi = this.resumeRecordAiOnContinue;
    this.resumeRecordAiOnContinue = false;
    setTimeout(() => {
      if (this.spawnModeSelect?.nativeElement) {
        this.spawnModeSelect.nativeElement.value = 'record';
      }
      this.cdr.detectChanges();
      if (resumeAi && !this.aiRunning && !this.gameOverActive) {
        this.startAiLoop();
      }
    }, 0);
  }

  updateConfirmStopSaveLabel(): void {
    const label = this.confirmStopSaveLabel.trim();
    if (!label) {
      this.confirmStopSaveError = 'Replay label is required.';
      return;
    }
    const normalized = label.toLowerCase();
    const exists = this.runHistory.getRuns().some(
      (run) =>
        run.gameMode === 'record' &&
        (run.replayLabel?.trim().toLowerCase() ?? '') === normalized
    );
    this.confirmStopSaveError = exists ? 'Replay label already exists.' : '';
  }

  dismissDivergenceLabelBlocked(): void {
    this.divergenceLabelBlockedActive = false;
  }

  get isRecordingLocked(): boolean {
    return this.spawnMode === 'record' && this.recordingSaved;
  }

  get isRecordManualLocked(): boolean {
    return this.spawnMode === 'record' && !this.recordingSaved;
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
    if (
      this.spawnMode === 'record' &&
      !this.aiRunning &&
      !this.gameOverActive &&
      this.game.getMoveCountSnapshot() > 0
    ) {
      this.confirmStopSaveLabel = '';
      this.confirmStopSaveError = '';
      this.confirmStopSaveActive = true;
      return;
    }
    this.confirmStopSaveLabel = '';
    this.confirmStopSaveError = '';
    this.confirmStopSaveActive = true;
  }

  confirmSaveStoppedRun(): void {
    const label = this.confirmStopSaveLabel.trim();
    if (!label) {
      this.confirmStopSaveError = 'Replay label is required.';
      return;
    }
    const normalized = label.toLowerCase();
    if (this.runHistory.getRuns().some(
      (run) =>
        run.gameMode === 'record' &&
        (run.replayLabel?.trim().toLowerCase() ?? '') === normalized
    )) {
      this.confirmStopSaveError = 'Replay label already exists.';
      return;
    }
    this.confirmStopSaveActive = false;
    this.confirmStopSaveLabel = '';
    this.confirmStopSaveError = '';
    this.saveSpawnLogWithLabel(label, 'From Stopped Run');
    this.stopAi('stop');
    if (this.saveAndExitRecordPending) {
      const snapshot = this.preRecordState;
      this.saveAndExitRecordPending = false;
      if (snapshot) {
        this.spawnMode = snapshot.spawnMode;
        this.aiEngine = snapshot.aiEngine;
        this.aiCompareEnabled = snapshot.aiCompareEnabled;
        this.aiComparePause = snapshot.aiComparePause;
        this.compareEngines = snapshot.compareEngines;
        this.pauseOnDivergence = snapshot.pauseOnDivergence;
        this.parityMode = snapshot.parityMode;
        this.selectedReplayId = snapshot.selectedReplayId;
        this.spawnLabel = snapshot.spawnLabel;
        this.updateAiCompare();
        this.updateParityMode();
      } else {
        this.spawnMode = 'normal';
      }
    } else {
      this.spawnMode = 'normal';
    }
    this.updateSpawnMode();
    this.resetAiRunTrackingForNewGame();
    this.game.startNewGame();
  }

  get canConfirmStopSave(): boolean {
    const label = this.confirmStopSaveLabel.trim();
    if (!label) return false;
    const normalized = label.toLowerCase();
    return !this.runHistory.getRuns().some(
      (run) =>
        run.gameMode === 'record' &&
        (run.replayLabel?.trim().toLowerCase() ?? '') === normalized
    );
  }

  continueStoppedRun(): void {
    this.confirmStopSaveActive = false;
    this.confirmStopSaveLabel = '';
    this.saveAndExitRecordPending = false;
    if (!this.aiRunning && !this.gameOverActive) {
      this.startAiLoop();
    }
  }

  saveAndExitRecord(): void {
    this.exitRecordConfirmActive = false;
    this.saveAndExitRecordPending = true;
    this.confirmStopSaveLabel = '';
    this.confirmStopSaveError = '';
    this.confirmStopSaveActive = true;
  }

  private saveSpawnLogWithLabel(label: string, outcome?: string): void {
    const cleanedLabel = label.trim();
    const invalidLabels = new Set([
      'replay label already exists',
      'good. duplicate replay label could not be created',
    ]);
    if (invalidLabels.has(cleanedLabel.toLowerCase())) {
      this.confirmStopSaveError = 'Replay label is invalid.';
      return;
    }
    if (cleanedLabel.toLowerCase().startsWith('divergence m')) {
      this.addDivergenceBacklog(
        cleanedLabel,
        'Blocked record label: divergence labels must live in backlog.'
      );
      this.divergenceLabelBlockedActive = true;
      this.divergenceLabelBlockedMessage =
        'This label is reserved for divergence diagnostics. A backlog entry was created instead. Please choose a different label for a record run.';
      return;
    }
    const savedEntry = this.game.saveSpawnLog(label, { archiveRecord: true });
    this.spawnLabel = cleanedLabel;
    if (cleanedLabel) {
      const savedId = savedEntry?.savedId ?? undefined;
      this.runHistory.updateLatestRecordLabel(cleanedLabel, savedId);
    }
    this.ensureRunLoggedIfMissing('stop', undefined, undefined, outcome);
    this.savedSpawns = this.getSortedSavedSpawns();
    this.selectedReplayId =
      this.game.getCurrentSavedSpawnId() ?? this.savedSpawns[0]?.id ?? null;
    const labelText = cleanedLabel ? ` (${cleanedLabel})` : '';
    this.spawnStatus = `Recorded ${this.game.getMoveLogLength()} moves${labelText}.`;
    this.tiePauseStatus = '';
    this.tiePaused = false;
    this.lastTiePauseMove = null;
    this.lastTiePauseHash = null;
    this.skipTiePauseOnce = false;
    this.resumeFromTiePause = false;
    this.recordingSaved = true;
    this.savedSpawnsAvailable = this.savedSpawns.length > 0;
    this.spawnStatus = 'Recording saved. Restart to record a new run.';
    this.stopAi('stop');
  }

  private buildBatchRecordLabel(): string {
    const score = this.game.getScoreSnapshot();
    const maxTile = Math.max(...this.game.getBoardSnapshot().flat());
    const base = `Batch ${new Date().toISOString()} s${score} t${maxTile}`;
    const existing = new Set(
      this.runHistory
        .getRuns()
        .filter((run) => run.gameMode === 'record')
        .map((run) => (run.replayLabel?.trim().toLowerCase() ?? ''))
        .filter((label) => Boolean(label))
    );
    if (!existing.has(base.toLowerCase())) return base;
    let counter = 2;
    while (existing.has(`${base} #${counter}`.toLowerCase())) {
      counter += 1;
    }
    return `${base} #${counter}`;
  }

  private autoSaveBatchRecordRun(): void {
    if (this.spawnMode !== 'record') return;
    if (this.recordingSaved) return;
    if (
      this.game.getMoveLogLength() === 0 &&
      this.game.getSpawnLogLength() === 0
    ) {
      return;
    }
    const label = this.buildBatchRecordLabel();
    const savedEntry = this.game.saveSpawnLog(label, { archiveRecord: true });
    this.spawnLabel = label;
    void savedEntry;
    this.savedSpawns = this.getSortedSavedSpawns();
    this.savedSpawnsAvailable = this.savedSpawns.length > 0;
    this.recordingSaved = true;
    this.spawnStatus = `Auto-saved record run (${label}).`;
  }

  private logReplayDivergenceRun(
    replayLabel: string,
    moveIndex: number,
    savedMoves: number
  ): void {
    const label = replayLabel.trim();
    if (!label) return;
    const savedId = this.game.getSavedSpawnIdByLabelCached(label) ?? undefined;
    const score = this.game.getScoreSnapshot();
    const board = this.game.getBoardSnapshot();
    const maxTile = Math.max(...board.flat());
    const topTiles = [...board.flat()].sort((a, b) => b - a).slice(0, 4);
    const existing = this.runHistory.getRuns().some(
      (run) =>
        run.gameMode === 'replay' &&
        (run.replayLabel?.trim() ?? '') === label &&
        run.moves === moveIndex &&
        run.maxTile === maxTile &&
        run.score === score &&
        run.outcome === 'Diverged'
    );
    if (existing) return;
    this.runHistory.addRun({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      reason: 'stop',
      outcome: 'Diverged',
      maxTile,
      topTiles,
      engine: this.aiEngine,
      gameMode: 'replay',
      parity: this.parityMode,
      compare: this.compareEngines,
      depth: this.aiEngine === 'ts' ? this.aiDepthCap : this.aiMindepth,
      replayLabel: label,
      savedId,
      score,
      moves: moveIndex,
      totalMoves: savedMoves,
      durationMs: this.aiRunAccumulatedMs,
    });
  }

  private promptSaveRecordingOnGameOver(): void {
    if (
      this.spawnMode !== 'record' ||
      this.recordingSaved ||
      !this.canSaveSpawns
    ) {
      return;
    }
    const label = window.prompt('Label for saved spawns (required):', '');
    if (label === null) return;
    const cleaned = label.trim();
    if (!cleaned) {
      this.spawnStatus = 'Replay label required to save recording.';
      return;
    }
    this.saveSpawnLogWithLabel(cleaned);
  }


  updateBatchTotal(): void {
    if (this.batchRemaining < 1) {
      this.batchRemaining = 1;
    }
    this.batchTotal = this.batchRemaining;
  }

  async stepAi(source: 'manual' | 'auto' = 'auto'): Promise<void> {
    if (this.aiStepInFlight) return;
    if (source === 'manual' && this.isRecordManualLocked) {
      this.spawnStatus = 'Recording in progress. Manual steps are disabled.';
      return;
    }
    if (this.isRecordingLocked) {
      this.spawnStatus = 'Recording saved. Restart to record a new run.';
      return;
    }
    if (this.gameOverActive) return;
    this.aiStepInFlight = true;
    const runToken = this.aiRunToken;
    if (this.spawnMode === 'replay') {
      try {
        this.lastRunMode = 'replay';
        const board = this.game.getBoardSnapshot();
        const skipTieChecks = this.skipTiePauseOnce || this.resumeFromTiePause;
        if (this.skipTiePauseOnce) {
          this.skipTiePauseOnce = false;
        }
        if (this.resumeFromTiePause) {
          this.resumeFromTiePause = false;
        }
        const replayMove = this.game.getReplayMove();
        if (!replayMove) {
          const replayLabel = this.spawnLabel || this.game.getSpawnLabel();
          const savedMoves = this.game.getMoveLogLength();
          const runMoves = this.game.getMoveCountSnapshot();
          const replayStopReason = this.game.getReplayStopReason();
          if (savedMoves > 0 && runMoves < savedMoves) {
            console.warn('Replay early-stop state:', this.game.getReplayDebugState());
            if (!this.replayEarlyStopRetryAttempted) {
              this.replayEarlyStopRetryAttempted = true;
              const recovered = await this.tryRecoverReplayEarlyStop(runMoves);
              if (recovered) {
                this.spawnStatus = `Recovered replay cursor at move ${this.game.getMoveCountSnapshot()}.`;
                return;
              }
            }
          }
          const completedReplay =
            replayStopReason !== 'spawn-mismatch' &&
            savedMoves > 0 &&
            runMoves >= savedMoves;
          let replayLogState: 'added' | 'existing' | 'skipped' = 'skipped';
          if (replayStopReason === 'spawn-mismatch') {
            this.addDivergenceBacklog(
              replayLabel,
              `Replay spawn mismatch at move ${runMoves}/${savedMoves}`
            );
            this.replayRunLoggedAtCompletion = true;
            this.replayParityStatus = `Replay spawn mismatch at move ${runMoves}`;
            this.spawnStatus = `Replay spawn mismatch at move ${runMoves} / ${savedMoves}.`;
          } else if (this.shouldTrackPartialReplay(runMoves, savedMoves)) {
            this.addDivergenceBacklog(
              replayLabel,
              `Partial replay: ${runMoves} / ${savedMoves} moves`
            );
            this.replayRunLoggedAtCompletion = true;
            this.spawnStatus = `Partial replay (not logged): ${runMoves} / ${savedMoves} moves.`;
          } else if (savedMoves > 0 && runMoves < savedMoves) {
            this.replayRunLoggedAtCompletion = true;
            this.spawnStatus = `Replay ended too early (${runMoves} / ${savedMoves}); backlog entry skipped.`;
          } else if (!this.replayRunLoggedAtCompletion) {
            replayLogState = this.ensureRunLoggedIfMissing(
              'stop',
              'replay',
              replayLabel
            );
            this.runHistory.refreshRuns();
            this.replayRunLoggedAtCompletion = true;
          }
          if (completedReplay) {
            this.clearReplayBacklogOnCompareCompletion(replayLabel);
            this.replayCompletedMessage =
              replayLogState === 'existing'
                ? `Replay completed: ${runMoves} / ${savedMoves} moves consumed. This replay is already in Runs.`
                : `Replay completed: ${runMoves} / ${savedMoves} moves consumed.`;
            this.replayCompletedActive = true;
          }
          // Replay exhaustion toggles game-over in the service; clear it here so
          // replay remains in replay mode and can be restarted cleanly.
          this.game.dismissGameOver();
          this.gameOverDismissed = true;
          this.gameOverActive = false;
          this.lastStopOrigin = 'replay-exhausted';
          this.stopAi('stop');
          this.replayParityStatus = '';
          this.replaySavedMovesStatus = '';
          this.replayRunMovesStatus = '';
          if (!(completedReplay && this.compareEngines)) {
            this.spawnStatus = '';
          }
          return;
        }
        const replayCompareActive =
          this.spawnMode === 'replay' &&
          this.aiEngine === 'ts' &&
          this.compareEngines;
        if (replayCompareActive) {
          const tsDepthLimit = this.getTsCompareDepthLimit();
          const strictReplay = this.strictParityMode;
          const tsScoresCached = this.ai.getTsScores(board, tsDepthLimit);
          let tsScores = tsScoresCached;
          let tsScoresNoCacheDecision:
            | { direction: Direction; score: number }[]
            | undefined;
          let tsMove = this.getBestMoveFromScores(
            tsScores,
            strictReplay ? 0 : undefined
          );
          let bestMoves = tsScores.length
            ? this.getReplayCompareBestMoveSet(tsScores)
            : new Set<Direction>();
          const strictReplayMatch = Boolean(tsMove && tsMove === replayMove);
          const replayWithinThreshold = bestMoves.has(replayMove);
          let replayMatch = strictReplay ? strictReplayMatch : replayWithinThreshold;
          if (!replayMatch && tsMove && tsMove !== replayMove) {
            tsScoresNoCacheDecision = this.ai.getTsScoresNoCache(
              board,
              tsDepthLimit
            );
            const tsNoCacheMove = this.getBestMoveFromScores(
              tsScoresNoCacheDecision,
              strictReplay ? 0 : undefined
            );
            if (tsNoCacheMove === replayMove) {
              const cachedScoreMap = this.toScoreMap(tsScoresCached) ?? {};
              const noCacheScoreMap =
                this.toScoreMap(tsScoresNoCacheDecision) ?? {};
              const cachedGap =
                (cachedScoreMap[tsMove] ?? NaN) -
                (cachedScoreMap[replayMove] ?? NaN);
              const noCacheReplaySupport =
                (noCacheScoreMap[replayMove] ?? NaN) -
                (noCacheScoreMap[tsMove] ?? NaN);
              const shouldAdoptNoCacheDecision =
                Number.isFinite(cachedGap) &&
                Number.isFinite(noCacheReplaySupport) &&
                cachedGap <= 192 &&
                noCacheReplaySupport >= 40;
              if (shouldAdoptNoCacheDecision) {
                tsScores = tsScoresNoCacheDecision;
                tsMove = tsNoCacheMove;
                const noCacheBestMoves = this.getReplayCompareBestMoveSet(tsScores);
                bestMoves = noCacheBestMoves;
                const strictNoCacheMatch = Boolean(tsMove && tsMove === replayMove);
                const noCacheWithinThreshold = noCacheBestMoves.has(replayMove);
                replayMatch = strictReplay
                  ? strictNoCacheMatch
                  : noCacheWithinThreshold;
              }
            }
          }
          if (!replayMatch && tsMove && tsMove !== replayMove) {
            if (!tsScores.length) {
              tsScores = this.ai.getTsScores(board, tsDepthLimit);
            }
            replayMatch = await this.shouldAcceptStrictReplayNearTie(
              board,
              tsScores,
              tsMove,
              replayMove
            );
          }
          const replayTie = bestMoves.size > 1 && replayWithinThreshold;
          if (!skipTieChecks && replayTie && tsMove) {
            const moveIndex = this.game.getMoveCountSnapshot();
            const tsBest = [...bestMoves];
            const tieScoreMap = this.toScoreMap(tsScores) ?? {};
            const tsSelectedScore = tieScoreMap[tsMove];
            const replayScore = tieScoreMap[replayMove];
            const tieDelta =
              typeof tsSelectedScore === 'number' && typeof replayScore === 'number'
                ? tsSelectedScore - replayScore
                : null;
            const tieDeltaText =
              tieDelta !== null ? tieDelta.toFixed(3) : '';
            const status =
              `Tie at move ${moveIndex}: ` +
              `engine=${this.aiEngine} ` +
              `best=${tsBest.join(', ')} | selected=${replayMove}` +
              (tieDeltaText ? ` | tsDelta=${tieDeltaText}` : '');
            const exactTieAccepted =
              tieDelta !== null &&
              Math.abs(tieDelta) <= this.strictReplayTieAcceptDelta &&
              bestMoves.has(replayMove);
            const tieAccepted = strictReplay
              ? exactTieAccepted
              : bestMoves.has(replayMove);
            if (tieAccepted) {
              this.replayParityStatus =
                `Replay tie accepted at move ${moveIndex} (selected=${replayMove}, tsDelta=${tieDeltaText}).`;
              this.tiePauseStatus = '';
              this.tiePaused = false;
              this.lastTiePauseMove = moveIndex;
              this.lastTiePauseHash = board.flat().join(',');
              this.resumeFromTiePause = false;
              this.skipTiePauseOnce = false;
              if (this.aiDebugEnabled) {
                console.info(status + ' -> accepted');
              }
            } else {
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
                const replayLabel = this.resolveReplayLabel();
                const savedMoves = this.game.getMoveLogLength();
                this.replayParityStatus = `Replay tie at move ${moveIndex}`;
                const note =
                  savedMoves > 0
                    ? `Replay tie at move ${moveIndex}/${savedMoves} | best=${tsBest.join(
                        ','
                      )} | replay=${replayMove}` +
                      (tieDeltaText ? ` | tsDelta=${tieDeltaText}` : '')
                    : `Replay tie at move ${moveIndex} | best=${tsBest.join(
                        ','
                      )} | replay=${replayMove}` +
                      (tieDeltaText ? ` | tsDelta=${tieDeltaText}` : '');
                this.addDivergenceBacklog(replayLabel, note);
                this.moveFixedToBacklog(replayLabel, note);
                this.spawnStatus =
                  savedMoves > 0
                    ? `Replay tie detected: ${moveIndex} / ${savedMoves}.`
                    : `Replay tie detected at move ${moveIndex}.`;
                this.lastStopOrigin = 'tie';
                this.stopAi('stop');
                return;
              }
            }
          }
          if (!replayMatch && tsMove && tsMove !== replayMove) {
            const moveIndex = this.game.getMoveCountSnapshot();
            if (moveIndex <= 1) {
              this.replayParityStatus =
                `Replay parity mismatch at move ${moveIndex} ignored (bootstrap policy).`;
            } else {
            const tsScoreMap = this.toScoreMap(tsScores);
            let tsScoresCpp: { direction: Direction; score: number }[] | undefined;
            let tsCppScoreMap: Record<string, number> | undefined;
            let tsScoresNoCache: { direction: Direction; score: number }[] | undefined;
            let tsNoCacheScoreMap: Record<string, number> | undefined;
            let wasmScores: { direction: Direction; score: number }[] | undefined;
            let wasmScoreMap: Record<string, number> | undefined;
            let tsCurrentBreakdown:
              | ReturnType<typeof computeHeuristicBreakdown>
              | undefined;
            let tsPostMoveBreakdowns:
              | Record<string, ReturnType<typeof computeHeuristicBreakdown>>
              | undefined;
            let distinctTileCount: number | undefined;
            let wasmMindepth: number | undefined;
            let tsDepthSweep:
              | Array<{
                  depth: number;
                  bestMove: Direction | null;
                  tsMoveScore: number | null;
                  replayMoveScore: number | null;
                }>
              | undefined;
            let wasmDepthSweep:
              | Array<{
                  depth: number;
                  bestMove: Direction | null;
                  tsMoveScore: number | null;
                  replayMoveScore: number | null;
                }>
              | undefined;
            if (this.aiDebugEnabled) {
              wasmScores = await this.ai.getWasmScores(board);
              tsScoresCpp = tsScoresCached;
              tsCppScoreMap = this.toScoreMap(tsScoresCpp);
              tsScoresNoCache =
                tsScoresNoCacheDecision ?? this.ai.getTsScoresNoCache(board, tsDepthLimit);
              tsNoCacheScoreMap = this.toScoreMap(tsScoresNoCache);
              wasmScoreMap = this.toScoreMap(wasmScores);
              tsCurrentBreakdown = computeHeuristicBreakdown(board);
              tsPostMoveBreakdowns = this.computeTsPostMoveBreakdowns(board);
              distinctTileCount = this.getDistinctTileCount(board);
              wasmMindepth = this.ai.getWrkrConfig().mindepth;
              tsDepthSweep = this.computeTsDepthSweep(
                board,
                tsMove,
                replayMove
              );
              wasmDepthSweep = await this.computeWasmDepthSweep(
                board,
                tsMove,
                replayMove
              );
            }
            this.replayParityStatus = `Replay parity mismatch at move ${moveIndex}`;
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
              console.log('TS heuristic breakdown:', tsCurrentBreakdown);
              console.log('TS heuristic breakdowns (post-move):', tsPostMoveBreakdowns);
            }
            const snapshot = {
              move: this.game.getMoveCountSnapshot(),
              replayLabel: this.resolveReplayLabel(),
              board,
              tsScores,
              tsScoresCpp,
              tsScoresNoCache,
              wasmScores,
              tsScoreMap,
              tsCppScoreMap,
              tsNoCacheScoreMap,
              wasmScoreMap,
              tsCurrentBreakdown,
              tsPostMoveBreakdowns,
              tsDepthUsed: tsDepthLimit,
              wasmMindepth,
              distinctTileCount,
              tsDepthSweep,
              wasmDepthSweep,
              tsReplayScoreDelta:
                (tsScoreMap?.[tsMove] ?? NaN) -
                (tsScoreMap?.[replayMove] ?? NaN),
              tsCppReplayScoreDelta:
                (tsCppScoreMap?.[tsMove] ?? NaN) -
                (tsCppScoreMap?.[replayMove] ?? NaN),
              tsNoCacheReplayScoreDelta:
                (tsNoCacheScoreMap?.[tsMove] ?? NaN) -
                (tsNoCacheScoreMap?.[replayMove] ?? NaN),
              wasmReplayScoreDelta:
                wasmScoreMap && tsMove in wasmScoreMap && replayMove in wasmScoreMap
                  ? wasmScoreMap[tsMove] - wasmScoreMap[replayMove]
                  : undefined,
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
            this.divergenceStatus = `Replay divergence at move ${moveIndex}.`;
            this.divergenceDetails = `Replay=${replayMove ?? 'null'} | TS=${tsMove ?? 'null'}`;
            if (this.autoSaveDivergenceEnabled) {
              const label = this.resolveReplayLabel();
              if (label) {
                const savedMoves = this.game.getMoveLogLength();
                const note =
                  savedMoves > 0
                    ? `Replay divergence at move ${moveIndex}/${savedMoves}`
                    : `Replay divergence at move ${moveIndex}`;
                this.addDivergenceBacklog(label, note);
                this.moveFixedToBacklog(label, note);
              }
            }
            const replayLabel = this.resolveReplayLabel();
            const savedMoves = this.game.getMoveLogLength();
            this.logReplayDivergenceRun(replayLabel, moveIndex, savedMoves);
            this.replayDivergedMessage =
              savedMoves > 0
                ? `Replay divergence: ${moveIndex} / ${savedMoves} moves consumed.`
                : `Replay divergence: ${moveIndex} moves consumed.`;
            this.spawnStatus = this.replayDivergedMessage;
            this.lastStopOrigin = 'divergence';
            this.stopAi('stop');
            return;
            }
        }
        }
        this.game.move(replayMove);
        this.refreshReplayUi();
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
          if (this.pauseOnDivergence && !isTie) {
            const moveIndex = this.game.getMoveCountSnapshot();
            const otherEngine = this.aiEngine === 'ts' ? 'wasm' : 'ts';
            this.divergenceStatus = `AI divergence at move ${moveIndex}.`;
            this.divergenceDetails = `${this.aiEngine}=${primary ?? 'null'} | ${otherEngine}=${other ?? 'null'}`;
            if (this.autoSaveDivergenceEnabled) {
              const label = `Divergence m${moveIndex} ${this.aiEngine.toUpperCase()}-${otherEngine.toUpperCase()} ${new Date().toLocaleString()}`;
              if (this.spawnMode === 'record' && this.canSaveSpawns) {
                this.saveSpawnLogWithLabel(label);
                this.addDivergenceBacklog(label, `Auto-saved at move ${moveIndex}`);
              } else if (this.game.isShadowRecording()) {
                this.saveSpawnLogWithLabel(label);
                this.addDivergenceBacklog(label, `Auto-saved at move ${moveIndex}`);
              }
            }
            this.stopAi('stop');
          }
        }
      } else {
        const tsNormalParityLocked =
          this.aiEngine === 'ts' &&
          this.spawnMode === 'normal' &&
          this.parityMode;
        if (tsNormalParityLocked) {
          const tsDepthLimit = this.getTsParityAlignedDepthLimit(board);
          const tsScores = this.ai.getTsScores(board, tsDepthLimit);
          nextMove = this.getBestMoveFromScores(tsScores);
        } else {
          nextMove = await this.ai.getMove(board);
        }
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
      this.lastRunMode = this.spawnMode;
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
    if (this.isRecordManualLocked) {
      this.spawnStatus = 'Recording in progress. Hints are disabled.';
      return;
    }
    if (this.isRecordingLocked) {
      this.spawnStatus = 'Recording saved. Restart to record a new run.';
      return;
    }
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
      if (
        reason !== 'stop' &&
        shouldSummarize &&
        this.spawnMode !== 'replay'
      ) {
        this.updateAiSummary(reason);
      }
    }
    this.aiRunning = false;
    if (reason === 'stop') {
      this.batchRemaining = this.batchTotal;
    }

    if (reason === 'stop' && this.spawnMode === 'replay') {
      const savedMoves = this.game.getMoveLogLength();
      const usedMoves = this.game.getMoveCountSnapshot();
      if (
        !this.suppressReplayStopPrompt &&
        (this.lastStopOrigin === 'user' ||
          this.lastStopOrigin === 'replay-exhausted') &&
        savedMoves > 0 &&
        usedMoves < savedMoves
      ) {
        this.replayStoppedEarly = true;
        this.replayStoppedEarlyMessage =
          `Replay stopped early: ${usedMoves} / ${savedMoves} moves consumed.`;
      }
    }

    this.replayLastStopOrigin = this.lastStopOrigin;
    this.lastStopOrigin = 'system';
    this.replayLastStopOrigin = 'system';

    if (reason === 'game-over') {
      const wasReplay = this.spawnMode === 'replay';
      if (wasReplay) {
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
    scores: { direction: Direction; score: number }[],
    epsilonFloor = 1
  ): Direction | null {
    if (!scores.length) return null;
    let bestScore = -Infinity;
    for (const entry of scores) {
      if (entry.score > bestScore) bestScore = entry.score;
    }
    const epsilon =
      epsilonFloor <= 0 ? 0 : Math.max(epsilonFloor, Math.abs(bestScore) * 1e-6);
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
    quantizeStep?: number,
    epsilonFloor = 1
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
    const epsilon = Math.max(epsilonFloor, Math.abs(bestScore) * 1e-6);
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

  private getReplayCompareBestMoveSet(
    scores: { direction: Direction; score: number }[]
  ): Set<Direction> {
    return this.getBestMoveSet(scores, 1, this.replayNonStrictDelta);
  }

  private toScoreMap(
    scores?: { direction: Direction; score: number }[]
  ): Record<string, number> | undefined {
    if (!scores?.length) return undefined;
    return Object.fromEntries(
      scores.map((entry) => [entry.direction, Number(entry.score)])
    );
  }

  private computeTsPostMoveBreakdowns(
    board: Board
  ): Record<string, ReturnType<typeof computeHeuristicBreakdown>> {
    const directions: Direction[] = ['up', 'down', 'left', 'right'];
    const perMove: Record<string, ReturnType<typeof computeHeuristicBreakdown>> =
      {};
    for (const dir of directions) {
      const rows = boardToRows(board);
      const move = applyMove(rows, dir);
      if (!move.moved) continue;
      const nextBoard = rowsToGrid(move.rows);
      perMove[dir] = computeHeuristicBreakdown(nextBoard);
    }
    return perMove;
  }

  private getDistinctTileCount(board: Board): number {
    const distinct = new Set<number>();
    for (const row of board) {
      for (const cell of row) {
        if (cell > 0) distinct.add(cell);
      }
    }
    return distinct.size;
  }

  private computeTsDepthSweep(
    board: Board,
    tsMove: Direction,
    replayMove: Direction
  ): Array<{
    depth: number;
    bestMove: Direction | null;
    tsMoveScore: number | null;
    replayMoveScore: number | null;
  }> {
    const sweep: Array<{
      depth: number;
      bestMove: Direction | null;
      tsMoveScore: number | null;
      replayMoveScore: number | null;
    }> = [];
    const maxDepth = 8;
    for (let depth = 2; depth <= maxDepth; depth += 1) {
      const scores = this.ai.getTsScores(board, depth);
      const scoreMap = this.toScoreMap(scores);
      sweep.push({
        depth,
        bestMove: this.getBestMoveFromScores(scores, 0),
        tsMoveScore: scoreMap?.[tsMove] ?? null,
        replayMoveScore: scoreMap?.[replayMove] ?? null,
      });
    }
    return sweep;
  }

  private async computeWasmDepthSweep(
    board: Board,
    tsMove: Direction,
    replayMove: Direction
  ): Promise<
    Array<{
      depth: number;
      bestMove: Direction | null;
      tsMoveScore: number | null;
      replayMoveScore: number | null;
    }>
  > {
    const sweep: Array<{
      depth: number;
      bestMove: Direction | null;
      tsMoveScore: number | null;
      replayMoveScore: number | null;
    }> = [];
    const maxDepth = 8;
    const directions: Direction[] = ['up', 'down', 'left', 'right'];
    for (let depth = 2; depth <= maxDepth; depth += 1) {
      const scores = await this.ai.getWasmScoresAtDepth(board, depth);
      const scoreMap = this.toScoreMap(scores);
      let bestMove: Direction | null = null;
      let bestScore = -Infinity;
      for (const dir of directions) {
        const score = scoreMap?.[dir];
        if (typeof score !== 'number') continue;
        if (score > bestScore) {
          bestScore = score;
          bestMove = dir;
        }
      }
      sweep.push({
        depth,
        bestMove,
        tsMoveScore: scoreMap?.[tsMove] ?? null,
        replayMoveScore: scoreMap?.[replayMove] ?? null,
      });
    }
    return sweep;
  }

  private async shouldAcceptStrictReplayNearTie(
    board: Board,
    tsScores: { direction: Direction; score: number }[],
    tsMove: Direction,
    replayMove: Direction
  ): Promise<boolean> {
    const tsScoreMap = this.toScoreMap(tsScores);
    const tsMoveScore = tsScoreMap?.[tsMove];
    const replayScore = tsScoreMap?.[replayMove];
    if (
      typeof tsMoveScore !== 'number' ||
      typeof replayScore !== 'number'
    ) {
      return false;
    }
    const tsGap = tsMoveScore - replayScore;
    if (tsGap <= 0 || tsGap > this.strictReplayNearTieDelta) {
      return false;
    }
    const wasmScores = await this.ai.getWasmScores(board);
    const wasmScoreMap = this.toScoreMap(wasmScores);
    const wasmTsMoveScore = wasmScoreMap?.[tsMove];
    const wasmReplayScore = wasmScoreMap?.[replayMove];
    if (
      typeof wasmTsMoveScore !== 'number' ||
      typeof wasmReplayScore !== 'number'
    ) {
      return false;
    }
    const wasmBestScore = Math.max(...wasmScores.map((entry) => entry.score));
    const tsIsWasmTop =
      wasmBestScore - wasmTsMoveScore <= this.strictReplayWasmTopTolerance;
    const replayIsWasmTop =
      wasmBestScore - wasmReplayScore <= this.strictReplayWasmTopTolerance;
    return tsIsWasmTop && replayIsWasmTop;
  }

  private refreshReplayUi(force = false): void {
    if (this.spawnMode !== 'replay') {
      this.replayRunMovesStatus = '';
      this.replayThroughputStatus = '';
      this.replayDepthStatus = '';
      return;
    }
    const now = Date.now();
    const throttleMs = this.getReplayUiRefreshThrottleMs();
    if (!force && now - this.lastReplayUiRefreshAt < throttleMs) {
      return;
    }
    this.lastReplayUiRefreshAt = now;
    const savedMoves = this.game.getMoveLogLength();
    const currentMoves = this.game.getMoveCountSnapshot();
    this.replayRunMovesStatus =
      savedMoves > 0
        ? `Replay progress: ${currentMoves} / ${savedMoves} moves`
        : `Replay moves: ${currentMoves}`;
    this.updateReplayThroughput(currentMoves);
    this.updateReplayDepth(currentMoves);
  }

  private updateReplayThroughput(currentMoves: number): void {
    const now = Date.now();
    if (this.replayThroughputLastSampleAt <= 0) {
      this.replayThroughputLastSampleAt = now;
      this.replayThroughputLastSampleMove = currentMoves;
      this.replayThroughputStatus = '';
      return;
    }
    const elapsedMs = now - this.replayThroughputLastSampleAt;
    const moveDelta = currentMoves - this.replayThroughputLastSampleMove;
    if (elapsedMs < 400 || moveDelta < 0) return;
    const movesPerSecond = (moveDelta * 1000) / elapsedMs;
    this.replayThroughputStatus = `Replay speed: ${movesPerSecond.toFixed(
      1
    )} moves/s`;
    this.replayThroughputLastSampleAt = now;
    this.replayThroughputLastSampleMove = currentMoves;
  }

  private updateReplayDepth(currentMoves: number): void {
    const board = this.game.getBoardSnapshot();
    const currentDepth =
      this.aiEngine === 'ts'
        ? this.compareEngines
          ? this.getTsCompareDepthLimit()
          : this.getTsDepthLimit(board)
        : this.aiMindepth;
    if (this.replayDepthLastSampleMove <= 0) {
      this.replayDepthLastSampleMove = currentMoves;
      this.replayDepthStatus = `Replay depth: current ${currentDepth} | avg ${currentDepth.toFixed(
        2
      )}`;
      return;
    }
    const moveDelta = currentMoves - this.replayDepthLastSampleMove;
    if (moveDelta > 0) {
      this.replayDepthWeightedSum += currentDepth * moveDelta;
      this.replayDepthWeightedMoves += moveDelta;
      this.replayDepthLastSampleMove = currentMoves;
    }
    const avgDepth =
      this.replayDepthWeightedMoves > 0
        ? this.replayDepthWeightedSum / this.replayDepthWeightedMoves
        : currentDepth;
    this.replayDepthStatus = `Replay depth: current ${currentDepth} | avg ${avgDepth.toFixed(
      2
    )}`;
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

  private getTsParityAlignedDepthLimit(board: Board): number {
    const distinct = new Set<number>();
    for (const row of board) {
      for (const cell of row) {
        if (cell > 0) distinct.add(cell);
      }
    }
    return Math.max(2, this.aiMindepth, distinct.size - 2);
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

  private replayDepthWeightedSum = 0;
  private replayDepthWeightedMoves = 0;
  private replayDepthLastSampleMove = 0;

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
    this.aiIntervalId = window.setInterval(
      () => this.runAutoTick(),
      this.aiSpeedMs
    );
  }

  private runAutoTick(): void {
    if (this.aiStepInFlight) return;
    const runToken = this.aiRunToken;
    const batch = this.getAutoBatchSize();
    void this.runAutoBatch(batch, runToken);
  }

  private async runAutoBatch(batch: number, runToken: number): Promise<void> {
    const steps = Math.max(1, Math.floor(batch));
    for (let i = 0; i < steps; i += 1) {
      if (!this.aiRunning || runToken !== this.aiRunToken) return;
      await this.stepAi('auto');
      if (!this.aiRunning || runToken !== this.aiRunToken) return;
      if (this.spawnMode !== 'replay') return;
      if (this.replayDivergedActive || this.replayStoppedEarly || this.replayCompletedActive) {
        return;
      }
    }
  }

  private getAutoBatchSize(): number {
    if (this.spawnMode !== 'replay') return 1;
    if (this.aiEngine !== 'ts') return this.replayFastMode ? 4 : 1;
    if (!this.compareEngines) return this.replayFastMode ? 80 : 30;
    if (this.strictParityMode) return this.replayFastMode ? 2 : 1;
    return this.replayFastMode ? 10 : 4;
  }

  private getReplayUiRefreshThrottleMs(): number {
    if (!this.replayFastMode) return this.replayUiRefreshThrottleMs;
    if (!this.compareEngines) return 500;
    return this.strictParityMode ? 1200 : 800;
  }

  private updateAiSummary(reason: 'win' | 'game-over' | 'stop'): void {
    const board = this.game.getBoardSnapshot();
    const maxTile = Math.max(...board.flat());
    const topTiles = [...board.flat()].sort((a, b) => b - a).slice(0, 4);
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

    if (!this.aiRunLogged) {
      this.aiRunLogged = true;
      const loggedGameMode = this.spawnMode;
      const loggedEngine = this.getLoggedEngine(loggedGameMode);
      const savedLabel =
        loggedGameMode === 'replay' || loggedGameMode === 'record'
          ? this.game.getSpawnLabel()
          : '';
      const savedId = savedLabel
        ? this.game.getSavedSpawnIdByLabelCached(savedLabel) ?? undefined
        : undefined;
      const batchMeta = this.getBatchMetaForRun(loggedGameMode, reason);
      this.runHistory.addRun({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        reason,
        maxTile,
        topTiles,
        engine: loggedEngine,
        gameMode: loggedGameMode,
        parity: this.parityMode,
        compare: this.compareEngines,
        depth: this.aiEngine === 'ts' ? this.aiDepthCap : this.aiMindepth,
        ...batchMeta,
        replayLabel: savedLabel ? savedLabel : undefined,
        savedId,
        score,
        moves: movesSinceStart,
        totalMoves,
        durationMs,
      });
    }
  }

  private ensureRunLoggedIfMissing(
    reason: 'win' | 'game-over' | 'stop',
    runModeOverride?: 'normal' | 'record' | 'replay',
    replayLabelOverride?: string,
    outcomeOverride?: string
  ): 'added' | 'existing' | 'skipped' {
    const board = this.game.getBoardSnapshot();
    const maxTile = Math.max(...board.flat());
    const topTiles = [...board.flat()].sort((a, b) => b - a).slice(0, 4);
    const score = this.game.getScoreSnapshot();
    const totalMoves = this.game.getMoveCountSnapshot();
    const runningMoves = this.aiRunning
      ? totalMoves - this.aiRunStartMoves
      : 0;
    const movesSinceStart = this.aiRunAccumulatedMoves + runningMoves;
    const movesToLog =
      movesSinceStart > 0 ? movesSinceStart : this.game.getMoveCountSnapshot();
    const runningMs =
      this.aiRunning && this.aiRunLastStartedAt !== null
        ? Date.now() - this.aiRunLastStartedAt
        : 0;
    const durationMs = this.aiRunAccumulatedMs + runningMs;
    const runMode =
      runModeOverride ??
      (this.lastRunMode === 'replay' ? 'replay' : this.lastRunMode || this.spawnMode);
    const replayMovesSnapshot = this.game.getMoveCountSnapshot();
    const effectiveMovesToLog =
      runMode === 'replay' ? replayMovesSnapshot : movesToLog;
    if (effectiveMovesToLog <= 0) return 'skipped';
    const loggedEngine = this.getLoggedEngine(runMode);
    const savedLabelForMode =
      runMode === 'replay' || runMode === 'record'
        ? replayLabelOverride ?? this.game.getSpawnLabel()
        : '';
    const savedIdForMode = savedLabelForMode
      ? this.game.getSavedSpawnIdByLabelCached(savedLabelForMode) ?? undefined
      : undefined;
    const replaySavedMoves =
      runMode === 'replay' ? this.game.getMoveLogLength() : 0;
    const derivedOutcome =
      outcomeOverride ??
      (runMode === 'replay' &&
      replaySavedMoves > 0 &&
      effectiveMovesToLog >= replaySavedMoves
        ? 'Consumed all moves'
        : undefined);

    const existing = this.runHistory.getRuns().find((run) => {
      if (
        run.score !== score ||
        run.moves !== effectiveMovesToLog ||
        run.maxTile !== maxTile ||
        run.engine !== loggedEngine ||
        run.gameMode !== runMode ||
        run.compare !== this.compareEngines ||
        run.parity !== this.parityMode
      ) {
        return false;
      }
      if (runMode !== 'replay') return true;
      const existingLabel = run.replayLabel?.trim() ?? '';
      const nextLabel = (replayLabelOverride ?? this.game.getSpawnLabel()).trim();
      return existingLabel === nextLabel;
    });
    if (existing) {
      const patch: Partial<RunSummary> = {};
      if (runMode === 'replay') {
        patch.timestamp = Date.now();
      }
      if (derivedOutcome && existing.outcome !== derivedOutcome) {
        patch.outcome = derivedOutcome;
      }
      if (existing.reason !== reason) {
        patch.reason = reason;
      }
      if (existing.totalMoves !== totalMoves) {
        patch.totalMoves = totalMoves;
      }
      if (existing.durationMs !== durationMs) {
        patch.durationMs = durationMs;
      }
      if (
        typeof savedIdForMode === 'number' &&
        existing.savedId !== savedIdForMode
      ) {
        patch.savedId = savedIdForMode;
      }
      if (savedLabelForMode && existing.replayLabel !== savedLabelForMode) {
        patch.replayLabel = savedLabelForMode;
      }
      if (Object.keys(patch).length > 0) {
        this.runHistory.updateRun(existing.id, patch);
      }
      return 'existing';
    }

    const batchMeta = this.getBatchMetaForRun(runMode, reason);
    if (runMode === 'replay') {
      if (!replaySavedMoves || effectiveMovesToLog < replaySavedMoves) {
        return 'skipped';
      }
    }
    this.runHistory.addRun({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      reason,
      outcome: derivedOutcome,
      maxTile,
      topTiles,
      engine: loggedEngine,
      gameMode: runMode,
      parity: this.parityMode,
      compare: this.compareEngines,
      depth: this.aiEngine === 'ts' ? this.aiDepthCap : this.aiMindepth,
      ...batchMeta,
      replayLabel: savedLabelForMode ? savedLabelForMode : undefined,
      savedId: savedIdForMode,
      score,
      moves: effectiveMovesToLog,
      totalMoves,
      durationMs,
    });
    return 'added';
  }

  private getLoggedEngine(mode: 'normal' | 'record' | 'replay'): 'ts' | 'wasm' {
    if (mode === 'record') return 'wasm';
    return this.aiEngine;
  }

  private getBatchMetaForRun(
    runMode: 'normal' | 'record' | 'replay',
    reason: 'win' | 'game-over' | 'stop'
  ): { batchIndex?: number; batchSize?: number } {
    if (runMode !== 'record') return {};
    if (reason !== 'game-over') return {};
    if (this.batchTotal <= 1) return {};
    const index = Math.max(1, this.batchTotal - this.batchRemaining + 1);
    return {
      batchIndex: Math.min(index, this.batchTotal),
      batchSize: this.batchTotal,
    };
  }

  private startAiLoop(resetBoost = true, resetBatch = true): void {
    this.aiRunning = true;
    this.aiStepInFlight = false;
    this.aiRunToken++;
    this.replayEarlyStopRetryAttempted = false;
    this.replayRunLoggedAtCompletion = false;
    this.replayStoppedEarly = false;
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
    this.aiIntervalId = window.setInterval(
      () => this.runAutoTick(),
      this.aiSpeedMs
    );
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
    this.replayRunLoggedAtCompletion = false;
    this.replayCheckpointArmed = false;
    this.replayLastStopOrigin = 'system';
    this.replayThroughputStatus = '';
    this.replayDepthStatus = '';
    this.replayThroughputLastSampleAt = 0;
    this.replayThroughputLastSampleMove = 0;
    this.replayDepthWeightedSum = 0;
    this.replayDepthWeightedMoves = 0;
    this.replayDepthLastSampleMove = 0;
    this.aiAutoBoosted = false;
    this.aiAutoBoostLocked = false;
    this.aiAutoBoostManualOverride = false;
    this.aiGameOverHandled = false;
    this.aiPausedForNav = false;
    this.divergenceStatus = '';
    this.divergenceDetails = '';
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

  dismissReplayDiverged(): void {
    this.replayDivergedActive = false;
    this.replayDivergedMessage = '';
    this.divergenceStatus = '';
    this.divergenceDetails = '';
  }

  replayAgainAfterDivergence(): void {
    this.replayDivergedActive = false;
    this.replayDivergedMessage = '';
    this.divergenceStatus = '';
    this.divergenceDetails = '';
    if (this.replayDivergedPendingReset) {
      this.replayDivergedPendingReset = false;
      this.spawnMode = 'replay';
      this.suppressModeChangeConfirm = true;
      this.updateSpawnMode();
    }
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
    this.replayRunLoggedAtCompletion = false;
    this.replayCheckpointArmed = false;
    this.replayLastStopOrigin = 'system';
    this.replayThroughputStatus = '';
    this.replayDepthStatus = '';
    this.replayThroughputLastSampleAt = 0;
    this.replayThroughputLastSampleMove = 0;
    this.replayDepthWeightedSum = 0;
    this.replayDepthWeightedMoves = 0;
    this.replayDepthLastSampleMove = 0;
    this.aiGameOverHandled = false;
    this.aiPausedForNav = false;
    this.divergenceStatus = '';
    this.divergenceDetails = '';
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
    this.refreshReplaySelectionState(
      'Replay selection was removed. Switched to normal mode.'
    );
    if (this.gameOverActive) return;
    if (this.aiRunning) return;
    if (this.aiPausedForNav) {
      this.startAiLoop(false, false);
      return;
    }
  }

  private performRestartBase(): void {
    this.stopAi('stop');
    this.activeReplayRecordingId = null;
    this.replayStoppedEarly = false;
    this.resetAiRunTracking();
    this.clearDivergences();
    this.game.startNewGame();
    this.winFromAiRun = false;
    this.applyDefaultAiConfig();
    this.autoBoostStage = 0;
    this.clearHint();
  }

  private performRestart(): void {
    this.performRestartBase();
    this.spawnMode = 'normal';
    this.updateSpawnMode();
  }

  private pauseAiForDecisionModal(): boolean {
    if (!this.aiRunning) return false;
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
    return true;
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
