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
