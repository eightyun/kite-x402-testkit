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
