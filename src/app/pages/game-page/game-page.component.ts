import { Component } from '@angular/core';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { GameBoardComponent } from '../../components/game-board/game-board.component';

@Component({
  selector: 'app-game-page',
  standalone: true,
  imports: [GameBoardComponent],
  templateUrl: './game-page.component.html',
  styleUrls: ['./game-page.component.css'],
})
export class GamePageComponent {}