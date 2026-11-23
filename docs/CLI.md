# CLI Reference

## `check`

```sh
kite-x402-testkit check --url <endpoint> [options]
```

Sends one unauthenticated `GET` request. The endpoint must return HTTP 402 and a Base64-encoded x402 v2 `PAYMENT-REQUIRED` response header.

| Option                  | Description                                                    |
| ----------------------- | -------------------------------------------------------------- |
| `--url <url>`           | Required HTTPS endpoint; HTTP is permitted only on loopback    |
| `--network <id>`        | Require `eip155:2366` or `eip155:2368`                         |
| `--asset <address>`     | Require this asset in the selected matching offer              |
| `--pay-to <address>`    | Require this receiver address                                  |
| `--amount <integer>`    | Require this atomic token amount                               |
| `--timeout-ms <n>`      | Request timeout, 100 through 30000 milliseconds; default 10000 |
| `--format <text\|json>` | Select terminal or JSON output; default text                   |
| `--help`                | Show command help                                              |

The tool will not retry or follow redirects. It does not send a payment or contact the facilitator.

## JSON report

The report has `schemaVersion: 1`, `status`, `reasonCode`, a sanitized target, check results, and recognized Kite offers. The target omits query strings. Offers contain only the protocol fields needed for validation; the raw challenge and response body are never included.

Stable reason codes include `passed`, `invalid_input`, `request_timeout`, `transport_error`, `unexpected_http_status`, `missing_payment_required`, `challenge_too_large`, `invalid_base64`, `invalid_challenge_json`, `unsupported_x402_version`, `no_kite_offer`, and `expectation_mismatch`.

## Exit statuses

- `0`: validation passed
- `1`: endpoint response failed validation
- `2`: invocation or input error

## `simulate`

```sh
kite-x402-testkit simulate --suite examples/scenarios/core.json --format junit -- /absolute/path/to/gateway
```

Run a JSON suite against a gateway you trust and can start as a foreground process. The command starts a fresh process per case from a temporary directory. Use absolute paths for file arguments after `--`. The process must read `PORT`, `PAY_TO`, `PRICE_USD`, `KITE_NETWORK`, `FACILITATOR_URL` and `UPSTREAM_URL` from its environment and expose `GET /healthz` and a protected `GET /v1/...` route. Run the gateway in a local development or CI environment. The facilitator and upstream fixtures listen on loopback.

The suite declares a `schemaVersion` of `1`, a protected `path`, and an array of cases with unique `id`, `mode`, and expected `httpStatus` fields. The core suite checks the first four cases below. Run `examples/scenarios/upstream-timeout.json` against gateways with configurable upstream deadlines.

| Mode               | Fixture behavior                      | Expected calls               |
| ------------------ | ------------------------------------- | ---------------------------- |
| `success`          | Delivers data and confirms settlement | `verify → upstream → settle` |
| `upstream-error`   | Upstream replies with HTTP 503        | `verify → upstream`          |
| `verify-rejected`  | Facilitator rejects verification      | `verify`                     |
| `settle-rejected`  | Facilitator rejects settlement        | `verify → upstream → settle` |
| `upstream-timeout` | Upstream never sends response headers | `verify → upstream`          |

Settlement refusal must withhold protected data. It may include a failure receipt. Timeout sets the gateway's `UPSTREAM_TIMEOUT_MS` to 400. The shared example accepts HTTP 502 from Axum and HTTP 504 from Hono. To check a single gateway's exact behavior, use a single status in `httpStatus`. Configuration fixes the simulated network to Kite testnet and the offer to `0.001` pieUSD. Payloads contain synthetic signatures. The JSON report records expected and observed HTTP status and call order, and labels the evidence `simulation`. JSON is the default. Use `--format junit` for an XML test suite with one test case per scenario and failure details suitable for CI. Redirect stdout to a file to retain the report from a failed run.

Exit statuses are `0` for a passing suite, `1` for a failed run and `2` for invalid options or suite input.

## `verify-receipt`

```sh
kite-x402-testkit verify-receipt \
  --tx <hash> --payer <address> --pay-to <address> --amount <integer> \
  [--confirmations <n>] [--rpc-url <url>] [--timeout-ms <n>] [--format text|json]
```

Checks a known transaction on Kite testnet (`eip155:2368`). Supply the hash, token sender, receiver, and expected pieUSD amount in atomic units. The token sender comes from the transfer event and can differ from the transaction submitter. The asset is fixed to Kite testnet pieUSD.

The command reads the chain ID, receipt, current height and canonical block at the receipt's height. A pass requires a successful transaction and exactly one pieUSD `Transfer` event matching all supplied terms. The default is two confirmations including the mined block. This threshold measures depth as reported by the chosen RPC. The RPC deadline covers all reads and defaults to 10000 ms (range 100 through 30000). The default RPC is `https://rpc-testnet.gokite.ai`. An override must use HTTPS or HTTP on loopback. The command sends no signed transaction, follows no redirects, and excludes the RPC URL from the report.

JSON output uses `schemaVersion: 1` and `evidence: "chain_receipt"`. It identifies the transaction, expected terms, and, when available, the observed block hash, height, and confirmation count. A passing result also includes the matching log index. Block height, confirmation count, amount, and log index use decimal strings where they describe on-chain observations or token amounts.

| Exit | Result         | Reason codes                                                                                                                 |
| ---- | -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `0`  | `passed`       | `passed`                                                                                                                     |
| `1`  | `failed`       | `wrong_chain`, `transaction_reverted`, `transfer_mismatch`, `ambiguous_transfer`                                             |
| `2`  | Invalid input  | Invalid command arguments, or an `invalid_input` report for invalid values                                                   |
| `3`  | `inconclusive` | `receipt_not_found`, `insufficient_confirmations`, `block_not_canonical`, `rpc_timeout`, `rpc_error`, `invalid_rpc_response` |

See the [testnet walkthrough](TESTNET.md) for a reproducible historical example and the evidence to retain for a paid smoke test.
