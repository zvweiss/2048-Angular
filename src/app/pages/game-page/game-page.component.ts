import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameBoardComponent } from '../../components/game-board/game-board.component';
import { DebugPanelComponent } from '../../components/debug-panel/debug-panel.component';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { Direction } from '../../types/direction';
import { GameService } from '../../services/game.service';
import { AsyncPipe, NgIf } from '@angular/common';

@Component({
  selector: 'app-game-page',
  standalone: true,
  imports: [CommonModule, AsyncPipe, NgIf, GameBoardComponent, DebugPanelComponent, NavbarComponent],
  templateUrl: './game-page.component.html',
  styleUrl: './game-page.component.css',
})
export class GamePageComponent {
  private game = inject(GameService);

  board$ = this.game.board$;
  score$ = this.game.score$;
  bestScore$ = this.game.bestScore$;
  undoEnabled$ = this.game.undoEnabled$;
  undoAvailable$ = this.game.undoAvailable$;
  debugVisible = this.game.debugVisible;
  win$ = this.game.win$;
  gameOver$ = this.game.gameOver$;

  ngOnInit(): void {
  this.game.startNewGame(); // This ensures the initial tiles are spawned
}

  move(direction: Direction) {
    this.game.move(direction);
  }

  restart() {
    this.game.restart();
  }

  toggleUndoEnabled() {
    this.game.toggleUndoEnabled();
  }

  undo() {
    this.game.undo();
  }

  toggleDebug() {
    this.game.toggleDebug();
    this.debugVisible = this.game.debugVisible;
  }

  dismissWin() {
    this.game.dismissWin();
  }

  dismissGameOver() {
    this.game.dismissGameOver();
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowUp':
        this.move('up');
        break;
      case 'ArrowDown':
        this.move('down');
        break;
      case 'ArrowLeft':
        this.move('left');
        break;
      case 'ArrowRight':
        this.move('right');
        break;
    }
  }
}