# Contributing

```bash
git clone https://github.com/kwy404/Raiko.js && cd Raiko.js
bun install
bun test              # unit, integration, security and property tests
bun run typecheck
bun run build && node test/node/smoke.mjs   # the built package on Node
FUZZ_RUNS=100000 bun test --timeout 0 test/fuzz.test.ts   # the long fuzz run
```

- Keep files small, one responsibility each.
- Every bug fix comes with a test that fails before the fix.
- Errors users can hit get a code (`RK` plus four digits), a `help:` line and an entry in the docs.
- Docs and READMEs are written in plain English, Spanish and Portuguese, without emoji.
