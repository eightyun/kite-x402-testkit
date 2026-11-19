# Architecture

## Purpose

The CLI checks one HTTP endpoint's unpaid x402 challenge for Kite protocol compatibility. It is a developer/CI acceptance tool, not a service catalog, admission authority, payment processor, or uptime monitor.

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

## Modules

- `src/cli.ts`: argument parsing, command dispatch, output formatting, and process exit code.
- `src/checker.ts`: bounded HTTP request and orchestration of challenge checks.
- `src/challenge.ts`: bounded Base64/JSON decoding and x402 v2/Kite offer validation.
- `src/kite.ts`: canonical Kite network, asset, and EIP-712 domain configuration.
- `src/report.ts`: versioned, sanitized report types and serialization.

## Kite protocol boundary

The initial checker recognizes Kite mainnet `eip155:2366` and testnet `eip155:2368`, each with its canonical settlement asset and EIP-712 domain. An offer is accepted only when the network, asset, `exact` scheme, and domain all agree. Optional expected values are then evaluated against that same offer so values from separate offers cannot be combined to produce a false pass.

## Security and privacy

- Requests contain no payment, authorization, cookie, or user-supplied headers.
- HTTPS is required except for loopback HTTP fixtures. URL credentials are rejected.
- Redirects are not followed; a redirect is reported as an unexpected status.
- The request has a finite deadline. The challenge header is size-capped before decoding.
- Response bodies, query strings, and raw challenge headers are excluded from reports.
- The CLI does not sign, verify, or settle payments and cannot prove transfer finality.

## Validation boundaries

A pass proves only that the observed response contained a structurally valid Kite x402 v2 exact offer matching the requested expectations. It does not prove facilitator availability, signature acceptance, upstream behavior, settlement, or on-chain transfer. Live payment and receipt verification are a separately gated future feature.
