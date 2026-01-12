import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from '../../services/game.service';
import { AsyncPipe } from '@angular/common';
import { Observable } from 'rxjs';
import { Board } from '../../types/board';

@Component({
  selector: 'app-game-board',
  standalone: true,
  imports: [CommonModule, AsyncPipe],
  templateUrl: './game-board.component.html',
  styleUrls: ['./game-board.component.css'],
})
export class GameBoardComponent {
  board$: Observable<Board>;

  constructor(private game: GameService) {
    this.board$ = this.game.board$;
  }

  getTileClass(value: number): string {
    if (value === 0) {
      return 'tile tile-0'
    }
      if (value <= 8192) {
      return 'tile tile-' + value
    }
    return 'tile tile.tile-super';
  }
}