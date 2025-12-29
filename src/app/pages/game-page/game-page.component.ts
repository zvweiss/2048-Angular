import { Component } from '@angular/core';
import { AsyncPipe, NgIf } from '@angular/common';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { GameBoardComponent } from '../../components/game-board/game-board.component';
import { DebugPanelComponent } from '../../components/debug-panel/debug-panel.component';
import { GameService } from '../../services/game.service';

@Component({
  selector: 'app-game-page',
  standalone: true,
  imports: [NavbarComponent,GameBoardComponent, DebugPanelComponent, AsyncPipe, NgIf],
  templateUrl: './game-page.component.html',
  styleUrls: ['./game-page.component.css'],
})
export class GamePageComponent {
  debugVisible = false;

  constructor(public game: GameService) {
    this.game.startNewGame(); // ← Make sure board is initialized!
  }

  get score$() {
    return this.game.score$;
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
  }

  move(direction: 'up' | 'down' | 'left' | 'right') {
    this.game.move(direction);
  }
}