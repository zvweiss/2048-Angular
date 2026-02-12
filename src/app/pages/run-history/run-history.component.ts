import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import {
  RunHistoryService,
  RunSummary,
  RunConfigEntry,
} from '../../services/run-history.service';
import { GameService } from '../../services/game.service';

type SortKey =
  | 'timestamp'
  | 'score'
  | 'maxTile'
  | 'moves'
  | 'engine'
  | 'gameMode'
  | 'parity'
  | 'compare'
  | 'outcome'
  | 'savedId'
  | 'topTiles'
  | 'replayLabel'
  | 'actions';
type SortDir = 'asc' | 'desc';
type SortCriterion = { key: SortKey; dir: SortDir };

@Component({
  selector: 'app-run-history',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent],
  templateUrl: './run-history.component.html',
  styleUrls: ['./run-history.component.css'],
})
export class RunHistoryComponent implements OnInit {
  runs: RunSummary[] = [];
  configEntries: RunConfigEntry[] = [];
  sortKey: SortKey = 'timestamp';
  sortDir: SortDir = 'desc';
  sortCriteria: SortCriterion[] = [{ key: 'timestamp', dir: 'desc' }];
  sortDialogOpen = false;
  sortAddKey: SortKey = 'timestamp';
  readonly boundaryTile = 32768;
  readonly sortKeyOptions: { key: SortKey; label: string }[] = [
    { key: 'timestamp', label: 'Date/Time' },
    { key: 'score', label: 'Score' },
    { key: 'maxTile', label: 'Max Tile' },
    { key: 'engine', label: 'Engine' },
    { key: 'gameMode', label: 'Game Mode' },
    { key: 'parity', label: 'Parity' },
    { key: 'compare', label: 'Compare' },
    { key: 'moves', label: 'Moves' },
    { key: 'outcome', label: 'Outcome' },
    { key: 'savedId', label: 'Saved ID' },
    { key: 'topTiles', label: 'Top Tiles' },
    { key: 'replayLabel', label: 'Replay Label' },
    { key: 'actions', label: 'Actions' },
  ];

  constructor(private history: RunHistoryService, private game: GameService) {}

  ngOnInit(): void {
    this.history.refreshRuns();
    this.runs = this.filterRunsWithTopTiles(this.history.getRuns());
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


  clearInvalidRuns(): void {
    this.history.clearInvalidRuns();
    this.runs = this.filterRunsWithTopTiles(this.history.getRuns());
    this.applySort();
  }


  exportRunsCsv(): void {
    const rows = this.filterRunsWithTopTiles(this.history.getRuns())
      .map((run) => ({
        timestamp: this.formatTimestamp(run.timestamp),
        reason: run.reason,
        score: run.score,
        maxTile: run.maxTile,
        topTiles: (run.topTiles ?? []).join('|'),
        engine: run.engine ?? '',
        gameMode: run.gameMode ?? '',
        parity: run.parity ? 'yes' : 'no',
        compare: run.compare ? 'yes' : 'no',
        moves: run.moves,
        savedId: this.getSavedIdDisplay(run),
        replayLabel: run.replayLabel ?? '',
        durationMs: run.durationMs,
      }));
    this.downloadCsv('runs', rows);
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

  get invalidRunsCount(): number {
    return this.runs.filter((run) => run.moves > run.totalMoves).length;
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
    const existingIndex = this.sortCriteria.findIndex(
      (criterion) => criterion.key === key
    );
    if (existingIndex >= 0) {
      const next = [...this.sortCriteria];
      const current = next[existingIndex];
      next[existingIndex] = {
        ...current,
        dir: current.dir === 'desc' ? 'asc' : 'desc',
      };
      this.sortCriteria = next;
    } else {
      this.sortCriteria = [
        ...this.sortCriteria,
        { key, dir: this.getDefaultSortDir(key) },
      ];
    }
    this.sortKey = this.sortCriteria[0].key;
    this.sortDir = this.sortCriteria[0].dir;
    this.applySort();
  }

  formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleString(undefined, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
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

  formatGameMode(mode?: RunSummary['gameMode']): string {
    return mode ?? 'normal';
  }

  renameReplayLabel(run: RunSummary): void {
    const current = run.replayLabel?.trim() ?? '';
    if (!current) return;
    const next = window.prompt('Rename replay label:', current);
    if (next === null) return;
    const cleaned = next.trim();
    if (!cleaned) {
      window.alert('Replay label cannot be empty.');
      return;
    }
    if (cleaned === current) return;
    const exists = this.history
      .getRuns()
      .some((entry) => (entry.replayLabel ?? '').trim() === cleaned);
    if (exists) {
      const ok = window.confirm(
        'That label already exists. Merge runs and saved spawns under this label?'
      );
      if (!ok) return;
    }
    this.history.renameReplayLabel(current, cleaned);
    this.game.renameSavedSpawnLabel(current, cleaned);
    this.runs = this.filterRunsWithTopTiles(this.history.getRuns());
    this.applySort();
  }

  deleteRunsForLabel(run: RunSummary): void {
    const label = run.replayLabel?.trim() ?? '';
    if (!label) return;
    const ok = window.confirm(
      `Delete all runs, saved spawns, and divergence entries for label \"${label}\"? This cannot be undone.`
    );
    if (!ok) return;
    const removedRuns = this.history.deleteRunsByReplayLabel(label);
    const removedSpawns = this.game.deleteSavedSpawnsByLabel(label);
    const removedDivergences = this.deleteDivergencesForLabel(label);
    this.runs = this.filterRunsWithTopTiles(this.history.getRuns());
    this.applySort();
    const divergencePart = removedDivergences
      ? ` and ${removedDivergences} divergence entr${removedDivergences === 1 ? 'y' : 'ies'}`
      : '';
    window.alert(
      `Deleted ${removedRuns} run${removedRuns === 1 ? '' : 's'} and ${removedSpawns} saved spawn${removedSpawns === 1 ? '' : 's'}${divergencePart}.`
    );
  }

  getReplayOutcome(run: RunSummary): string {
    if (run.gameMode !== 'replay') return '';
    if (run.outcome) return run.outcome;
    const label = run.replayLabel?.trim() ?? '';
    if (!label) return '';
    const savedMoves = this.game.getSavedSpawnMoveCountByLabel(label);
    if (savedMoves && run.moves >= savedMoves) return 'Consumed all moves';
    return this.isReplayDiverged(label) ? 'Diverged' : 'Diverged';
  }

  getRunOutcome(run: RunSummary): string {
    if (run.outcome) return run.outcome;
    if (run.gameMode === 'record' && run.reason === 'stop') {
      return 'From Stopped Run';
    }
    if (run.reason === 'game-over') return 'Game Over';
    if (run.reason === 'win') return 'Win';
    if (run.reason === 'stop') return 'Stopped';
    return 'Unknown';
  }

  getOutcome(run: RunSummary): string {
    if (run.gameMode === 'replay') {
      return this.getReplayOutcome(run);
    }
    return this.getRunOutcome(run);
  }

  getSavedIdValue(run: RunSummary): number {
    if (typeof run.savedId === 'number') return run.savedId;
    const label = run.replayLabel?.trim() ?? '';
    if (!label) return 0;
    return this.game.getSavedSpawnIdByLabelCached(label) ?? 0;
  }

  getSavedIdDisplay(run: RunSummary): number | '-' {
    const value = this.getSavedIdValue(run);
    return value > 0 ? value : '-';
  }

  formatBinaryFlag(value: boolean | undefined): 'yes' | 'no' {
    return value === true ? 'yes' : 'no';
  }

  getParityDisplay(run: RunSummary): 'yes' | 'no' | 'N/A' {
    if (run.engine === 'wasm') return 'N/A';
    return this.formatBinaryFlag(run.parity);
  }

  getCompareDisplay(run: RunSummary): 'yes' | 'no' | 'N/A' {
    if (run.engine === 'wasm') return 'N/A';
    return this.formatBinaryFlag(run.compare);
  }


  private isReplayDiverged(label: string): boolean {
    const baseLabel = label.trim();
    if (!baseLabel) return false;
    const refreshSeparator = ' — Refreshed ';
    const raw = localStorage.getItem('divergenceBacklog');
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return false;
      return parsed.some((entry) => {
        const entryLabel = String(entry?.label ?? '');
        const baseMatch =
          entryLabel === baseLabel ||
          entryLabel.startsWith(`${baseLabel}${refreshSeparator}`);
        if (!baseMatch) return false;
        const note = String(entry?.note ?? '');
        return note.startsWith('Replay divergence');
      });
    } catch {
      return false;
    }
  }

  clearPartialReplaysForLabel(run: RunSummary): void {
    if (run.gameMode !== 'replay') return;
    const label = run.replayLabel?.trim() ?? '';
    if (!label) return;
    const savedMoves = this.game.getSavedSpawnMoveCountByLabel(label);
    if (!savedMoves) return;
    if (run.moves >= savedMoves) return;
    const ok = window.confirm(
      `Remove partial replays for "${label}"? Full replays will remain.`
    );
    if (!ok) return;
    const removed = this.history.deletePartialReplayRunsByLabel(label, savedMoves);
    this.runs = this.filterRunsWithTopTiles(this.history.getRuns());
    this.applySort();
    if (removed > 0) {
      window.alert(`Removed ${removed} partial replay run${removed === 1 ? '' : 's'}.`);
    }
  }

  removeRun(run: RunSummary): void {
    if (run.gameMode === 'record') return;
    const runs = this.history.getRuns();
    const filtered = runs.filter((entry) => entry.id !== run.id);
    if (filtered.length === runs.length) return;
    localStorage.setItem('runHistory', JSON.stringify(filtered));
    this.history.refreshRuns();
    this.runs = this.filterRunsWithTopTiles(this.history.getRuns());
    this.applySort();
  }

  private deleteDivergencesForLabel(label: string): number {
    const baseLabel = label.trim();
    if (!baseLabel) return 0;
    const refreshSeparator = ' — Refreshed ';
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
      purgeList('divergenceBacklog') + purgeList('divergenceFixedLog')
    );
  }

  private applySort(): void {
    this.runs = [...this.runs].sort((a, b) => {
      for (const criterion of this.sortCriteria) {
        const left = this.getSortValue(a, criterion.key);
        const right = this.getSortValue(b, criterion.key);
        const cmp = this.compareValues(left, right, criterion.dir);
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
  }


  private filterRunsWithTopTiles(runs: RunSummary[]): RunSummary[] {
    return runs;
  }

  private getSortValue(run: RunSummary, key: SortKey): string | number {
    switch (key) {
      case 'engine':
        return run.engine ?? '';
      case 'gameMode':
        return run.gameMode ?? '';
      case 'parity':
        return run.parity ? 1 : 0;
      case 'compare':
        return run.compare ? 1 : 0;
      case 'outcome':
        return this.getOutcome(run);
      case 'savedId':
        return this.getSavedIdValue(run);
      case 'topTiles':
        return (run.topTiles ?? []).join(',');
      case 'replayLabel':
        return run.replayLabel ?? '';
      case 'actions':
        return '';
      default:
        return (run[key] ?? 0) as number;
    }
  }

  private compareValues(
    left: string | number,
    right: string | number,
    dir: SortDir
  ): number {
    if (left === right) return 0;
    const multiplier = dir === 'asc' ? 1 : -1;
    if (typeof left === 'number' && typeof right === 'number') {
      return left > right ? multiplier : -multiplier;
    }
    return String(left).localeCompare(String(right)) * multiplier;
  }

  private getDefaultSortDir(key: SortKey): SortDir {
    return key === 'timestamp' ? 'desc' : 'desc';
  }

  openSortDialog(): void {
    this.sortDialogOpen = true;
    if (this.availableSortKeys.length > 0) {
      this.sortAddKey = this.availableSortKeys[0].key;
    }
  }

  closeSortDialog(): void {
    this.sortDialogOpen = false;
    if (this.sortCriteria.length === 0) {
      this.sortCriteria = [{ key: 'maxTile', dir: 'desc' }];
    }
    this.sortKey = this.sortCriteria[0].key;
    this.sortDir = this.sortCriteria[0].dir;
    this.applySort();
  }

  addSortCriterion(): void {
    if (this.sortCriteria.some((c) => c.key === this.sortAddKey)) return;
    this.sortCriteria = [
      ...this.sortCriteria,
      { key: this.sortAddKey, dir: this.getDefaultSortDir(this.sortAddKey) },
    ];
    this.applySort();
  }

  removeSortCriterion(index: number): void {
    this.sortCriteria = this.sortCriteria.filter((_, i) => i !== index);
    this.applySort();
  }

  moveSortUp(index: number): void {
    if (index <= 0) return;
    const next = [...this.sortCriteria];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    this.sortCriteria = next;
    this.applySort();
  }

  moveSortDown(index: number): void {
    if (index >= this.sortCriteria.length - 1) return;
    const next = [...this.sortCriteria];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    this.sortCriteria = next;
    this.applySort();
  }

  updateSortKey(index: number, nextKey: SortKey): void {
    const existingIndex = this.sortCriteria.findIndex(
      (criterion, i) => i !== index && criterion.key === nextKey
    );
    const next = [...this.sortCriteria];
    if (existingIndex >= 0) {
      const swap = next[existingIndex].key;
      next[existingIndex].key = next[index].key;
      next[index].key = swap;
    } else {
      next[index].key = nextKey;
    }
    this.sortCriteria = next;
    this.applySort();
  }

  updateSortDir(index: number, dir: SortDir): void {
    const next = [...this.sortCriteria];
    next[index] = { ...next[index], dir };
    this.sortCriteria = next;
    this.applySort();
  }

  resetSortCriteria(): void {
    this.sortCriteria = [{ key: 'timestamp', dir: 'desc' }];
    this.sortAddKey = 'timestamp';
    this.sortKey = 'timestamp';
    this.sortDir = 'desc';
    this.applySort();
  }

  get availableSortKeys(): { key: SortKey; label: string }[] {
    const used = new Set(this.sortCriteria.map((criterion) => criterion.key));
    return this.sortKeyOptions.filter((option) => !used.has(option.key));
  }

  getSortLabel(key: SortKey): string {
    return this.sortKeyOptions.find((option) => option.key === key)?.label ?? key;
  }

  getSortIndicator(key: SortKey): string | null {
    const index = this.sortCriteria.findIndex(
      (criterion) => criterion.key === key
    );
    if (index < 0) return null;
    const dir = this.sortCriteria[index].dir === 'asc' ? '↑' : '↓';
    return `${index + 1}${dir}`;
  }
}
