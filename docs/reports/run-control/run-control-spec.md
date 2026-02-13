# Run Control Behavior Spec (Functional)

This document describes the run-control state/flow at a functional level (not code/UI). It is intended to be a living spec.

## Terms
- **Run**: A game session from start until it is ended (game over or user ends).
- **Record run**: A run in which spawn + move logs are being recorded for replay.
- **Saved spawns**: The persisted spawn+move logs for a recorded run.
- **Replay run**: A run that consumes saved spawns/moves.
- **Saved ID**: A monotonically increasing integer assigned when a saved spawn is created.

## Core States (high level)
- **Idle**: No active run in progress (board is at initial state).
- **Active Normal**: Run is in progress, mode=normal.
- **Active Record (unsaved)**: Run is in progress, mode=record, unsaved recording data exists.
- **Active Replay**: Run is in progress, mode=replay, consuming saved moves.
- **Paused/Stopped**: Run is not auto-running (AI stopped), but run still exists (moves > 0).
- **Completed**: Run ended (game over or replay consumed all moves, or diverged and terminated).

## Global Invariants
1. **Record uniqueness**: Exactly one record run per replay label. A record label cannot exist in more than one record line.
2. **Saved spawns persistence**: A saved spawn persists until its record line is deleted.
3. **Replay availability**: Replay mode is selectable only when saved spawns exist.
4. **Saved ID permanence**: Once assigned, a Saved ID never changes for that saved spawn.

## Mode Selection Flow
### Mode selector can change mode only when:
- No run is in progress **or** user explicitly ends the run via confirmation.

### When user attempts to change mode while a run is in progress:
- **Precondition**: run has moves > 0.
- **Action**: show confirmation.
- **If user continues run**: restore prior mode, no state changes.
- **If user ends run**: terminate run and start a new game, then apply the new mode.

### Special case: leaving a record run with unsaved data
- **Precondition**: mode=record, unsaved recording exists.
- **Action**: show recording modal with 3 choices:
  1. **Abandon**: discard recording, restore pre-record settings, start new game.
  2. **Continue**: resume record run (auto-run resumes if it was running).
  3. **Save & End**: create saved spawn + Saved ID, create record line, start new game, enable mode selector.

## Restart Flow
- Restart is allowed for normal/replay runs, with confirmation if run is in progress.
- Restart is blocked if a record run has unsaved data; use the record modal.

## Save Spawns Flow
### Save Spawns is enabled only when:
- mode=record
- run has moves > 0
- AI is stopped
- recording is not already saved

### Save Spawns action
- **Precondition**: record run stopped, unsaved data exists.
- **Action**: modal with required replay label.
- **On confirm**:
  - saved spawn is created
  - Saved ID assigned
  - record run line created/updated
  - new game starts

## Replay Flow
### Starting replay
- **Precondition**: saved spawns exist.
- **Action**: load saved spawn; run begins.

### Replay completion
- **If all moves consumed**: mark outcome = "Consumed all moves" and log replay run.
- **If divergence occurs**: terminate replay, log replay run with outcome = "Diverged".

### Replay early stop
- If user stops before consumption: show "Replay stopped early" modal, do not log replay run.

## Outcomes (Runs table)
- **Record**: "From Stopped Run" or "Game Over" (as applicable).
- **Replay**: "Consumed all moves" or "Diverged".
- **Normal**: "Game Over" or "Stopped" (if explicitly allowed).

## Validation Flow (Saved Spawns)
- Validate lists issues and categorizes as:
  - **Fixable now** (auto-fix)
  - **Needs code change** (backlog)
- Fixable issues are resolved immediately without removing valid record runs.

## Dependencies between Record Line and Saved Spawns
- A record line must always reference a saved spawn (by label + Saved ID).
- If saved spawn is missing but record exists:
  - Attempt restore from archive.
  - If archive missing, report as "needs code" issue.

## Notes
- This spec is expected to evolve. Each change should be appended as a short section with date + summary.

## 2026-02-12 — Batch Record Auto‑Save
- Record runs in batch mode auto‑save on game over using an auto‑generated replay label.
- This applies to any batch size, including single‑run batches, to avoid manual prompts.

## Deferred Alignment Items
- **Medium**: Outcomes shown in Runs table include additional values beyond the current spec examples. Decision deferred: keep current runtime values and revisit table wording later.
- **Low**: Save Spawns enablement check is broader in implementation than strict spec wording. Decision deferred: keep current safety behavior and revisit wording/rules later.

## Persistence Spec (LocalStorage)

This section ties persisted data to the functional behavior described above.

### Core Stores
1. **runHistory**
   - Source: Runs table.
   - Contains: Each completed run summary (mode, engine, score, moves, outcome, replayLabel, savedId, timestamps).
   - Used by: Runs page, validation, replay listing, outcome reporting.

2. **savedSpawns**
   - Source: Save Spawns (record runs) and divergence auto‑saves.
   - Contains: The actual spawnLog + moveLog used for replay, plus savedId.
   - Used by: Replay runs, validation, Saved ID lookup.

3. **recordSpawnsArchive**
   - Source: Save Spawns for record runs.
   - Contains: A durable backup of saved spawns linked to record runs.
   - Used by: Restore missing saved spawns if the active list is cleared.

4. **bestScoresByEngine**
   - Source: Any run added to runHistory.
   - Contains: Best score for TS and WASM.
   - Used by: Navbar best score badges.

5. **runConfigHistory**
   - Source: AI config changes.
   - Contains: Historical depth/time budget snapshots.
   - Used by: Export config CSV and diagnostics.

6. **divergenceBacklog / divergenceFixedLog**
   - Source: Divergence handling.
   - Contains: Labels + notes for backlog/fixed divergence items.
   - Used by: Backlog panel + replay labeling.

7. **aiDivergence / aiDivergences**
   - Source: Divergence snapshot creation.
   - Contains: Last snapshot (single) + history (array).
   - Used by: Debugging and backlog population.

### Legacy Keys (should be empty in a healthy system)
- **spawnLog**, **moveLog**, **spawnLabel**: old single‑run storage.
- **bestScore**: old single value, replaced by bestScoresByEngine.

### Mapping to Control Behavior
- **Record run → Save Spawns** creates entries in `savedSpawns` + `recordSpawnsArchive` and writes a record line to `runHistory` with `savedId`.
- **Replay run** reads from `savedSpawns` (fallback: `recordSpawnsArchive`) and logs to `runHistory` when completed or diverged.
- **Validation** checks `runHistory` against `savedSpawns` and may restore from `recordSpawnsArchive`.
- **Deleting a record line** removes its `savedSpawns` + `recordSpawnsArchive` entries.
