import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DebugService {
  private _logs = signal<string[]>([]);

  get logs() {
    return this._logs();
  }

  log(message: string) {
    const timestamp = new Date().toISOString();
    this._logs.update((logs) => [...logs, `[${timestamp}] ${message}`]);
  }

  clear() {
    this._logs.set([]);
  }
}