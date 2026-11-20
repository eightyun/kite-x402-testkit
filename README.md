# Kite x402 Testkit

Kite x402 Testkit is a command-line acceptance tool for Kite x402 services. Use `check` to validate a service's unpaid x402 v2 challenge. Use `simulate` to exercise a local gateway's verification, upstream delivery, and settlement flow with controlled fixtures. Both commands report results for CI.

## Kite ecosystem integration

The checker validates the payment terms that Kite Passport agents need to evaluate before paying a service: x402 v2, the `exact` scheme, Kite mainnet (`eip155:2366`) or testnet (`eip155:2368`), the network's settlement asset, and its EIP-712 domain. The chain and asset constants are defined in `src/kite.ts`; challenge decoding and validation are in `src/challenge.ts`. These checks make a concrete protocol-level connection to Kite instead of merely naming the ecosystem.

The simulation exercises a Kite testnet offer using a synthetic payment payload. JSON reports label this evidence `simulation`. Live payment and on-chain receipt verification are planned separately.

## Requirements

- Node.js 22 or newer
- npm 10 or newer

## Install and build

```sh
git clone https://github.com/eightyun/kite-x402-testkit.git
cd kite-x402-testkit
npm ci
npm run check
npm test
npm run build
```

## Run

Check a service without sending a payment:

```sh
npm start -- check --url https://api.example.com/v1/weather
```

Assert an expected Kite network and receiving wallet:

```sh
npm start -- check \
  --url https://api.example.com/v1/weather \
  --network eip155:2368 \
  --pay-to 0x1234567890123456789012345678901234567890 \
  --amount 1000000000000000 \
  --format json
```

To check a local fixture, HTTP is accepted only for loopback hosts such as `127.0.0.1` and `localhost`:

```sh
npm run example
npm start -- check --url http://127.0.0.1:8787/v1/status --network eip155:2368
```

Available options:

| Option                  | Required | Description                                                   |
| ----------------------- | -------- | ------------------------------------------------------------- |
| `--url <url>`           | Yes      | Endpoint expected to return an unpaid HTTP 402 challenge      |
| `--network <id>`        | No       | Require `eip155:2366` or `eip155:2368`                        |
| `--asset <address>`     | No       | Require a specific asset address in the matching Kite offer   |
| `--pay-to <address>`    | No       | Require a specific receiving address                          |
| `--amount <integer>`    | No       | Require an exact token amount in atomic units                 |
| `--timeout-ms <n>`      | No       | Request deadline, default `10000`, allowed range `100..30000` |
| `--format <text\|json>` | No       | Output format, default `text`                                 |

When `--network` is omitted, at least one valid Kite mainnet or testnet offer must be present. Optional asset, payee, and amount expectations are checked against the same offer. Amounts are integer token units, not human-readable USD values.

## Simulate a payment flow

CI checks the official Kite Express template and the community Axum and Hono gateways. The pinned revisions and build commands are in [.github/workflows/ci.yml](.github/workflows/ci.yml). After building a gateway from its checkout, run it with the shared core suite.

```sh
node dist/src/cli.js simulate --suite examples/scenarios/core.json -- \
  node /absolute/path/to/kite-x402-services/templates/typescript-express/dist/index.js

node dist/src/cli.js simulate --suite examples/scenarios/core.json -- \
  /absolute/path/to/kite-x402-axum/target/debug/kite-x402-service

node dist/src/cli.js simulate --suite examples/scenarios/core.json --format junit -- \
  bun /absolute/path/to/kite-x402-hono/src/cli.ts > simulation.xml
```

The core suite checks successful delivery, an upstream HTTP error, verification refusal, and settlement refusal. Axum and Hono also run `examples/scenarios/upstream-timeout.json`. The official Express template has no configurable upstream timeout. Both suites check the HTTP result and exact call sequence. The fixtures use local HTTP and need no keys or funds. CI downloads the toolchains and dependencies before running the simulations.

## Exit codes and report

- `0`: all checks passed
- `1`: endpoint or challenge failed validation
- `2`: invalid CLI input or invocation

The `check` JSON output uses `schemaVersion: 1`, stable reason codes, sanitized target information, and the observed payment terms. It omits query strings, response bodies, authorization headers, cookies, and raw payment headers. The report does not contain secrets from the request because the CLI does not send any credentials.

## Test and CI

`npm test` runs the CLI and challenge regression tests. The fixtures cover a valid Kite challenge, network/asset/domain mismatches, expected-value mismatches, malformed or missing headers, unexpected status codes, timeout, and redirect handling. The suite does not contact Kite RPC, a facilitator, or any public service.

GitHub Actions runs formatting, type checking, tests, and a production build on pushes and pull requests. A separate job runs the shared suite against pinned official Express, Axum, and Hono versions and uploads a JUnit report for each gateway.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for module responsibilities, data flow, and security boundaries. See [docs/CLI.md](docs/CLI.md) for command and report details. See [CHANGELOG.md](CHANGELOG.md) for release history.

## Known limitations

- Only x402 v2 `exact` offers on the two configured Kite EVM networks are evaluated.
- A valid challenge does not prove that a paid request will succeed or settle.
- Simulations require a locally runnable gateway using the environment contract in [docs/CLI.md](docs/CLI.md).
- Live payment and chain finality are outside the current commands.

## License

Apache-2.0. See [LICENSE](LICENSE).
