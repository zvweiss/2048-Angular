# Expectimax 2048 Worker: What It Is and Why It Works

This project includes an expectimax-based 2048 engine compiled to JavaScript and executed in a Web Worker (`src/assets/workers/js/wrkr.js`). The original C++ sources live in `src/assets/workers/cpp/2048.cpp` and `src/assets/workers/cpp/2048.h`.

## Algorithm summary (high level)

The engine uses **expectimax** (a.k.a. expecti-minimax) for stochastic games:

- **Move nodes**: pick the best move (maximize score).
- **Chance nodes**: average over all possible random spawns (expected value).

This matches 2048 exactly because after every move, the game **randomly** spawns a 2 (90%) or 4 (10%) in an empty cell.

## Core optimizations used

1) **Bitboard representation**
   - The 4x4 grid is packed into a single 64-bit value (each tile is a 4-bit nibble).
   - This enables fast bitwise operations and cache keys.

2) **Precomputed move tables**
   - Every 16-bit row is pre-evaluated once.
   - Row/column moves are executed by table lookups, not by re-simulating shifts every time.

3) **Heuristic evaluation**
   The evaluation is built from:
   - empty tiles
   - merge potential
   - monotonicity
   - sum of tile ranks
   - a penalty for losing states

4) **Transposition table**
   - Caches board evaluations to avoid re-computation in the tree.

5) **Probability pruning**
   - Stops exploring tiny-probability branches to keep the search fast.

## Where to read the algorithm in code

- `score_move_node(...)` chooses the **max** over moves.
- `score_tilechoose_node(...)` computes the **expected value** over tile spawns.
- `score_heur_board(...)` defines the evaluation function.
- `init_tables()` builds all move/score lookup tables.

## Why this is 2048-specific

The approach is general, but this implementation is tightly bound to 2048 rules:

- 4x4 fixed board, packed nibble encoding
- Merge logic and spawn probabilities baked in
- Heuristics tuned to 2048’s structure

To apply expectimax to a different game (e.g., backgammon), you’d re-implement:
state encoding, move generation, chance nodes, and heuristic evaluation.

## Expected strengths and limitations

- Strong, fast search for 2048.
- Not guaranteed optimal due to limited depth and heuristics.
- Can be tuned by adjusting depth, pruning threshold, and heuristic weights.

## Possible next steps

- Expose depth/smartness in UI.
- Add a reproducible benchmark harness.
- Add a neural network (NN) evaluation and compare with expectimax.
