import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type RequestListener,
  type ServerResponse,
} from "node:http";
import { KITE_NETWORKS } from "./kite.js";
import { isRecord, type Operation, type Scenario } from "./scenarios.js";

export const NETWORK = "eip155:2368";
export const PRICE = "0.001";
export const AMOUNT = "1000000000000000";
export const PAY_TO = "0x0000000000000000000000000000000000000001";
export const PAYER = "0x0000000000000000000000000000000000000002";

const FIXTURE_SIGNATURE = "testkit-synthetic-signature";

export function paymentHeader(accepted: Record<string, unknown>): string {
  return Buffer.from(
    JSON.stringify({
      x402Version: 2,
      accepted,
      payload: {
        signature: FIXTURE_SIGNATURE,
        authorization: {
          from: PAYER,
          to: PAY_TO,
          value: AMOUNT,
          validAfter: "0",
          validBefore: "9999999999",
          nonce: `0x${"00".repeat(32)}`,
        },
      },
    }),
  ).toString("base64");
}

function send(response: ServerResponse, status: number, body: object) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function acceptsFixturePayment(
  request: IncomingMessage,
): Promise<boolean> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for await (const chunk of request) {
      if (!Buffer.isBuffer(chunk) || (bytes += chunk.length) > 64 * 1024)
        return false;
      chunks.push(chunk);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return (
      isRecord(body) &&
      isRecord(body.paymentPayload) &&
      body.paymentPayload.x402Version === 2 &&
      isRecord(body.paymentPayload.payload) &&
      body.paymentPayload.payload.signature === FIXTURE_SIGNATURE &&
      isRecord(body.paymentRequirements) &&
      body.paymentRequirements.network === NETWORK &&
      body.paymentRequirements.amount === AMOUNT
    );
  } catch {
    return false;
  }
}

export async function startFixture(path: string, scenario: Scenario) {
  const calls: Operation[] = [];
  let invalidRequests = 0;
  const delivery = { testkitResource: randomUUID() };
  const receipt = {
    success: true,
    network: NETWORK,
    transaction: `testkit-simulated-${randomUUID()}`,
    payer: PAYER,
  };
  const facilitator = await listen(async (request, response) => {
    if (request.method === "GET" && request.url === "/facilitator/supported") {
      const { domainName, domainVersion } = KITE_NETWORKS[NETWORK];
      send(response, 200, {
        kinds: [
          {
            x402Version: 2,
            scheme: "exact",
            network: NETWORK,
            extra: { name: domainName, version: domainVersion },
          },
        ],
        extensions: [],
        signers: {},
      });
    } else if (
      request.method === "POST" &&
      (request.url === "/facilitator/verify" ||
        request.url === "/facilitator/settle")
    ) {
      const operation = request.url.endsWith("/verify") ? "verify" : "settle";
      calls.push(operation);
      if (!(await acceptsFixturePayment(request))) {
        invalidRequests++;
        send(response, 400, { error: "unexpected_fixture_payment" });
        return;
      }
      send(
        response,
        200,
        operation === "verify" ? { isValid: true, payer: PAYER } : receipt,
      );
    } else {
      request.resume();
      invalidRequests++;
      send(response, 404, { error: "unexpected_fixture_request" });
    }
  });
  try {
    const upstream = await listen((request, response) => {
      request.resume();
      if (request.method !== "GET" || request.url !== path.slice(3)) {
        invalidRequests++;
        send(response, 404, { error: "unexpected_fixture_request" });
        return;
      }
      calls.push("upstream");
      if (scenario.mode === "upstream-error") {
        send(response, 503, { error: "testkit_upstream_failure" });
      } else {
        send(response, 200, delivery);
      }
    });
    return {
      facilitator: `${facilitator.origin}/facilitator`,
      upstream: upstream.origin,
      calls,
      get invalidRequests() {
        return invalidRequests;
      },
      delivery,
      receipt,
      close: () => Promise.all([facilitator.close(), upstream.close()]),
    };
  } catch (error) {
    await facilitator.close();
    throw error;
  }
}

async function listen(handler: RequestListener) {
  const server = createServer(handler);
  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") resolve(address.port);
      else reject(new Error("fixture_start_failed"));
    });
  });
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
