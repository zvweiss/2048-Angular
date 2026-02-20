# Replay Autopilot Backlog

Branch: `feature/replay-autopilot`
Status: active
Owner: Codex + user

## Scope
Build a one-click parity workflow that removes manual DevTools snippets and reduces replay babysitting.

## Tickets

### AP-001 One-Click Full Parity Check
- Status: implemented, pending validation
- Goal: add a single action to run non-strict and strict replay diagnostics back-to-back.
- Deliverable: button + deterministic phase orchestration.
- Acceptance:
  - Starts from latest divergence seed.
  - Runs `non-strict` then `strict` automatically.
  - Stops cleanly and surfaces final status.
  - Retries once on `unknown`/`timeout` before finalizing phase result.

### AP-002 Persistent In-UI Diagnostic Status
- Status: implemented, pending validation
- Goal: always show current diagnostic phase/progress and stop reason.
- Deliverable: status panel visible during and after run.
- Acceptance:
  - Shows `phase`, `move`, `target`, `state` (`running/completed/failed/cancelled`).
  - Survives route changes between Home and Runs.
  - Keeps diagnostic report copyable after navigation until explicitly cleared.

### AP-003 Stable Divergence Artifact Persistence
- Status: implemented, pending validation
- Goal: guarantee divergence artifacts are persisted before any UI state reset.
- Deliverable: robust write path for `aiDivergence` and `aiDivergences`.
- Acceptance:
  - `Run Diagnostic` and `Copy Backlog Block` can recover after navigation.
  - No "No divergence found" after fresh divergence unless explicitly cleared.
  - Uses pinned latest divergence snapshot for recovery safety.

### AP-004 Guided Next-Step UX
- Status: implemented, pending validation
- Goal: remove ambiguity about what to click next.
- Deliverable: contextual prompts/actions after each stop condition.
- Acceptance:
  - Explicit prompt for divergence, completion, partial stop, and data-missing states.
  - Prompt actions are mode-safe (no accidental reset-to-0 path).

### AP-005 Replay Logging Reliability
- Status: implemented, pending validation
- Goal: replay completion always logs or visibly updates existing row.
- Deliverable: deterministic log/update path with visible timestamp refresh.
- Acceptance:
  - Completion from `Replay @ N-1` logs without snippets.
  - Existing-row dedupe updates timestamp/outcome consistently.
  - Distinguishes replay rows by `compare` and `parity`.
  - Recovers missing replay completion log on init when replay already consumed all moves.

## Validation Queue (Mark Fixed After Pass)
1. AP-003
2. AP-004
3. AP-001
4. AP-002
5. AP-005

## Notes
- Keep dedupe behavior for replay rows unless explicitly changed.
- Prefer additive UI cues over hidden console-only diagnostics.
