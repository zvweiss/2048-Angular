import { Component } from '@angular/core';
import { NgIf, NgFor, CommonModule } from '@angular/common';
import { DebugService } from '../../services/debug.service';

@Component({
  selector: 'app-debug-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './debug-panel.component.html',
  styleUrls: ['./debug-panel.component.css'],
})
export class DebugPanelComponent {
  messages: string[] = [];

  constructor(public debug: DebugService) {}

  // clearLogs() {
  //   this.debug.clear();
  // }

  log(message: string) {
    this.messages.push(message);
  }

  clear() {
    this.messages = [];
  }
}
