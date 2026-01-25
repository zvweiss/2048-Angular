# Decisions Log

Short record of options considered and why we chose a path. This is meant to preserve the reasoning that would otherwise live only in chat history.

## 2026-01-24 — Branch strategy before WebAssembly refactor

- Options: keep working on `backup/ai-worker-2026-01-23`, or merge into `master` first.
- Decision: commit on the backup branch, merge into `master`, then create `backup/pre-WebAssembly` and work on `feature/refactor-to-WebAssembly`.
- Reasoning: clean history, safe restore point, and isolated feature work.

## 2026-01-24 — 2048 AI implementation choice

- Options: TS expectimax vs. existing C++ worker engine.
- Decision: use the existing C++ worker engine for strongest performance and results.
- Reasoning: consistent high scores and stability; TS expectimax was slower and weaker.

## 2026-01-24 — WebAssembly migration approach

- Options: manual WASM build steps vs. integrated build step; change worker API vs. preserve it.
- Decision: integrate `build:wasm` into npm scripts and preserve the worker message API.
- Reasoning: reproducible builds, no changes to AI service interfaces.
