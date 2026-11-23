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

## Passport compatibility

Treat Passport as an optional buyer. The `kpass` 6.13.9 sandbox help names Kite testnet, and its separate development settlement reference names Arc testnet. Check the active environment for Kite testnet, the intended service and pieUSD before using Passport for the paid test. The example above used the local x402 buyer. The verification workflow requires the Kite settlement hash from the response or the controlled service. The read-only commands and local CI run independently of the buyer.
