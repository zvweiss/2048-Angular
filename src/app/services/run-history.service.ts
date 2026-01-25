import { Injectable } from '@angular/core';

export type RunSummary = {
  id: string;
  timestamp: number;
  reason: 'game-over' | 'stop' | 'win';
  maxTile: number;
  score: number;
  moves: number;
  totalMoves: number;
  durationMs: number;
};

const STORAGE_KEY = 'runHistory';
const MAX_RUNS = 200;

@Injectable({ providedIn: 'root' })
export class RunHistoryService {
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
  }

  clearRuns(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
}
