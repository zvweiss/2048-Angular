import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DebugService } from './debug.service';
import { Board } from '../types/board';
import { Direction } from '../types/direction';

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly size = 4;
  private spawnMode: 'normal' | 'record' | 'replay' = 'normal';
  private spawnLog: { r: number; c: number; value: number }[] = [];
  private shadowRecording = false;
  private spawnIndex = 0;
  private moveLog: Direction[] = [];
  private moveIndex = 0;
  private replayExhausted = false;
  private spawnLabel = '';
  private savedSpawns: SavedSpawn[] = [];
  private recordSpawnsArchive: SavedSpawn[] = [];
  private currentSavedSpawnId: string | null = null;

  private boardSubject = new BehaviorSubject<Board>(this.createEmptyBoard());
  board$ = this.boardSubject.asObservable();

  private score = 0;
  private scoreSubject = new BehaviorSubject<number>(0);
  score$ = this.scoreSubject.asObservable();

  bestScore = 0;
  private bestScoreSubject = new BehaviorSubject<number>(this.bestScore);
  bestScore$ = this.bestScoreSubject.asObservable();

  private moveCount = 0;
  private moveCountSubject = new BehaviorSubject<number>(0);
  moveCount$ = this.moveCountSubject.asObservable();

  private undoAvailableSubject = new BehaviorSubject<boolean>(false);
  undoAvailable$ = this.undoAvailableSubject.asObservable();

  private undoEnabledSubject = new BehaviorSubject<boolean>(true);
  undoEnabled$ = this.undoEnabledSubject.asObservable();

  private winSubject = new BehaviorSubject<boolean>(false);
  win$ = this.winSubject.asObservable();

  private cleanupNoticeSubject = new BehaviorSubject<string | null>(null);
  cleanupNotice$ = this.cleanupNoticeSubject.asObservable();

  private gameOverSubject = new BehaviorSubject<boolean>(false);
  gameOver$ = this.gameOverSubject.asObservable();

  getBoardSnapshot(): Board {
    return this.boardSubject.value.map((row) => [...row]);
  }

  getScoreSnapshot(): number {
    return this.score;
  }

  getMoveCountSnapshot(): number {
    return this.moveCount;
  }

  isGameOverActive(): boolean {
    return this.gameOverSubject.value;
  }

  isBoardEmpty(): boolean {
    return this.boardSubject.value.every((row) =>
      row.every((cell) => cell === 0)
    );
  }

  private previousState:
    | { board: Board; score: number; moveCount: number }
    | null = null;
  private winAchieved = false;
  public debugVisible = false;

  constructor(private debug: DebugService) {
    this.debug.log('GameService initialized');
    this.bestScore = this.getBestScore();
    this.debug.log('BestScore: ' + this.bestScore);
    this.loadSavedSpawnsFromStorage();
  }

  private createEmptyBoard(): Board {
    return Array.from({ length: this.size }, () => Array(this.size).fill(0));
  }

  startNewGame(): void {
    this.debug.log('Starting new game...');
    const board = this.createEmptyBoard();
    this.spawnIndex = 0;
    this.moveIndex = 0;
    this.replayExhausted = false;
    this.spawnTile(board);
    this.spawnTile(board);
    this.boardSubject.next(board);
    this.score = 0;
    this.scoreSubject.next(0);
    this.moveCount = 0;
    this.moveCountSubject.next(0);

    this.bestScore = this.getBestScore();
    this.bestScoreSubject.next(this.bestScore);

    this.previousState = null;
    this.updateUndoAvailability();
    this.winAchieved = false;
    this.winSubject.next(false);
    this.gameOverSubject.next(false);
  }

  setSpawnMode(mode: 'normal' | 'record' | 'replay'): void {
    this.spawnMode = mode;
    if (mode !== 'replay') {
      this.replayExhausted = false;
    }
  }

  getSpawnMode(): 'normal' | 'record' | 'replay' {
    return this.spawnMode;
  }

  setShadowRecording(enabled: boolean): void {
    if (this.shadowRecording === enabled) return;
    this.shadowRecording = enabled;
    if (enabled) {
      this.clearRecording();
    }
  }

  isShadowRecording(): boolean {
    return this.shadowRecording;
  }

  getSpawnLogLength(): number {
    return this.spawnLog.length;
  }

  getMoveLogLength(): number {
    return this.moveLog.length;
  }

  getSavedSpawnsMeta(): SavedSpawnMeta[] {
    this.loadSavedSpawnsFromStorage();
    return this.savedSpawns.map(({ id, label, createdAt, savedId }) => ({
      id,
      label,
      createdAt,
      savedId,
    }));
  }

  getSavedSpawnMoveCountByLabel(label: string): number | null {
    const cleaned = label.trim();
    if (!cleaned) return null;
    this.loadSavedSpawnsFromStorage();
    const match =
      this.savedSpawns.find((entry) => entry.label === cleaned) ??
      this.recordSpawnsArchive.find((entry) => entry.label === cleaned);
    if (!match) return null;
    return match.moveLog?.length ?? null;
  }

  getSavedSpawnIdByLabel(label: string): number | null {
    const cleaned = label.trim();
    if (!cleaned) return null;
    this.loadSavedSpawnsFromStorage();
    const match =
      this.savedSpawns.find((entry) => entry.label === cleaned) ??
      this.recordSpawnsArchive.find((entry) => entry.label === cleaned);
    if (!match) return null;
    return match.savedId ?? null;
  }

  getSavedSpawnIdById(id: string): number | null {
    if (!id) return null;
    this.loadSavedSpawnsFromStorage();
    const match = this.savedSpawns.find((entry) => entry.id === id);
    if (!match) return null;
    return match.savedId ?? null;
  }


  hasSavedSpawns(): boolean {
    return this.getSavedSpawnsMeta().length > 0;
  }

  getCurrentSavedSpawnId(): string | null {
    return this.currentSavedSpawnId;
  }

  getSpawnLabel(): string {
    if (!this.spawnLabel) {
      this.spawnLabel = localStorage.getItem('spawnLabel') ?? '';
    }
    return this.spawnLabel;
  }

  getReplayMove(): Direction | null {
    if (this.spawnMode !== 'replay') return null;
    const next = this.moveLog[this.moveIndex];
    if (!next) {
      this.replayExhausted = true;
      this.gameOverSubject.next(true);
      return null;
    }
    this.moveIndex += 1;
    return next;
  }

  saveSpawnLog(label = '', options?: { archiveRecord?: boolean }): SavedSpawn {
    this.loadSavedSpawnsFromStorage();
    const cleanedLabel = label.trim();
    const savedId = this.getNextSavedSpawnId();
    const entry: SavedSpawn = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: cleanedLabel,
      createdAt: Date.now(),
      savedId,
      spawnLog: this.spawnLog.map((entry) => ({ ...entry })),
      moveLog: [...this.moveLog],
    };
    this.savedSpawns.unshift(entry);
    if (options?.archiveRecord) {
      this.recordSpawnsArchive = [
        entry,
        ...this.recordSpawnsArchive.filter((item) => item.label !== cleanedLabel),
      ];
      this.persistRecordSpawnsArchive();
    }
    this.currentSavedSpawnId = entry.id;
    this.spawnLabel = cleanedLabel;
    this.persistSavedSpawns();
    return entry;
  }

  getSavedSpawnIdByLabelCached(label: string): number | null {
    const cleaned = label.trim();
    if (!cleaned) return null;
    const match =
      this.savedSpawns.find((entry) => entry.label === cleaned) ??
      this.recordSpawnsArchive.find((entry) => entry.label === cleaned);
    if (!match) return null;
    return match.savedId ?? null;
  }

  loadSpawnLog(): void {
    this.loadSavedSpawnsFromStorage();
    const nextId =
      this.currentSavedSpawnId ?? this.savedSpawns[0]?.id ?? null;
    if (!nextId) {
      this.spawnLog = [];
      this.moveLog = [];
      this.spawnLabel = '';
      this.spawnIndex = 0;
      this.moveIndex = 0;
      return;
    }
    this.loadSavedSpawn(nextId);
  }

  clearRecording(): void {
    this.spawnLog = [];
    this.spawnIndex = 0;
    this.moveLog = [];
    this.moveIndex = 0;
    this.replayExhausted = false;
    this.spawnLabel = '';
  }

  resetReplayState(): void {
    this.clearRecording();
    this.currentSavedSpawnId = null;
  }

  renameSavedSpawnLabel(oldLabel: string, newLabel: string): void {
    this.loadSavedSpawnsFromStorage();
    const from = oldLabel.trim();
    const to = newLabel.trim();
    if (!from || !to || from === to) return;
    let changed = false;
    this.savedSpawns = this.savedSpawns.map((entry) => {
      if (entry.label.trim() === from) {
        changed = true;
        return { ...entry, label: to };
      }
      return entry;
    });
    this.recordSpawnsArchive = this.recordSpawnsArchive.map((entry) => {
      if (entry.label.trim() === from) {
        changed = true;
        return { ...entry, label: to };
      }
      return entry;
    });
    if (this.spawnLabel.trim() === from) {
      this.spawnLabel = to;
      changed = true;
    }
    if (changed) {
      this.persistSavedSpawns();
      this.persistRecordSpawnsArchive();
    }
  }

  hasRecordSpawnsArchiveForLabel(label: string): boolean {
    const cleaned = label.trim();
    if (!cleaned) return false;
    this.loadSavedSpawnsFromStorage();
    return this.recordSpawnsArchive.some((entry) => entry.label === cleaned);
  }

  restoreSavedSpawnsFromArchive(label: string): boolean {
    const cleaned = label.trim();
    if (!cleaned) return false;
    this.loadSavedSpawnsFromStorage();
    if (this.savedSpawns.some((entry) => entry.label === cleaned)) {
      return true;
    }
    const entry = this.recordSpawnsArchive.find(
      (item) => item.label === cleaned
    );
    if (!entry) return false;
    this.savedSpawns = [entry, ...this.savedSpawns];
    this.persistSavedSpawns();
    return true;
  }

  deleteSavedSpawnsByLabel(label: string): number {
    this.loadSavedSpawnsFromStorage();
    const target = label.trim();
    if (!target) return 0;
    const before = this.savedSpawns.length;
    this.savedSpawns = this.savedSpawns.filter(
      (entry) => entry.label.trim() !== target
    );
    const archiveBefore = this.recordSpawnsArchive.length;
    this.recordSpawnsArchive = this.recordSpawnsArchive.filter(
      (entry) => entry.label.trim() !== target
    );
    const removed = before - this.savedSpawns.length;
    if (this.spawnLabel.trim() === target || removed > 0) {
      this.resetReplayState();
    }
    if (removed > 0 || archiveBefore !== this.recordSpawnsArchive.length) {
      this.persistSavedSpawns();
      this.persistRecordSpawnsArchive();
    }
    return removed;
  }

  loadSavedSpawn(id: string): boolean {
    this.loadSavedSpawnsFromStorage();
    const entry = this.savedSpawns.find((item) => item.id === id);
    if (!entry) return false;
    this.spawnLog = entry.spawnLog.map((item) => ({ ...item }));
    this.moveLog = [...entry.moveLog];
    this.spawnLabel = entry.label;
    this.spawnIndex = 0;
    this.moveIndex = 0;
    this.currentSavedSpawnId = entry.id;
    return true;
  }

  private loadSavedSpawnsFromStorage(): void {
    const raw = localStorage.getItem('savedSpawns');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as SavedSpawn[];
        if (Array.isArray(parsed)) {
          const invalidLabels = new Set([
            'replay label already exists',
            'good. duplicate replay label could not be created',
          ]);
          const normalizeMove = (move: unknown): Direction | null => {
            if (typeof move === 'string') {
              const normalized = move.trim().toLowerCase();
              if (
                normalized === 'up' ||
                normalized === 'down' ||
                normalized === 'left' ||
                normalized === 'right'
              ) {
                return normalized as Direction;
              }
              return null;
            }
            if (typeof move === 'number') {
              switch (move) {
                case 0:
                  return 'up';
                case 1:
                  return 'down';
                case 2:
                  return 'left';
                case 3:
                  return 'right';
                default:
                  return null;
              }
            }
            return null;
          };
          let normalizedMoves = false;
          const filtered = parsed
            .map((entry) => {
              const rawMoves = Array.isArray(entry.moveLog) ? entry.moveLog : [];
              const moveLog = rawMoves
                .map((move) => normalizeMove(move))
                .filter((move): move is Direction => Boolean(move));
              if (rawMoves.length !== moveLog.length) {
                normalizedMoves = true;
              }
              return {
                ...entry,
                moveLog,
              };
            })
            .filter((entry) => {
            const label = entry.label?.trim().toLowerCase() ?? '';
            if (!label) return true;
            return !invalidLabels.has(label);
          });
          this.savedSpawns = filtered;
          if (filtered.length !== parsed.length || normalizedMoves) {
            this.persistSavedSpawns();
          }
          this.loadRecordSpawnsArchive();
          this.normalizeSavedSpawnIds();
          this.reconcileSavedSpawnsWithHistory();
          this.mergeRecordSpawnsArchive();
          return;
        }
      } catch {
        // fall through
      }
    }
    const legacySpawns = localStorage.getItem('spawnLog');
    const legacyMoves = localStorage.getItem('moveLog');
    if (legacySpawns && legacyMoves) {
      try {
        const spawnLog = JSON.parse(legacySpawns);
        const moveLog = JSON.parse(legacyMoves);
        if (Array.isArray(spawnLog) && Array.isArray(moveLog)) {
          const legacyLabel = localStorage.getItem('spawnLabel') ?? '';
          const entry: SavedSpawn = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            label: legacyLabel,
            createdAt: Date.now(),
            savedId: this.getNextSavedSpawnId(),
            spawnLog,
            moveLog,
          };
          this.savedSpawns = [entry];
          this.currentSavedSpawnId = entry.id;
          this.spawnLabel = legacyLabel;
          this.persistSavedSpawns();
          localStorage.removeItem('spawnLog');
          localStorage.removeItem('moveLog');
          localStorage.removeItem('spawnLabel');
        }
      } catch {
        // ignore legacy migration errors
      }
    }
    this.loadRecordSpawnsArchive();
    this.normalizeSavedSpawnIds();
    this.mergeRecordSpawnsArchive();
  }

  private persistSavedSpawns(): void {
    localStorage.setItem('savedSpawns', JSON.stringify(this.savedSpawns));
  }

  private loadRecordSpawnsArchive(): void {
    const raw = localStorage.getItem('recordSpawnsArchive');
    if (!raw) {
      this.recordSpawnsArchive = [];
      return;
    }
    try {
      const parsed = JSON.parse(raw) as SavedSpawn[];
      if (!Array.isArray(parsed)) {
        this.recordSpawnsArchive = [];
        return;
      }
      this.recordSpawnsArchive = parsed;
    } catch {
      this.recordSpawnsArchive = [];
    }
  }

  private persistRecordSpawnsArchive(): void {
    localStorage.setItem(
      'recordSpawnsArchive',
      JSON.stringify(this.recordSpawnsArchive)
    );
  }

  private mergeRecordSpawnsArchive(): void {
    if (!this.recordSpawnsArchive.length) return;
    const existingLabels = new Set(
      this.savedSpawns.map((entry) => entry.label.trim())
    );
    const missing = this.recordSpawnsArchive.filter(
      (entry) => !existingLabels.has(entry.label.trim())
    );
    if (missing.length === 0) return;
    this.savedSpawns = [...missing, ...this.savedSpawns];
    this.persistSavedSpawns();
  }

  private getRecordLabelsFromHistory(): Set<string> {
    const raw = localStorage.getItem('runHistory');
    if (!raw) return new Set();
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set();
      return new Set(
        parsed
          .filter((entry) => entry?.gameMode === 'record')
          .map((entry) => String(entry?.replayLabel ?? '').trim().toLowerCase())
          .filter((label) => Boolean(label))
      );
    } catch {
      return new Set();
    }
  }

  private getDivergenceLabelsFromStorage(): Set<string> {
    const labels = new Set<string>();
    const addLabelsFromKey = (key: string) => {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;
        parsed.forEach((entry) => {
          const label = String(entry?.label ?? '').trim().toLowerCase();
          if (label) labels.add(label);
        });
      } catch {
        // ignore malformed data
      }
    };
    addLabelsFromKey('divergenceBacklog');
    addLabelsFromKey('divergenceFixedLog');
    return labels;
  }

  private reconcileSavedSpawnsWithHistory(): void {
    const recordLabels = this.getRecordLabelsFromHistory();
    const divergenceLabels = this.getDivergenceLabelsFromStorage();
    const allowedLabels = new Set([...recordLabels, ...divergenceLabels]);
    const unlinkedSaved = this.savedSpawns.filter(
      (entry) => !allowedLabels.has(String(entry.label ?? '').trim().toLowerCase())
    ).length;
    const unlinkedArchive = this.recordSpawnsArchive.filter(
      (entry) => !allowedLabels.has(String(entry.label ?? '').trim().toLowerCase())
    ).length;

    if (unlinkedSaved > 0 || unlinkedArchive > 0) {
      const parts: string[] = [];
      if (unlinkedSaved > 0) {
        parts.push(
          `${unlinkedSaved} saved spawn${unlinkedSaved === 1 ? '' : 's'}`
        );
      }
      if (unlinkedArchive > 0) {
        parts.push(
          `${unlinkedArchive} archived spawn${unlinkedArchive === 1 ? '' : 's'}`
        );
      }
      const detail = parts.join(' and ');
      this.cleanupNoticeSubject.next(
        `Detected ${detail} not referenced by run history. Kept for safety.`
      );
    }
  }

  private normalizeSavedSpawnIds(): void {
    let maxId = 0;
    const all = [...this.savedSpawns, ...this.recordSpawnsArchive];
    for (const entry of all) {
      if (typeof entry.savedId === 'number' && !Number.isNaN(entry.savedId)) {
        maxId = Math.max(maxId, entry.savedId);
      }
    }
    let changedSaved = false;
    let changedArchive = false;
    for (const entry of this.savedSpawns) {
      if (!entry.savedId || Number.isNaN(Number(entry.savedId))) {
        maxId += 1;
        entry.savedId = maxId;
        changedSaved = true;
      }
    }
    for (const entry of this.recordSpawnsArchive) {
      if (!entry.savedId || Number.isNaN(Number(entry.savedId))) {
        maxId += 1;
        entry.savedId = maxId;
        changedArchive = true;
      }
    }
    if (changedSaved) {
      this.persistSavedSpawns();
    }
    if (changedArchive) {
      this.persistRecordSpawnsArchive();
    }
  }

  private getNextSavedSpawnId(): number {
    const all = [...this.savedSpawns, ...this.recordSpawnsArchive];
    const max = all.reduce((acc, entry) => Math.max(acc, entry.savedId ?? 0), 0);
    return max + 1;
  }

  move(direction: Direction): void {
    if (this.spawnMode === 'replay' && this.replayExhausted) {
      return;
    }
    if (this.spawnMode === 'record' || this.shadowRecording) {
      this.moveLog.push(direction);
    }
    const originalBoard = this.boardSubject.value;
    if (this.debugVisible) {
      this.debug.log('Original board:\n' + this.formatBoard(originalBoard));
    }

    let rotatedBoard: Board;
    switch (direction) {
      case 'up':
        rotatedBoard = this.rotateCounterClockwise(originalBoard);
        break;
      case 'down':
        rotatedBoard = this.rotateClockwise(originalBoard);
        break;
      case 'right':
        rotatedBoard = this.rotate180(originalBoard);
        break;
      default:
        rotatedBoard = originalBoard.map((row) => [...row]);
        break;
    }

    const newBoard: Board = [];
    let moved = false;
    for (const row of rotatedBoard) {
      const [compressedRow, changed] = this.slideAndMergeRow(row);
      newBoard.push(compressedRow);
      if (changed) moved = true;
    }

    let finalBoard: Board;
    switch (direction) {
      case 'up':
        finalBoard = this.rotateClockwise(newBoard);
        break;
      case 'down':
        finalBoard = this.rotateCounterClockwise(newBoard);
        break;
      case 'right':
        finalBoard = this.rotate180(newBoard);
        break;
      default:
        finalBoard = newBoard;
        break;
    }

    if (moved) {
      this.previousState = {
        board: originalBoard.map((row) => [...row]),
        score: this.score,
        moveCount: this.moveCount,
      };
      this.spawnTile(finalBoard);
      this.boardSubject.next(finalBoard);
      this.moveCount += 1;
      this.moveCountSubject.next(this.moveCount);
      this.updateUndoAvailability();
      this.checkWin(finalBoard);
      this.checkGameOver(finalBoard);
    } else {
      this.debug.log('No move made.');
    }
  }

  private checkWin(board: Board) {
    if (this.winAchieved) return;
    for (const row of board) {
      for (const cell of row) {
        if (cell === 2048) {
          this.winAchieved = true;
          this.winSubject.next(true);
          return;
        }
      }
    }
  }

  private checkGameOver(board: Board) {
    if (this.gameOverSubject.value) return;
    if (this.isGameOver(board)) {
      this.gameOverSubject.next(true);
    }
  }

  private isGameOver(board: Board): boolean {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (board[r][c] === 0) return false;
        if (c < this.size - 1 && board[r][c] === board[r][c + 1]) return false;
        if (r < this.size - 1 && board[r][c] === board[r + 1][c]) return false;
      }
    }
    return true;
  }

  dismissWin(): void {
    this.winSubject.next(false);
  }

  resetGameOver(): void {
    this.debug.log('Reset Game Over')
    this.gameOverSubject.next(false);
  }

  undo(): void {
    if (!this.undoEnabledSubject.value || !this.previousState) {
      this.debug.log('No Undo is available')
       return;
    }
    this.debug.log('Board before Undo:\n' + this.formatBoard(this.previousState.board));
    this.boardSubject.next(this.previousState.board);
    this.scoreSubject.next(this.previousState.score);
    this.moveCount = this.previousState.moveCount;
    this.moveCountSubject.next(this.moveCount);
    this.previousState = null;
    this.updateUndoAvailability();
  }

  toggleUndoEnabled(): void {
    const current = this.undoEnabledSubject.value;
    this.undoEnabledSubject.next(!current);
  }

  toggleDebug(): void {
    this.debugVisible = !this.debugVisible;
  }

  restart(): void {
    this.debug.log('Restart');
    this.startNewGame();
  }

  dismissGameOver(): void {
    this.gameOverSubject.next(false);
  }

  updateScore(newScore: number) {
    this.score = newScore;
    this.scoreSubject.next(newScore);
    if (newScore > this.bestScore) {
      this.bestScore = newScore;
      this.saveBestScore(newScore);
      this.bestScoreSubject.next(newScore);
    }
  }

  private slideAndMergeRow(row: number[]): [number[], boolean] {
    const filtered = row.filter((n) => n !== 0);
    const merged: number[] = [];
    let i = 0;
    let changed = false;
    while (i < filtered.length) {
      if (filtered[i] === filtered[i + 1]) {
        merged.push(filtered[i] * 2);
        this.updateScore(this.score + filtered[i] * 2);
        i += 2;
        changed = true;
      } else {
        merged.push(filtered[i]);
        i++;
      }
    }
    while (merged.length < this.size) {
      merged.push(0);
    }
    if (!changed && !merged.every((val, idx) => val === row[idx])) {
      changed = true;
    }
    return [merged, changed];
  }

  private spawnTile(board: Board): void {
    const empty: { r: number; c: number }[] = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (board[r][c] === 0) empty.push({ r, c });
      }
    }
    if (empty.length === 0) return;

    if (this.spawnMode === 'replay') {
      const next = this.spawnLog[this.spawnIndex];
      if (!next) {
        this.debug.log('Replay spawn log exhausted.');
        this.replayExhausted = true;
        this.gameOverSubject.next(true);
        return;
      }
      this.spawnIndex += 1;
      if (board[next.r][next.c] !== 0) {
        this.debug.log('Replay spawn mismatch: cell not empty.');
        this.replayExhausted = true;
        this.gameOverSubject.next(true);
        return;
      }
      board[next.r][next.c] = next.value;
      return;
    }

    const { r, c } = empty[Math.floor(Math.random() * empty.length)];
    const value = Math.random() < 0.9 ? 2 : 4;
    board[r][c] = value;
    if (this.spawnMode === 'record' || this.shadowRecording) {
      this.spawnLog.push({ r, c, value });
    }
    this.debug.log(`Spawn tile at row ${r}, col ${c}, value ${board[r][c]}`);
    this.debug.log('Board after Spawn:\n' + this.formatBoard(board));
  }

  private rotateClockwise(board: Board): Board {
    return board[0].map((_, i) => board.map((row) => row[i]).reverse());
  }

  private rotateCounterClockwise(board: Board): Board {
    return board[0].map((_, i) => board.map((row) => row[this.size - 1 - i]));
  }

  private rotate180(board: Board): Board {
    return board.map((row) => [...row].reverse()).reverse();
  }

  saveBestScore(score: number): void {
    localStorage.setItem('bestScore', JSON.stringify(score));
  }

  getBestScore(): number {
    return JSON.parse(localStorage.getItem('bestScore') || '0');
  }

  private updateUndoAvailability(): void {
    this.undoAvailableSubject.next(this.previousState !== null);
  }

  private formatBoard(board: Board): string {
    return board
      .map((row) =>
        row.map((cell) => (cell === 0 ? '.' : cell.toString())).join('\t')
      )
      .join('\n');
  }
}

export type SavedSpawn = {
  id: string;
  label: string;
  createdAt: number;
  savedId: number;
  spawnLog: { r: number; c: number; value: number }[];
  moveLog: Direction[];
};

export type SavedSpawnMeta = {
  id: string;
  label: string;
  createdAt: number;
  savedId: number;
};
