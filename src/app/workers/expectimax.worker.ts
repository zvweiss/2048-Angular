/// <reference lib="webworker" />
import { computeBestMove } from '../services/expectimax-core';
import { Board } from '../types/board';

type WorkerRequest = {
  id: number;
  board: Board;
};

type WorkerResponse = {
  id: number;
  move: string | null;
};

addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const { id, board } = event.data;
  const move = computeBestMove(board, { baseDepth: 7, timeBudgetMs: 350 });
  const response: WorkerResponse = { id, move };
  postMessage(response);
});
