import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { RunHistoryService, RunSummary } from '../../services/run-history.service';

type SortKey = 'timestamp' | 'score' | 'maxTile' | 'moves' | 'durationMs';
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
  sortKey: SortKey = 'score';
  sortDir: SortDir = 'desc';
  readonly boundaryScore = 387000;

  constructor(private history: RunHistoryService) {}

  ngOnInit(): void {
    this.runs = this.history.getRuns();
    this.applySort();
  }

  clearHistory(): void {
    this.history.clearRuns();
    this.runs = [];
  }

  get crossedCount(): number {
    return this.runs.filter((run) => run.score >= this.boundaryScore).length;
  }

  get totalCount(): number {
    return this.runs.length;
  }

  get crossedPercent(): number {
    if (this.totalCount === 0) return 0;
    return Math.round((this.crossedCount / this.totalCount) * 1000) / 10;
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
    return new Date(ts).toLocaleString();
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
      const left = a[this.sortKey];
      const right = b[this.sortKey];
      if (left === right) return 0;
      return left > right ? dir : -dir;
    });
  }
}
