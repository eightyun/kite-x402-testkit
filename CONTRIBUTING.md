# Contributing

Use Node.js 22 or newer and npm. Install the locked dependencies with `npm ci`, then run:

```sh
npm run format:check
npm run check
npm test
npm run build
```

Keep checks read-only by default. Do not add payment signing or paid requests to ordinary tests. Any future live-payment feature must be opt-in, use an operator-approved Kite Passport session or isolated test wallet, enforce explicit per-call and per-run budgets, and avoid storing keys, signatures, or authorization headers.

Add tests for both successful behavior and the failure reason codes affected by a change. The test suite must remain independent of public RPC and facilitator availability.
