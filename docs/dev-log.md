# Dev Log

Chronological notes capturing what changed and why.

## 2026-01-24

- Added AI run summaries to include score and handled win popup suppression during AI runs.
- Implemented run history logging with a sortable “Runs” page backed by localStorage.
- Added documentation on the expectimax C++ engine and its role in the project.
- Moved the legacy worker into `src/assets/workers/js/` and added the C++ source under `src/assets/workers/cpp/`.
- Switched the AI to use the C++ worker scoring service.
- Began WebAssembly refactor:
  - Added WASM worker wrapper and build pipeline via Emscripten (`build:wasm`).
  - Added `config.h` and `platdefs.h`, and exported `JS_sc` for the worker API.
  - Updated worker path to `/assets/workers/wasm/wrkr.js`.
  - Added build notes (`docs/wasm-build.md`).
