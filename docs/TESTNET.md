# Kite testnet settlement verification

## Reproduce a historical verification

The following public Kite testnet transaction contains a confirmed pieUSD transfer. Build the CLI and run this read-only example to check the receipt through Kite RPC.

```sh
npm run build
npm start -- verify-receipt \
  --tx 0x2ad2f404624044fdcd894a56a7d3d8461f754d02f7626c5b2bbead0a3f57517e \
  --payer 0x92df53ed56e3bacc6b9f2b1e10acda5355fbf9c9 \
  --pay-to 0x9e610cd701472bf7c815a6404b6ff88d81838c91 \
  --amount 1000000000000000 --format json
```

Expect `status: "passed"`, block `22041373` and transfer log index `1`. The current confirmation count will vary. This sample demonstrates the chain verification step.

## Verify a controlled paid test

1. Choose a testnet service you control. Run `check` with `--network eip155:2368`, the intended `--pay-to`, `--amount` and `--format json`. Save the matching offer as evidence of the advertised terms.
2. Use a buyer that supports Kite testnet and pieUSD to make one authorized test payment. Save the target status and evidence that the protected response was delivered. For a service that returns a v2 `PAYMENT-RESPONSE`, check that the decoded settlement indicates success on `eip155:2368` and use its `transaction` field. If the buyer omits the receipt, use the settlement hash recorded by the controlled service for the same request. If delivery or settlement is uncertain, resolve the original request before considering another payment.
3. Run `verify-receipt` with that hash, the buyer's token sender address, and the receiver and amount from the selected offer. Retain the report with the challenge and delivery evidence. Share only the terms, outcome, transaction hash and verification report. Keep credentials and signed payment headers private.

The historical transaction above exercises step 3. A paid smoke test also needs the quote and protected response from its own controlled call.

## Passport compatibility

Treat Passport as an optional buyer. The CLI has a `session execute` command, but the command reference shipped with `kpass` 6.13.9 lists Arc as its development settlement network. Before using a future Passport release for the paid test, confirm that its target environment supports Kite testnet, the intended service and pieUSD. The verification workflow requires the Kite settlement hash from the response or the controlled service. The read-only commands and local CI run independently of the buyer.
