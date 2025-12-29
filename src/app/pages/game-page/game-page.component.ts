import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DebugPanelComponent } from '../../components/debug-panel/debug-panel.component';
import { GameBoardComponent } from '../../components/game-board/game-board.component';

@Component({
  selector: 'app-game-page',
  standalone: true,
  imports: [GameBoardComponent, DebugPanelComponent, CommonModule],
  templateUrl: './game-page.component.html',
  styleUrls: ['./game-page.component.css'],
})
export class GamePageComponent {
  debugVisible = false;
   @ViewChild(DebugPanelComponent) debugPanel?: DebugPanelComponent;

  move(direction: 'up' | 'down' | 'left' | 'right') {
    const msg = `Move: ${direction}`;
    //console.log(`Move: ${direction}`);
    this.debugPanel?.log(msg);
    // Call game logic here later
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
  }
}
