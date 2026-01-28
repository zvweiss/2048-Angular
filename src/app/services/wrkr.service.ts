import { Injectable, NgZone } from '@angular/core';
import { Board } from '../types/board';
import { Direction } from '../types/direction';

export type WrkrConfig = {
  mindepth: number;
};

@Injectable({ providedIn: 'root' })
export class WrkrService {
  private worker: Worker | null = null;
  private requestId = 0;
  private pending = new Map<number, (score: number) => void>();

  constructor(private zone: NgZone) {
    if (typeof Worker !== 'undefined') {
      const workerUrl = new URL(
        'assets/workers/wasm/wrkr.js',
        document.baseURI
      );
      this.worker = new Worker(workerUrl);
      this.worker.onmessage = (event: MessageEvent) => {
        const { funct, res } = event.data as { funct: number; res: number };
        const resolver = this.pending.get(funct);
        if (resolver) {
          this.pending.delete(funct);
          this.zone.run(() => resolver(res));
        }
      };
      this.worker.onerror = () => {
        this.worker?.terminate();
        this.worker = null;
        this.pending.forEach((resolver) => resolver(Number.NEGATIVE_INFINITY));
        this.pending.clear();
      };
    }
  }

  isAvailable(): boolean {
    return !!this.worker;
  }

  async scoreDirection(
    board: Board,
    direction: Direction,
    config: WrkrConfig
  ): Promise<number> {
    if (!this.worker) return Number.NEGATIVE_INFINITY;
    const cols = this.packBoardColumns(board);
    const move = this.directionToMove(direction);
    return this.callWorker({
      mindepth: config.mindepth,
      smartness: 5,
      move,
      col1: cols[0],
      col2: cols[1],
      col3: cols[2],
      col4: cols[3],
    });
  }

  private callWorker(payload: {
    mindepth: number;
    smartness: number;
    move: number;
    col1: number;
    col2: number;
    col3: number;
    col4: number;
  }): Promise<number> {
    const id = ++this.requestId;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker!.postMessage({ funct: id, ...payload });
    });
  }

  private directionToMove(direction: Direction): number {
    switch (direction) {
      case 'up':
        return 0;
      case 'down':
        return 1;
      case 'left':
        return 2;
      case 'right':
        return 3;
    }
  }

  private packBoardColumns(board: Board): number[] {
    const cols = [0, 0, 0, 0];
    for (let c = 0; c < 4; c++) {
      let packed = 0;
      for (let r = 0; r < 4; r++) {
        const value = board[r][c];
        const exp = value > 0 ? Math.log2(value) : 0;
        packed |= (exp & 0xf) << (r * 4);
      }
      cols[c] = packed;
    }
    return cols;
  }
}
