# Branch Log — feature/improved-depth-control

## Summary
This branch focuses on improving TS/WASM parity, replay tooling, run analytics, and AI tuning controls. The emphasis is on deterministic replay for parity analysis, clearer run reporting, and safeguards against invalid run metrics.

## Goals
- Build reliable TS vs WASM parity tooling (record/replay, divergence capture, tie handling).
- Improve run history visibility and export (engine separation, top tiles, depth, parity/compare flags).
- Add guardrails for integrity issues and stop bad batch runs.
- Keep UI usable on desktop/mobile while debugging.

## Notable Changes (high level)
- Replay/record workflow hardening and UI guidance.
- Divergence capture stored in localStorage for analysis.
- Heuristic breakdown tools to inspect TS decision differences.
- Run history expanded with engine/mode/parity/compare and moves columns.
- Integrity issue detection with modal + batch halt.

## Key Decisions
- Parity mode is required for meaningful TS vs WASM comparison during replay.
- Record allowed only on WASM; replay only when saved spawns exist.
- Stop batch when integrity issue occurs to force investigation.
- Keep debug controls visible during parity work; hide later when stable.

## Open Questions
- Final tie-breaking parity strategy (WASM vs TS) and when to relax strict parity.
- Threshold/definition for “parity achieved” before running large stochastic samples.
- Whether to reinstate multi-worker or further optimize TS search.

## Next Steps
- Continue parity runs, capture first divergence, analyze heuristic breakdowns.
- Align remaining scoring/selection differences.
- Once parity is satisfactory, run statistical comparisons across engines.

---

### Notes
This document is intended as a narrative log of the collaboration and product decisions. Detailed code changes remain in Git history.
