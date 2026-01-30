# WebAssembly Build Notes

This project can build the 2048 C++ engine into WebAssembly and load it in a Web Worker.

## Prerequisites

- Emscripten (`emcc`) installed and on your PATH.

## Build

```
npm run build:wasm
```

This generates:
- `src/assets/workers/wasm/2048.js`
- `src/assets/workers/wasm/2048.wasm`

These outputs are ignored by git.

## Development

Running `npm run start` will build the WASM module before launching the dev server.

If you don’t have Emscripten installed yet, install it first or run the older JS worker from
`src/assets/workers/js/wrkr.js` by switching the worker path in `src/app/services/wrkr.service.ts`.
