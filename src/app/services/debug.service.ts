import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DebugService {
  private logsSubject = new BehaviorSubject<string[]>([]);
  logs$ = this.logsSubject.asObservable();

  log(message: string) {
    const timestamp = new Date().toISOString();
    const newLog = `[${timestamp}] ${message}`;
    const current = this.logsSubject.value;
    this.logsSubject.next([...current, newLog]);
  }

  clear() {
    this.logsSubject.next([]);
  }
}