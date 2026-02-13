---
title: "Note to Prof. Robert Xiao"
date: "2026-01-29"
---

## Draft message

Subject: 2048 AI port update (TypeScript/Angular) — results & questions

Hi Prof. Xiao,

I’m a developer working on a TypeScript/Angular port of your 2048 AI (based on the classic C++ expectimax implementation you published). I just wanted to share that the port is working well and running surprisingly fast in JS, largely due to the bitboard + row‑lookup structure you used.

We mirrored the core heuristics and weights (empty cells, merges, monotonicity, sum penalty, and corner max bonus), and the expectimax tree with 0.9/0.1 spawn probabilities. We’re now seeing consistent 8192/16384 runs, with some 32768 outcomes, especially at higher depth caps.

If you’re interested, I’d love to share more details or ask a couple of questions about your heuristic tuning (especially around the CMA‑ES weight optimization) and any late‑game stability tricks you found effective.

Thanks for publishing such a clear and elegant AI — it made a faithful port possible.

Best regards,

[Your Name]

---

## Screenshots

### 32768 tile achieved (WASM)

![32768 run](docs/screenshots/score-32768-run.png)

### Runs history showing 32768 result

![Runs history](docs/screenshots/runs-history-32768.png)
