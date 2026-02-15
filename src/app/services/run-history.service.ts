import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type RunSummary = {
  id: string;
  timestamp: number;
  reason: 'game-over' | 'stop' | 'win';
  outcome?: string;
  maxTile: number;
  topTiles?: number[];
  engine?: 'wasm' | 'ts';
  gameMode?: 'normal' | 'record' | 'replay';
  parity?: boolean;
  compare?: boolean;
  depth?: number;
  batchIndex?: number;
  batchSize?: number;
  replayLabel?: string;
  savedId?: number;
  score: number;
  moves: number;
  totalMoves: number;
  durationMs: number;
};

const STORAGE_KEY = 'runHistory';
const BEST_SCORES_KEY = 'bestScoresByEngine';
const CONFIG_KEY = 'runConfigHistory';
const MAX_RUNS = 200;

export type RunConfigEntry = {
  timestamp: number;
  depthCap: number;
  timeBudgetMs: number;
  engine: 'wasm' | 'ts';
};

export type BestScoresByEngine = {
  ts: number;
  wasm: number;
};

@Injectable({ providedIn: 'root' })
export class RunHistoryService {
  private runsSubject = new BehaviorSubject<RunSummary[]>(this.getRuns());
  runs$ = this.runsSubject.asObservable();
  private bestScoresSubject = new BehaviorSubject<BestScoresByEngine>(
    this.loadBestScores()
  );
  bestScores$ = this.bestScoresSubject.asObservable();

  getRuns(): RunSummary[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as RunSummary[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }


  refreshRuns(): void {
    this.pruneRunsWithInvalidReplayLabel();
    this.pruneRecordRunsWithDivergenceLabel();
    this.pruneRecoveredPlaceholderRuns();
    this.pruneReplayRunsMissingLabel();
    this.pruneRecordRunsMissingLabel();
    this.pruneNormalRunsDuplicatedByReplay();
    this.runsSubject.next(this.getRuns());
  }

  addRun(run: RunSummary): void {
    const runs = this.getRuns();
    if (run.gameMode === 'record' && run.replayLabel?.trim()) {
      const normalized = run.replayLabel.trim().toLowerCase();
      const existingIdx = runs.findIndex(
        (entry) =>
          entry.gameMode === 'record' &&
          (entry.replayLabel?.trim().toLowerCase() ?? '') === normalized
      );
      if (existingIdx >= 0) {
        runs[existingIdx] = { ...runs[existingIdx], ...run };
        const deduped = runs.filter((entry, idx) => {
          if (idx === existingIdx) return true;
          return !(
            entry.gameMode === 'record' &&
            (entry.replayLabel?.trim().toLowerCase() ?? '') === normalized
          );
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
        this.runsSubject.next(deduped);
        if (run.engine) {
          this.updateBestScore(run.engine, run.score);
        }
        return;
      }
    }
    runs.unshift(run);
    if (runs.length > MAX_RUNS) {
      runs.length = MAX_RUNS;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
    this.runsSubject.next(runs);
    if (run.engine) {
      this.updateBestScore(run.engine, run.score);
    }
  }

  updateLatestRecordLabel(label: string, savedId?: number): void {
    const cleaned = label.trim();
    if (!cleaned) return;
    const runs = this.getRuns();
    const normalized = cleaned.toLowerCase();
    const existingIdx = runs.findIndex(
      (run) =>
        run.gameMode === 'record' &&
        (run.replayLabel?.trim().toLowerCase() ?? '') === normalized
    );
    if (existingIdx >= 0) {
      runs[existingIdx] = {
        ...runs[existingIdx],
        replayLabel: cleaned,
        savedId:
          typeof savedId === 'number' ? savedId : runs[existingIdx].savedId,
      };
      const deduped = runs.filter((run, idx) => {
        if (idx === existingIdx) return true;
        return !(
          run.gameMode === 'record' &&
          (run.replayLabel?.trim().toLowerCase() ?? '') === normalized
        );
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
      this.runsSubject.next(deduped);
      return;
    }
    const idx = runs.findIndex(
      (run) => run.gameMode === 'record' && !run.replayLabel
    );
    const targetIdx = idx >= 0 ? idx : runs.findIndex((run) => run.gameMode === 'record');
    if (targetIdx < 0) return;
    runs[targetIdx] = {
      ...runs[targetIdx],
      replayLabel: cleaned,
      savedId: typeof savedId === 'number' ? savedId : runs[targetIdx].savedId,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
    this.runsSubject.next(runs);
  }

  updateRecordSavedId(label: string, savedId?: number): void {
    const cleaned = label.trim();
    if (!cleaned || typeof savedId !== 'number') return;
    const runs = this.getRuns();
    let changed = false;
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      if (run.gameMode === 'record' && run.replayLabel?.trim() === cleaned) {
        runs[i] = { ...run, savedId };
        changed = true;
        break;
      }
    }
    if (changed) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
      this.runsSubject.next(runs);
    }
  }

  clearRuns(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.runsSubject.next([]);
  }

  clearRunsKeepRecord(): void {
    const runs = this.getRuns();
    const kept = runs.filter((run) => run.gameMode === 'record');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
    this.runsSubject.next(kept);
  }

  clearInvalidRuns(): void {
    const runs = this.getRuns();
    const filtered = runs.filter((run) => run.moves <= run.totalMoves);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    this.runsSubject.next(filtered);
  }


  pruneRunsMissingEngine(): void {
    const runs = this.getRuns();
    const filtered = runs.filter((run) => Boolean(run.engine));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    this.runsSubject.next(filtered);
  }

  pruneReplayRunsMissingLabel(): void {
    const runs = this.getRuns();
    const filtered = runs.filter((run) => {
      if (run.gameMode === 'replay') {
        return Boolean(run.replayLabel?.trim());
      }
      return true;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    this.runsSubject.next(filtered);
  }

  private pruneRecordRunsMissingLabel(): void {
    const runs = this.getRuns();
    const filtered = runs.filter((run) => {
      if (run.gameMode === 'record') {
        return Boolean(run.replayLabel?.trim());
      }
      return true;
    });
    if (filtered.length !== runs.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      this.runsSubject.next(filtered);
    }
  }

  private pruneNormalRunsDuplicatedByReplay(): void {
    const runs = this.getRuns();
    const replays = runs.filter((run) => run.gameMode === 'replay');
    const filtered = runs.filter((run) => {
      if (run.gameMode !== 'normal') return true;
      return !replays.some((replay) => {
        if (replay.engine !== run.engine) return false;
        if (replay.score !== run.score) return false;
        if (replay.moves !== run.moves) return false;
        if (replay.maxTile !== run.maxTile) return false;
        return Math.abs(replay.timestamp - run.timestamp) <= 5 * 60 * 1000;
      });
    });
    if (filtered.length !== runs.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      this.runsSubject.next(filtered);
    }
  }

  renameReplayLabel(oldLabel: string, newLabel: string): void {
    const from = oldLabel.trim();
    const to = newLabel.trim();
    if (!from || !to || from === to) return;
    const runs = this.getRuns();
    const updated = runs.map((run) => {
      if (run.replayLabel?.trim() === from) {
        return { ...run, replayLabel: to };
      }
      return run;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    this.runsSubject.next(updated);
  }

  deleteRunsByReplayLabel(label: string): number {
    const target = label.trim();
    if (!target) return 0;
    const runs = this.getRuns();
    const filtered = runs.filter((run) => {
      const runLabel = run.replayLabel?.trim() ?? '';
      if (!runLabel) return true;
      return runLabel !== target;
    });
    const removed = runs.length - filtered.length;
    if (removed > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      this.runsSubject.next(filtered);
    }
    return removed;
  }

  deleteReplayRunsByReplayLabel(label: string): number {
    const target = label.trim();
    if (!target) return 0;
    const runs = this.getRuns();
    const filtered = runs.filter((run) => {
      if (run.gameMode !== 'replay') return true;
      const runLabel = run.replayLabel?.trim() ?? '';
      if (!runLabel) return true;
      return runLabel !== target;
    });
    const removed = runs.length - filtered.length;
    if (removed > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      this.runsSubject.next(filtered);
    }
    return removed;
  }

  deletePartialReplayRunsByLabel(label: string, savedMoves: number): number {
    const target = label.trim();
    if (!target || !savedMoves) return 0;
    const runs = this.getRuns();
    const filtered = runs.filter((run) => {
      if (run.gameMode !== 'replay') return true;
      const runLabel = run.replayLabel?.trim() ?? '';
      if (runLabel !== target) return true;
      return run.moves >= savedMoves;
    });
    const removed = runs.length - filtered.length;
    if (removed > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      this.runsSubject.next(filtered);
    }
    return removed;
  }

  private pruneRecoveredPlaceholderRuns(): void {
    const runs = this.getRuns();
    const filtered = runs.filter((run) => {
      if (run.gameMode !== 'record') return true;
      const placeholder =
        run.score === 0 &&
        run.maxTile === 0 &&
        (run.topTiles?.length ?? 0) === 0 &&
        run.durationMs === 0 &&
        run.reason === 'stop';
      return !placeholder;
    });
    if (filtered.length !== runs.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      this.runsSubject.next(filtered);
    }
  }

  private pruneRunsWithInvalidReplayLabel(): void {
    const invalidLabels = new Set([
      'replay label already exists',
      'good. duplicate replay label could not be created',
    ]);
    const runs = this.getRuns();
    const filtered = runs.filter((run) => {
      const label = run.replayLabel?.trim().toLowerCase() ?? '';
      if (!label) return true;
      return !invalidLabels.has(label);
    });
    if (filtered.length !== runs.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      this.runsSubject.next(filtered);
    }
  }

  private pruneRecordRunsWithDivergenceLabel(): void {
    const runs = this.getRuns();
    const divergenceLabels = new Set(
      runs
        .filter((run) => run.gameMode === 'record')
        .map((run) => run.replayLabel?.trim() ?? '')
        .filter((label) => label.toLowerCase().startsWith('divergence m'))
    );
    if (divergenceLabels.size === 0) return;
    const filtered = runs.filter((run) => {
      const label = run.replayLabel?.trim() ?? '';
      if (!label) return true;
      if (divergenceLabels.has(label) && run.gameMode === 'record') return false;
      if (divergenceLabels.has(label) && run.gameMode === 'replay') return false;
      return true;
    });
    if (filtered.length !== runs.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      this.runsSubject.next(filtered);
    }
  }

  getConfigHistory(): RunConfigEntry[] {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as RunConfigEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  addConfigEntry(entry: RunConfigEntry): void {
    const entries = this.getConfigHistory();
    entries.unshift(entry);
    if (entries.length > 1000) {
      entries.length = 1000;
    }
    localStorage.setItem(CONFIG_KEY, JSON.stringify(entries));
  }

  clearConfigHistory(): void {
    localStorage.removeItem(CONFIG_KEY);
  }

  updateBestScore(engine: 'ts' | 'wasm', score: number): void {
    const current = this.bestScoresSubject.value;
    const next = { ...current };
    if (engine === 'ts' && score > current.ts) {
      next.ts = score;
    }
    if (engine === 'wasm' && score > current.wasm) {
      next.wasm = score;
    }
    if (next.ts !== current.ts || next.wasm !== current.wasm) {
      this.saveBestScores(next);
    }
  }

  private loadBestScores(): BestScoresByEngine {
    const raw = localStorage.getItem(BEST_SCORES_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as BestScoresByEngine;
        if (
          typeof parsed?.ts === 'number' &&
          typeof parsed?.wasm === 'number'
        ) {
          return parsed;
        }
      } catch {
        // ignore
      }
    }
    const initial: BestScoresByEngine = { ts: 0, wasm: 0 };
    this.saveBestScores(initial);
    return initial;
  }

  private saveBestScores(scores: BestScoresByEngine): void {
    localStorage.setItem(BEST_SCORES_KEY, JSON.stringify(scores));
    if (this.bestScoresSubject) {
      this.bestScoresSubject.next(scores);
    }
  }
}
