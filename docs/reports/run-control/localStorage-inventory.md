# LocalStorage Inventory (Run Control)

This document inventories all localStorage keys used by the app, who writes them, and what triggers updates. It also maps the keys back to the Run Control behavior spec.

## Key Inventory

| Key | Written/Updated by | Trigger(s) | Used for |
|---|---|---|---|
| `savedSpawns` | `GameService.persistSavedSpawns()` | Save spawns (`saveSpawnLogWithLabel` → `game.saveSpawnLog`), normalization/migration/cleanup on load, merge from archive, delete by label, validation fixes | Replay source data + record metadata |
| `recordSpawnsArchive` | `GameService.persistRecordSpawnsArchive()` | Save spawns with archive flag, reconciliation with history, normalization cleanup | Backup of record spawns for restore |
| `runHistory` | `RunHistoryService` (`addRun`, `updateLatestRecordLabel`, `updateRecordSavedId`, deletes/prunes) | End of run (`updateAiSummary` / `ensureRunLoggedIfMissing`), record label updates on save, validation cleanups, UI deletes | Runs table and integrity checks |
| `bestScoresByEngine` | `RunHistoryService.saveBestScores()` | Any run score update while AI running, or run add/update | Best score badges (TS/WASM) |
| `runConfigHistory` | `RunHistoryService.addConfigEntry()` | Any TS config change (`updateTsConfigInternal`) | Config history export / diagnostics |
| `divergenceBacklog` | `GamePageComponent.saveDivergenceBacklog()` | Auto-save on divergence, validation/backlog moves, user delete/refresh | Backlog panel + validation labels |
| `divergenceFixedLog` | `GamePageComponent.saveDivergenceFixed()` | Move fixed divergence entries, deletes | Fixed divergence tracking |
| `aiDivergences` | Direct `localStorage.setItem` in `GamePageComponent` | AI compare/replay divergence detected | Array of divergence snapshots |
| `aiDivergence` | Direct `localStorage.setItem` in `GamePageComponent` | Same as above (single latest snapshot) | “Copy divergence snapshot” |
| `spawnLog` (legacy) | Migration path only | Migrated to `savedSpawns` if present | Legacy one-off recording |
| `moveLog` (legacy) | Migration path only | Migrated to `savedSpawns` if present | Legacy one-off recording |
| `spawnLabel` (legacy) | Migration path only | Migrated to `savedSpawns`; also read by `getSpawnLabel()` | Legacy single label |
| `bestScore` (legacy) | `GameService.saveBestScore()` | Updated when score exceeds best | Legacy single score |

## Triggers and Call Sites (Pointers)

- Save spawns/record runs: `src/app/pages/game-page/game-page.component.ts` (`saveSpawnLogWithLabel`, `confirmSaveStoppedRun`) and `src/app/services/game.service.ts` (`saveSpawnLog`, `persistSavedSpawns`, `persistRecordSpawnsArchive`).
- Run history logging: `src/app/pages/game-page/game-page.component.ts` (`updateAiSummary`, `ensureRunLoggedIfMissing`) and `src/app/services/run-history.service.ts` (add/update/delete/prune).
- Config history: `src/app/pages/game-page/game-page.component.ts` (`updateTsConfigInternal`) and `src/app/services/run-history.service.ts` (`addConfigEntry`).
- Divergence snapshots + backlog: `src/app/pages/game-page/game-page.component.ts` (divergence handling, `addDivergenceBacklog`, `saveDivergenceBacklog`, `saveDivergenceFixed`).

## Mapping to Run Control Spec

- **Record run → Save Spawns** creates `savedSpawns` + `recordSpawnsArchive` entries and writes a record line to `runHistory` with `savedId`.
- **Replay run** reads from `savedSpawns` (fallback: `recordSpawnsArchive`) and logs to `runHistory` when completed or diverged.
- **Validation** checks `runHistory` against `savedSpawns` and may restore from `recordSpawnsArchive`.
- **Deleting a record line** removes its `savedSpawns` + `recordSpawnsArchive` entries.
- **Divergence handling** writes `aiDivergence(s)` and updates `divergenceBacklog` / `divergenceFixedLog`.

## Notes

- Legacy keys (`spawnLog`, `moveLog`, `spawnLabel`, `bestScore`) are retained for migration/compatibility and should be empty in healthy state.
- See `docs/reports/run-control/run-control-spec.md` for the functional behavior spec and the persistence section