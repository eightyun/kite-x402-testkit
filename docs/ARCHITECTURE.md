# Architecture

## Purpose

The CLI checks Kite x402 payment terms and runs local payment flow acceptance tests for service developers.

## Request flow

```text
CLI flags
  -> validate URL and expectations
  -> fetch endpoint once without credentials (no redirect following)
  -> require HTTP 402 and decode PAYMENT-REQUIRED
  -> validate x402 v2 and a Kite exact offer
  -> apply optional expected network/asset/payee/amount assertions
  -> emit sanitized text or JSON report and exit status
```

## Simulation flow

```text
JSON suite
  -> start loopback facilitator and upstream for each case
  -> start the gateway in a temporary directory with fixture URLs
  -> validate the unpaid testnet challenge
  -> send a synthetic payment to the local gateway
  -> compare HTTP status, delivery, receipt, and fixture call order
  -> stop the gateway and fixtures, then emit JSON or JUnit
```

## Receipt verification flow

```text
Transaction hash and expected terms
  -> query trusted Kite testnet RPC using read-only methods
  -> check chain ID, receipt, block hash, and confirmation depth
  -> compare pieUSD Transfer event with expected sender, recipient, and amount
  -> emit text or JSON with a pass, failure, or inconclusive result
```

## Modules

- `src/cli.ts`: argument parsing, command dispatch, output formatting, and process exit code.
- `src/checker.ts`: bounded HTTP request and orchestration of challenge checks.
- `src/challenge.ts`: bounded Base64/JSON decoding and x402 v2/Kite offer validation.
- `src/kite.ts`: canonical Kite network, asset, and EIP-712 domain configuration.
- `src/report.ts`: versioned, sanitized `check` reports.
- `src/scenarios.ts`: scenario file validation and expected operation sequences.
- `src/simulation.ts`: process lifecycle and HTTP assertions.
- `src/simulation-fixture.ts`: loopback HTTP fixtures and synthetic payloads.
- `src/simulation-report.ts`: JUnit serialization.
- `src/receipt.ts`: read-only Kite testnet JSON-RPC client and pieUSD transfer assertions.

## Kite protocol boundary

The initial checker recognizes Kite mainnet `eip155:2366` and testnet `eip155:2368`, each with its canonical settlement asset and EIP-712 domain. An offer is accepted only when the network, asset, `exact` scheme, and domain all agree. Optional expected values are then evaluated against that same offer so values from separate offers cannot be combined to produce a false pass.

## Security and privacy

- `check` sends an unpaid request without credentials.
- `simulate` sends a synthetic payment header to the gateway on loopback. The trusted gateway executable is explicitly supplied on the command line.
- HTTPS is required except for loopback HTTP fixtures. URL credentials are rejected.
- Redirects are not followed; a redirect is reported as an unexpected status.
- The request has a finite deadline. The challenge header is size-capped before decoding.
- Response bodies, query strings, and raw challenge headers are excluded from reports.
- The simulation process receives fixture URLs and a minimal environment. The simulation reports expose HTTP status and call order.

## Validation boundaries

A `check` pass confirms the observed challenge matches the expected Kite offer. A `simulate` pass confirms the observed flow for the local fixtures and selected gateway build. A `verify-receipt` pass records what one RPC observed about the supplied transaction, including confirmation depth. To link that transaction to a service call, retain the settlement hash from that same call.
