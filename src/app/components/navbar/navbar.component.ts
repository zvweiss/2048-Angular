import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Observable } from 'rxjs';
import { GameService } from '../../services/game.service';
import {
  BestScoresByEngine,
  RunHistoryService,
  RunSummary,
} from '../../services/run-history.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css'],
})
export class NavbarComponent implements OnInit {
  score$!: Observable<number>;
  moveCount$!: Observable<number>;
  bestScores$!: Observable<BestScoresByEngine>;
  runs$!: Observable<RunSummary[]>;

  constructor(private game: GameService, private history: RunHistoryService) {
    this.score$ = game.score$;
    this.moveCount$ = game.moveCount$;
    this.bestScores$ = history.bestScores$;
    this.runs$ = history.runs$;
  }

  ngOnInit(): void {
    this.history.refreshRuns();
  }

  getEngineReachedPercent(
    runs: RunSummary[],
    engine: 'ts' | 'wasm',
    targetTile = 32768
  ): number {
    const engineRuns = runs.filter((run) => run.engine === engine);
    if (engineRuns.length === 0) return 0;
    const reached = engineRuns.filter((run) => run.maxTile >= targetTile).length;
    return Math.round((reached / engineRuns.length) * 1000) / 10;
  }
}
