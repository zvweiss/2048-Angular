import { Component } from '@angular/core';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { GameBoardComponent } from '../../components/game-board/game-board.component';

@Component({
  selector: 'app-game-page',
  imports: [NavbarComponent, GameBoardComponent],
  templateUrl: './game-page.component.html',
  styleUrl: './game-page.component.css',
})
export class GamePageComponent {

}
