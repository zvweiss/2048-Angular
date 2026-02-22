/// <reference lib="webworker" />

import { Board } from '../types/board';
import { Direction } from '../types/direction';
import { computeBitboardCppDirectionScore } from '../services/bitboard-core';

type WorkerRequest = {
  id: number;
  board: Board;
  direction: Direction;
  maxDepth: number;
};

type WorkerResponse = {
  id: number;
  score: number;
};

addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const { id, board, direction, maxDepth } = event.data;
  const score = computeBitboardCppDirectionScore(board, direction, maxDepth);
  const response: WorkerResponse = { id, score };
  postMessage(response);
});
