import { Component, HostListener } from '@angular/core';
import { AsyncPipe, NgIf } from '@angular/common';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { GameBoardComponent } from '../../components/game-board/game-board.component';
import { DebugPanelComponent } from '../../components/debug-panel/debug-panel.component';
import { GameService } from '../../services/game.service';
import { Direction } from '../../types/direction';

@Component({
  selector: 'app-game-page',
  standalone: true,
  imports: [NavbarComponent, GameBoardComponent, DebugPanelComponent, AsyncPipe, NgIf],
  templateUrl: './game-page.component.html',
  styleUrls: ['./game-page.component.css'],
})
export class GamePageComponent {
  debugVisible = false;

  constructor(public game: GameService) {
    this.game.startNewGame(); // ← Make sure board is initialized!
    //this.game = game;
  }

  get score$() {
    return this.game.score$;
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
  }

  move(direction: Direction) {
    this.game.move(direction);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    const keyMap: { [key: string]: Direction } = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    };

    const direction = keyMap[event.key];
    if (direction) {
      event.preventDefault(); // Prevent arrow key scrolling
      this.game.move(direction);
    }
  }

  restart(): void {
    this.game.startNewGame();
  }
}
