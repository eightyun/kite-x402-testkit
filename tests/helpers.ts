import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

export interface FixtureOptions {
  status?: number;
  challenge?: unknown;
  header?: string | null;
  delayMs?: number;
  redirect?: string;
}

export function encodeChallenge(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

export function kiteChallenge(
  network: "eip155:2366" | "eip155:2368" = "eip155:2368",
): unknown {
  const mainnet = network === "eip155:2366";
  return {
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network,
        amount: mainnet ? "1000" : "1000000000000000",
        asset: mainnet
          ? "0x7aB6f3ed87C42eF0aDb67Ed95090f8bF5240149e"
          : "0x38129cf4CE5E183eFF248F42A7D345Bb1B47621A",
        payTo: "0x1234567890123456789012345678901234567890",
        maxTimeoutSeconds: 60,
        extra: mainnet
          ? { name: "Bridged USDC (Kite AI)", version: "2" }
          : { name: "pieUSD", version: "1" },
      },
    ],
  };
}

export async function startFixture(
  options: FixtureOptions = {},
): Promise<{ url: string; server: Server }> {
  const server = createServer(
    async (_request: IncomingMessage, response: ServerResponse) => {
      if (options.delayMs)
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      if (options.redirect) {
        response.writeHead(302, { location: options.redirect });
        response.end();
        return;
      }
      const status = options.status ?? 402;
      const challenge = options.challenge ?? kiteChallenge();
      const encoded =
        options.header === undefined
          ? encodeChallenge(challenge)
          : options.header;
      response.statusCode = status;
      if (encoded !== null) response.setHeader("payment-required", encoded);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ error: "payment required" }));
    },
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Fixture did not bind to a TCP port");
  return {
    url: `http://127.0.0.1:${address.port}/v1/check?private=query-value`,
    server,
  };
}

export async function stopFixture(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
