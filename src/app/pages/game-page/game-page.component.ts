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
  private lastRunMode: 'normal' | 'record' | 'replay' = 'normal';
  private replayRunLoggedAtCompletion = false;
  gameOverMessage = 'No more valid moves. Try again!';
  replayStoppedEarly = false;
  replayStoppedEarlyMessage = '';
  replayCompletedActive = false;
  replayCompletedMessage = '';
  replayDivergedActive = false;
  replayDivergedMessage = '';
  replayDivergedPendingReset = false;
  autoCleanupActive = false;
  autoCleanupMessage = '';
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
    aiComparePauseOnTie: boolean;
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
  divergenceBacklog: { label: string; createdAt: number; note: string }[] = [];
  private readonly divergenceBacklogKey = 'divergenceBacklog';
  private readonly divergenceRefreshSeparator = ' — Refreshed ';
  divergenceFixed: { label: string; createdAt: number; note: string }[] = [];
  private readonly divergenceFixedKey = 'divergenceFixedLog';
  private compareEngines = false;
  private pauseOnDivergence = false;
  aiCompareEnabled = false;
  aiComparePause = false;
  aiComparePauseOnTie = false;
  aiDebugEnabled = false;
  parityMode = true;
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
      this.aiComparePauseOnTie = false;
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
          if (this.spawnMode === 'replay' || this.lastRunMode === 'replay') {
            this.gameOverMessage =
              'Replay completed — all recorded moves consumed.';
          } else {
            this.gameOverMessage = 'No more valid moves. Try again!';
          }
          if (this.spawnMode === 'replay' || this.lastRunMode === 'replay') {
            if (!this.replayRunLoggedAtCompletion) {
              const replayLabel = this.spawnLabel || this.game.getSpawnLabel();
              const savedMoves = this.game.getMoveLogLength();
              const runMoves = this.game.getMoveCountSnapshot();
          if (savedMoves > 0 && runMoves < savedMoves) {
            this.addDivergenceBacklog(
              replayLabel,
              `Partial replay: ${runMoves} / ${savedMoves} moves`
            );
            this.replayRunLoggedAtCompletion = true;
            this.spawnStatus = `Partial replay (not logged): ${runMoves} / ${savedMoves} moves.`;
          } else {
            this.ensureRunLoggedIfMissing('game-over', 'replay', replayLabel);
            this.replayRunLoggedAtCompletion = true;
          }
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
        this.autoCleanupMessage = message;
        this.autoCleanupActive = true;
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
      this.resumeRecordAiOnContinue = this.aiRunning;
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

  dismissAutoCleanup(): void {
    this.autoCleanupActive = false;
    this.autoCleanupMessage = '';
  }

  dismissReplayCompleted(): void {
    this.replayCompletedActive = false;
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
        removedSpawns += this.game.deleteSavedSpawnsByLabel(issue.label);
        removedRuns += this.runHistory.deleteRunsByReplayLabel(issue.label);
        removedDivergences += this.deleteDivergencesForLabel(issue.label);
      }
    }
    this.savedSpawns = this.getSortedSavedSpawns();
    this.selectedReplayId = this.savedSpawns[0]?.id ?? null;
    this.savedSpawnsAvailable = this.savedSpawns.length > 0;
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
    if (this.gameOverActive) return;
    if (this.spawnMode === 'replay' && this.game.getMoveLogLength() === 0) {
      this.replayDataMissingActive = true;
      this.replayDataMissingMessage =
        'Replay data is missing. Select a valid recording or save spawns again.';
      return;
    }
    this.startAiLoop();
  }

  logCurrentRunForTest(): void {
    this.ensureRunLoggedIfMissing('stop');
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
    if (!this.aiCompareEnabled) {
      this.aiComparePause = false;
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
    if (this.parityMode) {
      this.aiAutoBoostManualOverride = false;
      this.aiBoostStatus = '';
    }
  }

  get replayProgressText(): string | null {
    if (this.spawnMode !== 'replay') return null;
    const savedMoves = this.game.getMoveLogLength();
    if (!savedMoves) return null;
    const currentMoves = this.game.getMoveCountSnapshot();
    return `Replay progress: ${currentMoves} / ${savedMoves} moves`;
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
      this.divergenceBacklog = Array.isArray(parsed) ? parsed : [];
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
      this.divergenceFixed = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.divergenceFixed = [];
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
      existingBase ?? { label: baseLabel, createdAt: Date.now(), note };
    const refreshedLabel = `${baseLabel}${this.divergenceRefreshSeparator}${new Date().toLocaleString()}`;
    const refreshedEntry = {
      label: refreshedLabel,
      createdAt: Date.now(),
      note: `Refreshed: ${note}`,
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
    const removedRuns = this.runHistory.deleteRunsByReplayLabel(baseLabel);
    const removedSpawns = this.game.deleteSavedSpawnsByLabel(baseLabel);
    const removedDivergences = this.deleteDivergencesForLabel(baseLabel);
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
      const wasmScores = formatScores(payload.wasmScores);
      const mdBlock = [
        '---',
        `Label: ${payload.label}`,
        `Created: ${payload.createdAt}`,
        `Note: ${payload.note ?? ''}`,
        `Move: ${payload.move ?? ''}`,
        `TS move: ${payload.tsMove ?? ''}`,
        `TS scores: ${tsScores}`,
        `WASM move: ${payload.wasmMove ?? ''}`,
        `WASM scores: ${wasmScores}`,
        'Board:',
        board,
        '---',
      ].join('\n');
      await navigator.clipboard.writeText(mdBlock);
      this.spawnStatus = 'Divergence backlog entry copied to clipboard.';
    } catch {
      this.spawnStatus = 'Failed to copy divergence snapshot.';
    }
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
    const baseLabel = this.getBacklogBaseLabel(label);
    if (!baseLabel) return;
    const match = this.game
      .getSavedSpawnsMeta()
      .find((spawn) => spawn.label === baseLabel);
    if (!match) {
      this.spawnStatus = `No saved spawns found for ${baseLabel}.`;
      return;
    }
    this.startReplayFromSavedSpawn(match.id);
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

  private deleteDivergencesForLabel(label: string): number {
    const baseLabel = label.trim();
    if (!baseLabel) return 0;
    const refreshSeparator = this.divergenceRefreshSeparator;
    const matchesLabel = (entryLabel: string) =>
      entryLabel === baseLabel ||
      entryLabel.startsWith(`${baseLabel}${refreshSeparator}`);
    const purgeList = (key: string): number => {
      const raw = localStorage.getItem(key);
      if (!raw) return 0;
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return 0;
        const before = parsed.length;
        const filtered = parsed.filter(
          (entry) => !matchesLabel(String(entry?.label ?? ''))
        );
        if (filtered.length === before) return 0;
        localStorage.setItem(key, JSON.stringify(filtered));
        return before - filtered.length;
      } catch {
        return 0;
      }
    };
    return (
      purgeList(this.divergenceBacklogKey) +
      purgeList(this.divergenceFixedKey)
    );
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

  private startReplayFromSavedSpawn(id: string): void {
    this.stopAi('stop');
    this.replayStoppedEarly = false;
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
    this.replayRunMovesStatus = '';
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
    if (this.aiEngine === 'ts' && !this.aiCompareEnabled) {
      this.aiCompareEnabled = true;
      this.aiComparePause = true;
      this.aiComparePauseOnTie = false;
      this.updateAiCompare();
    }
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
        this.resumeRecordAiOnContinue = this.aiRunning;
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
        aiComparePauseOnTie: this.aiComparePauseOnTie,
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
        this.resumeRecordAiOnContinue = this.aiRunning;
        this.exitRecordConfirmActive = true;
        this.cdr.detectChanges();
        return;
      }
    }
    if (
      modeChanged &&
      this.game.getMoveCountSnapshot() > 0 &&
      !this.suppressModeChangeConfirm
    ) {
      this.pendingModeChange = this.spawnMode;
      this.spawnMode = previousMode;
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
      this.replayRunMovesStatus = '';
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
        this.aiCompareEnabled = false;
        this.aiComparePause = false;
        this.aiComparePauseOnTie = false;
        this.compareEngines = false;
        this.pauseOnDivergence = false;
        this.parityMode = true;
        this.updateParityMode();
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
    this.selectedReplayId = nextId;
    this.game.loadSavedSpawn(nextId);
    this.spawnLabel = this.game.getSpawnLabel();
    this.replaySavedMovesStatus = `Saved moves: ${this.game.getMoveLogLength()}`;
    this.spawnStatus = this.spawnLabel
      ? `Replay ready (${this.spawnLabel}).`
      : 'Replay ready.';
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

  get spawnModeLocked(): boolean {
    return false;
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
  }

  confirmModeChangeEndRun(): void {
    const targetMode = this.pendingModeChange ?? this.lastSpawnMode;
    this.modeChangeConfirmActive = false;
    this.pendingModeChange = null;
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
    this.resumeRecordAiOnContinue = this.aiRunning;
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
      this.aiComparePauseOnTie = snapshot.aiComparePauseOnTie;
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
        this.aiComparePauseOnTie = snapshot.aiComparePauseOnTie;
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
            this.lastStopOrigin = 'tie';
            this.stopAi('stop');
            return;
          }
        }
        const replayMove = this.game.getReplayMove();
        if (!replayMove) {
          const replayLabel = this.spawnLabel || this.game.getSpawnLabel();
          const savedMoves = this.game.getMoveLogLength();
          const runMoves = this.game.getMoveCountSnapshot();
          const completedReplay = savedMoves > 0 && runMoves >= savedMoves;
          if (savedMoves > 0 && runMoves < savedMoves) {
            this.addDivergenceBacklog(
              replayLabel,
              `Partial replay: ${runMoves} / ${savedMoves} moves`
            );
            this.replayRunLoggedAtCompletion = true;
            this.spawnStatus = `Partial replay (not logged): ${runMoves} / ${savedMoves} moves.`;
          } else if (!this.replayRunLoggedAtCompletion) {
            this.ensureRunLoggedIfMissing('stop', 'replay', replayLabel);
            this.replayRunLoggedAtCompletion = true;
          }
          if (completedReplay) {
            this.replayCompletedMessage = `Replay completed: ${runMoves} / ${savedMoves} moves consumed.`;
            this.replayCompletedActive = true;
          }
          this.lastStopOrigin = 'replay-exhausted';
          this.stopAi('stop');
          this.spawnMode = 'normal';
          this.game.setSpawnMode('normal');
          this.recordingSaved = false;
          this.replayParityStatus = '';
          this.replaySavedMovesStatus = '';
          this.replayRunMovesStatus = '';
          this.spawnStatus = '';
          this.spawnLabel = '';
          this.resetAiRunTrackingForNewGame();
          this.game.startNewGame();
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
            const moveIndex = this.game.getMoveCountSnapshot();
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
            this.replayDivergedActive = true;
            this.replayDivergedPendingReset = true;
            this.lastStopOrigin = 'divergence';
            this.stopAi('stop');
            return;
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

    this.lastStopOrigin = 'system';

    if (reason === 'game-over') {
      const wasReplay = this.spawnMode === 'replay';
      if (wasReplay) {
        this.spawnMode = 'normal';
        this.updateSpawnMode();
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
    this.aiIntervalId = window.setInterval(
      () => this.stepAi('auto'),
      this.aiSpeedMs
    );
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
  ): void {
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
    if (movesToLog <= 0) return;

    const runMode =
      runModeOverride ??
      (this.lastRunMode === 'replay' ? 'replay' : this.lastRunMode || this.spawnMode);
    const loggedEngine = this.getLoggedEngine(runMode);
    const existing = this.runHistory.getRuns().find((run) => {
      if (
        run.score !== score ||
        run.moves !== movesToLog ||
        run.maxTile !== maxTile ||
        run.engine !== loggedEngine ||
        run.gameMode !== runMode
      ) {
        return false;
      }
      if (runMode !== 'replay') return true;
      const existingLabel = run.replayLabel?.trim() ?? '';
      const nextLabel = (replayLabelOverride ?? this.game.getSpawnLabel()).trim();
      return existingLabel === nextLabel;
    });
    if (existing) return;

    const savedLabel =
      runMode === 'replay' || runMode === 'record'
        ? replayLabelOverride ?? this.game.getSpawnLabel()
        : '';
    const savedId = savedLabel
      ? this.game.getSavedSpawnIdByLabelCached(savedLabel) ?? undefined
      : undefined;
    if (runMode === 'replay') {
      const savedMoves = this.game.getMoveLogLength();
      if (!savedMoves || movesToLog < savedMoves) {
        return;
      }
    }
    this.runHistory.addRun({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      reason,
      outcome: outcomeOverride,
      maxTile,
      topTiles,
      engine: loggedEngine,
      gameMode: runMode,
      parity: this.parityMode,
      compare: this.compareEngines,
      depth: this.aiEngine === 'ts' ? this.aiDepthCap : this.aiMindepth,
      replayLabel: savedLabel ? savedLabel : undefined,
      savedId,
      score,
      moves: movesToLog,
      totalMoves,
      durationMs,
    });
  }

  private getLoggedEngine(mode: 'normal' | 'record' | 'replay'): 'ts' | 'wasm' {
    if (mode === 'record') return 'wasm';
    return this.aiEngine;
  }

  private startAiLoop(resetBoost = true, resetBatch = true): void {
    this.aiRunning = true;
    this.aiStepInFlight = false;
    this.aiRunToken++;
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
      () => this.stepAi('auto'),
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
    if (this.replayDivergedPendingReset) {
      this.replayDivergedPendingReset = false;
      this.spawnMode = 'normal';
      this.updateSpawnMode();
      this.replayParityStatus = '';
      this.replaySavedMovesStatus = '';
      this.replayRunMovesStatus = '';
      this.spawnStatus = '';
      this.spawnLabel = '';
      this.resetAiRunTrackingForNewGame();
      this.game.startNewGame();
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
    this.savedSpawns = this.getSortedSavedSpawns();
    this.savedSpawnsAvailable = this.savedSpawns.length > 0;
    if (
      this.selectedReplayId &&
      !this.savedSpawns.some((spawn) => spawn.id === this.selectedReplayId)
    ) {
      this.selectedReplayId = this.savedSpawns[0]?.id ?? null;
      if (this.spawnMode === 'replay' && !this.selectedReplayId) {
        this.spawnMode = 'normal';
        this.updateSpawnMode();
        this.spawnStatus = 'Replay selection was removed. Switched to normal mode.';
      }
    }
    if (this.gameOverActive) return;
    if (this.aiRunning) return;
    if (this.aiPausedForNav) {
      this.startAiLoop(false, false);
      return;
    }
  }

  private performRestartBase(): void {
    this.stopAi('stop');
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
