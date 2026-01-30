import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type RunSummary = {
  id: string;
  timestamp: number;
  reason: 'game-over' | 'stop' | 'win';
  maxTile: number;
  topTiles?: number[];
  engine?: 'wasm' | 'ts';
  depth?: number;
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

  addRun(run: RunSummary): void {
    const runs = this.getRuns();
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

  clearRuns(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.runsSubject.next([]);
  }

  pruneRunsMissingEngine(): void {
    const runs = this.getRuns();
    const filtered = runs.filter((run) => Boolean(run.engine));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    this.runsSubject.next(filtered);
    this.recomputeBestScores();
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
    return this.recomputeBestScores();
  }

  private recomputeBestScores(): BestScoresByEngine {
    const runs = this.getRuns();
    const best: BestScoresByEngine = { ts: 0, wasm: 0 };
    for (const run of runs) {
      if (run.engine === 'ts' && run.score > best.ts) best.ts = run.score;
      if (run.engine === 'wasm' && run.score > best.wasm) best.wasm = run.score;
    }
    this.saveBestScores(best);
    return best;
  }

  private saveBestScores(scores: BestScoresByEngine): void {
    localStorage.setItem(BEST_SCORES_KEY, JSON.stringify(scores));
    this.bestScoresSubject.next(scores);
  }
}
