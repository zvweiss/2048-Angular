// src/app/components/debug-panel/debug-panel.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DebugService } from '../../services/debug.service';

@Component({
  selector: 'app-debug-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './debug-panel.component.html',
  styleUrls: ['./debug-panel.component.css'],
})
export class DebugPanelComponent implements OnInit {
  messages: string[] = [];

  constructor(private debug: DebugService) {}

  ngOnInit(): void {
    this.debug.logs$.subscribe((msgs) => (this.messages = msgs));
  }

  clearLogs(): void {
    this.debug.clear();
  }
}
