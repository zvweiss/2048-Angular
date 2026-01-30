import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import {
  RunHistoryService,
  RunSummary,
  RunConfigEntry,
} from '../../services/run-history.service';

type SortKey =
  | 'timestamp'
  | 'score'
  | 'maxTile'
  | 'moves'
  | 'durationMs'
  | 'depth';
type SortDir = 'asc' | 'desc';

@Component({
  selector: 'app-run-history',
  standalone: true,
  imports: [CommonModule, NavbarComponent],
  templateUrl: './run-history.component.html',
  styleUrls: ['./run-history.component.css'],
})
export class RunHistoryComponent implements OnInit {
  runs: RunSummary[] = [];
  configEntries: RunConfigEntry[] = [];
  sortKey: SortKey = 'score';
  sortDir: SortDir = 'desc';
  readonly boundaryTile = 32768;

  constructor(private history: RunHistoryService) {}

  ngOnInit(): void {
    this.runs = this.history.getRuns();
    this.configEntries = this.history.getConfigHistory();
    this.applySort();
  }

  get tsCount(): number {
    return this.tsRuns.length;
  }

  get wasmCount(): number {
    return this.wasmRuns.length;
  }

  get tsRuns(): RunSummary[] {
    return this.runs.filter((run) => run.engine === 'ts');
  }

  get wasmRuns(): RunSummary[] {
    return this.runs.filter((run) => run.engine === 'wasm');
  }

  clearHistory(): void {
    this.history.clearRuns();
    this.runs = [];
  }

  exportRunsCsv(engine: 'ts' | 'wasm'): void {
    const rows = this.history
      .getRuns()
      .filter((run) => run.engine === engine)
      .map((run) => ({
      timestamp: this.formatTimestamp(run.timestamp),
      reason: run.reason,
      score: run.score,
      maxTile: run.maxTile,
      topTiles: (run.topTiles ?? []).join('|'),
      engine: run.engine ?? '',
      depth: run.depth ?? '',
      aiMoves: run.moves,
      totalMoves: run.totalMoves,
      durationMs: run.durationMs,
    }));
    this.downloadCsv(`runs-${engine}`, rows);
  }

  exportConfigCsv(): void {
    const rows = this.history.getConfigHistory().map((entry) => ({
      timestamp: this.formatTimestamp(entry.timestamp),
      depthCap: entry.depthCap,
      timeBudgetMs: entry.timeBudgetMs,
      engine: entry.engine,
    }));
    this.downloadCsv('run-config', rows);
  }

  private downloadCsv(
    prefix: string,
    rows: Record<string, string | number>[]
  ): void {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((key) => {
            const raw = String(row[key] ?? '');
            const escaped = raw.replace(/\"/g, '\"\"');
            return /[\",\n]/.test(escaped) ? `\"${escaped}\"` : escaped;
          })
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const link = document.createElement('a');
    link.href = url;
    link.download = `${prefix}-${timestamp}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  get tsReachedCount(): number {
    return this.tsRuns.filter((run) => run.maxTile >= this.boundaryTile).length;
  }

  get totalCount(): number {
    return this.runs.length;
  }

  get tsReachedPercent(): number {
    if (this.tsRuns.length === 0) return 0;
    return Math.round((this.tsReachedCount / this.tsRuns.length) * 1000) / 10;
  }

  get wasmReachedCount(): number {
    return this.wasmRuns.filter((run) => run.maxTile >= this.boundaryTile).length;
  }

  get wasmReachedPercent(): number {
    if (this.wasmRuns.length === 0) return 0;
    return Math.round((this.wasmReachedCount / this.wasmRuns.length) * 1000) / 10;
  }

  sortBy(key: SortKey): void {
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      this.sortKey = key;
      this.sortDir = key === 'timestamp' ? 'desc' : 'desc';
    }
    this.applySort();
  }

  formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleString(undefined, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  formatDuration(ms: number): string {
    if (ms <= 0) return '0 ms';
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const rem = seconds % 60;
    return `${mins}m ${rem}s`;
  }

  private applySort(): void {
    const dir = this.sortDir === 'asc' ? 1 : -1;
    this.runs = [...this.runs].sort((a, b) => {
      const left = (a[this.sortKey] ?? 0) as number;
      const right = (b[this.sortKey] ?? 0) as number;
      if (left === right) return 0;
      return left > right ? dir : -dir;
    });
  }
}
