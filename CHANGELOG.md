# Changelog

## Unreleased

- Add `simulate` with a shared suite for successful delivery, upstream failure, verification refusal, settlement refusal, and upstream timeout.
- Export simulation results as JSON or JUnit and run the suite against the official Kite Express template, Axum, and Hono in CI.

## 0.1.0

- Add an unpaid x402 v2 challenge checker for Kite mainnet and testnet.
- Add text and JSON reports with stable reason codes and CI exit statuses.
- Add local HTTP fixture and protocol boundary tests.
