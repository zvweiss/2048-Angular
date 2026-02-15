# Chat Handoff

Use this file to restart context quickly when a chat thread ends.

## Working Agreement
- Discuss first, implement only after explicit `go ahead`.
- No code changes, commits, or destructive/data-affecting actions without explicit approval.
- Brief status checks are encouraged (for example: "good commit point"), but they are not approval to act.
- If scope is ambiguous, stop and ask one clarifying question before changing anything.

## Current Goal
- Stabilize replay/record workflow and continue parity tightening against WASM baseline.

## Hard Rules
- Do not implement anything unless user explicitly says: "go ahead".

## Current State
- Branch: `feature/divergence-tracking` (update if changed)
- Uncommitted files: _(fill with `git status --short` when handing off)_
- LocalStorage state summary: _(fill)_
- Active replay/record label: _(fill)_
- Last known divergence: _(move + label + strict/parity mode)_

## Known Issues
1. Warning appears at times:
   - `Detected 1 saved spawn and 1 archived spawn not referenced by run history. Kept for safety.`
2. LocalStorage quota pressure when many saved spawns accumulate.
3. Replay speed can feel slow on long runs.

## Decisions Already Made
- Preserve strict user-controlled workflow: discussion first, implementation only after explicit go-ahead.
- Keep cleanup/refactor of storage integrity on back burner for now.
- Continue parity tightening iteratively with divergence checkpoints.

## Next 1-3 Steps (pending go-ahead)
1. Keep running replay diagnostics from latest checkpoint/divergence.
2. Capture divergence block and compare strict vs non-strict behavior.
3. Apply small targeted fixes only after explicit approval.

## Useful Snippets
- LocalStorage cleanup/sync snippet: keep `savedSpawns` / `recordSpawnsArchive` aligned with `runHistory` references.
- Divergence inspection snippet: read latest from `aiDivergence` / `aiDivergences`.

## Session Notes (append newest first)
- _(date/time)_
  - 
