import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

import { GameService } from '../../services/game.service';
import { SwipeDirective } from '../../directives/swipe.directive';
import { GameBoardComponent } from '../../components/game-board/game-board.component';
import { DebugPanelComponent } from '../../components/debug-panel/debug-panel.component';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { Direction } from '../../types/direction';

@Component({
  selector: 'app-game-page',
  standalone: true,
  imports: [
    CommonModule,
    SwipeDirective,
    GameBoardComponent,
    DebugPanelComponent,
    NavbarComponent
  ],
  templateUrl: './game-page.component.html',
  styleUrls: ['./game-page.component.css'],
})
export class GamePageComponent implements OnInit, OnDestroy {
  score$;
  bestScore$;
  undoAvailable$;
  undoEnabled$;
  gameOver$;
  win$;

  debugVisible = false;
  private subscriptions: Subscription[] = [];

  constructor(public game: GameService) {
    this.score$ = game.score$;
    this.bestScore$ = game.bestScore$;
    this.undoAvailable$ = game.undoAvailable$;
    this.undoEnabled$ = game.undoEnabled$;
    this.gameOver$ = game.gameOver$;
    this.win$ = game.win$;
  }

  ngOnInit(): void {
    this.game.startNewGame();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((s) => s.unsubscribe());
  }

  move(direction: Direction): void {
    this.game.move(direction);
  }

  restart(): void {
    this.game.startNewGame();
  }

  undo(): void {
    this.game.undo();
  }

  toggleUndoEnabled(): void {
    this.game.toggleUndoEnabled();
  }

  toggleDebug(): void {
    this.debugVisible = !this.debugVisible;
  }

  onDismissWin(): void {
    this.game.dismissWin();
  }

  onDismissGameOver(): void {
    this.game.resetGameOver();
  }
}