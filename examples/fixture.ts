import { createServer } from "node:http";

const requirement = {
  scheme: "exact",
  network: "eip155:2368",
  amount: "1000000000000000",
  asset: "0x38129cf4CE5E183eFF248F42A7D345Bb1B47621A",
  payTo: "0x1234567890123456789012345678901234567890",
  maxTimeoutSeconds: 60,
  extra: { name: "pieUSD", version: "1" },
};

const challenge = Buffer.from(
  JSON.stringify({
    x402Version: 2,
    accepts: [requirement],
  }),
).toString("base64");

const server = createServer((_request, response) => {
  response.writeHead(402, {
    "content-type": "application/json",
    "payment-required": challenge,
    "cache-control": "no-store",
  });
  response.end(JSON.stringify({ error: "payment required" }));
});

server.listen(8787, "127.0.0.1", () => {
  process.stdout.write(
    "Fixture listening at http://127.0.0.1:8787/v1/status\n",
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
