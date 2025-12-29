import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DebugPanelComponent } from '../../components/debug-panel/debug-panel.component';
import { GameBoardComponent } from '../../components/game-board/game-board.component';
import { DebugService } from '../../services/debug.service';

@Component({
  selector: 'app-game-page',
  standalone: true,
  imports: [GameBoardComponent, DebugPanelComponent, CommonModule],
  templateUrl: './game-page.component.html',
  styleUrls: ['./game-page.component.css'],
})
export class GamePageComponent {
  debugVisible = false;

  constructor(private debug: DebugService) {}

  move(direction: 'up' | 'down' | 'left' | 'right') {
    this.debug.log(`Move: ${direction}`);
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
  }
}
