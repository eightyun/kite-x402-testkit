# Kite testnet settlement verification

## Recheck the controlled payment

On November 23, 2026, an Axum gateway running with the Pieverse facilitator returned HTTP 402 for an unpaid `GET /v1/smoke.json` and quoted `0.001 pieUSD` on Kite testnet. A local x402 test buyer paid once. The gateway returned HTTP 200, the buyer verified the expected JSON response, and its `PAYMENT-RESPONSE` identified the settlement transaction below.

Build the CLI and run this read-only example to recheck the transfer through Kite RPC.

```sh
npm run build
npm start -- verify-receipt \
  --tx 0x4acb77502d0234fbdd9ac3f632f29d3702027969552aae2a339357018c951663 \
  --payer 0xe0bef6b59fec9b1578e387b200cc1dfb9854ba1b \
  --pay-to 0x19f76e3b3445d468fbb6af55067cd609869f8f62 \
  --amount 1000000000000000 --format json
```

Expect `status: "passed"`, block `22045337` and transfer log index `1`. The confirmation count reflects the height reported by the RPC at query time.

## Verify a controlled paid test

1. Choose a testnet service you control. Run `check` with `--network eip155:2368`, the intended `--pay-to`, `--amount` and `--format json`. Save the matching offer as evidence of the advertised terms.
2. Use a buyer that supports Kite testnet and pieUSD to make one authorized test payment. Save the target status and evidence that the protected response was delivered. For a service that returns a v2 `PAYMENT-RESPONSE`, check that the decoded settlement indicates success on `eip155:2368` and use its `transaction` field. If the buyer omits the receipt, use the settlement hash recorded by the controlled service for the same request. If delivery or settlement is uncertain, resolve the original request before considering another payment.
3. Run `verify-receipt` with that hash, the buyer's token sender address, and the receiver and amount from the selected offer. Retain the report with the challenge and delivery evidence. Share only the terms, outcome, transaction hash and verification report. Keep credentials and signed payment headers private.

## Use kx402 as an external buyer

[kx402 v0.3.1](https://github.com/wilsonqc223/kite-x402-client/releases/tag/v0.3.1) can probe a quote, sign a payment, and show the service's settlement hash. Testkit checks the expected quote and verifies the resulting transfer through Kite RPC. The tools exchange evidence through the x402 response and the transaction hash.

For a controlled service with exactly one payment offer, set `SERVICE_URL` to its paid GET endpoint and `PAY_TO` to the expected testnet recipient. Check the quote and preview the first offer without a wallet.

```sh
kite-x402-testkit check --url "$SERVICE_URL" --network eip155:2368 \
  --pay-to "$PAY_TO" --amount 1000000000000000 --format json
kx402 pay -dry-run -o 0 -max-usd 0.001 "$SERVICE_URL"
```

Confirm that the preview matches the checked network, recipient, asset and exact amount before paying. `-max-usd` caps the price. `kx402 pay` fetches the quote again, so keep the controlled service's payment configuration fixed between the preview and the paid call. For one authorized payment, set `TESTNET_KEY_FILE` to the dedicated testnet buyer's local key file and run:

```sh
kx402 pay -o 0 -max-usd 0.001 -key-file "$TESTNET_KEY_FILE" "$SERVICE_URL"
```

Compare the printed response with the expected business data. Use the settlement hash printed by `kx402`, or the one recorded by the service for that request, as `--tx` in `verify-receipt`. Supply the test wallet's public address as `--payer` and the original expected recipient and amount as `--pay-to` and `--amount`.

Compatibility was checked with Axum, a local upstream, and a mock facilitator. The run covered a matching quote, refusal above the price cap, successful delivery with a synthetic settlement hash, and a verification refusal that reached neither upstream nor settlement. Use the actual testnet transaction above to reproduce the independent RPC verification.

## Passport compatibility

Treat Passport as an optional buyer. The `kpass` 6.13.9 sandbox help names Kite testnet, and its separate development settlement reference names Arc testnet. Check the active environment for Kite testnet, the intended service and pieUSD before using Passport for the paid test. The example above used the local x402 buyer. The verification workflow requires the Kite settlement hash from the response or the controlled service. The read-only commands and local CI run independently of the buyer.
