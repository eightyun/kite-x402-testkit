# Changelog

## Unreleased

- Patch the pinned official Go + Gin template in CI so explicit verification failures stop the request and settlement controls when upstream success headers are released.
- Add `simulate` with a shared suite for successful delivery, upstream failure, verification refusal, settlement refusal, and upstream timeout.
- Export simulation results as JSON or JUnit and run the suite against the official Kite Express and Gin templates before the community Axum and Hono gateways in CI.

## 0.1.0

- Add an unpaid x402 v2 challenge checker for Kite mainnet and testnet.
- Add text and JSON reports with stable reason codes and CI exit statuses.
- Add local HTTP fixture and protocol boundary tests.
