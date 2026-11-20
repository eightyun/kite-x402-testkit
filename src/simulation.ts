import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { validateChallenge } from "./challenge.js";
import { KITE_NETWORKS } from "./kite.js";
import {
  expectedCalls,
  isRecord,
  type Operation,
  type Scenario,
  type Suite,
} from "./scenarios.js";
import {
  AMOUNT,
  NETWORK,
  PAY_TO,
  PRICE,
  paymentHeader,
  startFixture,
  UPSTREAM_TIMEOUT_MS,
} from "./simulation-fixture.js";

type Fixture = Awaited<ReturnType<typeof startFixture>>;
export type Command = [string, ...string[]];

export interface ScenarioResult {
  id: string;
  mode: Scenario["mode"];
  status: "passed" | "failed";
  reasonCode: string;
  expectedHttpStatus: Scenario["httpStatus"];
  httpStatus?: number;
  expectedCalls: readonly Operation[];
  calls: Operation[];
}

export interface SimulationReport {
  schemaVersion: 1;
  evidence: "simulation";
  status: "passed" | "failed";
  scenarios: ScenarioResult[];
}

async function availablePort(): Promise<number> {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error || !address || typeof address === "string")
          reject(new Error("port_unavailable"));
        else resolve(address.port);
      });
    });
  });
}

function launchGateway(
  [executable, ...args]: Command,
  cwd: string,
  port: number,
  fixture: Fixture,
  scenario: Scenario,
) {
  const child = spawn(
    executable.includes("/") || executable.includes("\\")
      ? resolve(executable)
      : executable,
    args,
    {
      cwd,
      stdio: "ignore",
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        PORT: String(port),
        UPSTREAM_URL: fixture.upstream,
        FACILITATOR_URL: fixture.facilitator,
        FACILITATOR_HEALTH_INTERVAL_SECS: "0",
        KITE_NETWORK: "testnet",
        PRICE_USD: PRICE,
        PAY_TO,
        ...(scenario.mode === "upstream-timeout"
          ? { UPSTREAM_TIMEOUT_MS: String(UPSTREAM_TIMEOUT_MS) }
          : {}),
      },
    },
  );
  let problem: string | undefined;
  const closed = new Promise<void>((resolve) => {
    child.once("error", () => {
      problem = "gateway_start_failed";
    });
    child.once("close", () => {
      problem ??= "gateway_exited";
      resolve();
    });
  });
  return {
    get problem() {
      return problem;
    },
    async close() {
      if (problem === undefined) child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 1_000);
      try {
        await closed;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

async function ready(
  origin: string,
  gateway: ReturnType<typeof launchGateway>,
  signal: AbortSignal,
): Promise<string | undefined> {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    signal.throwIfAborted();
    if (gateway.problem) return gateway.problem;
    try {
      const response = await fetch(`${origin}/healthz`, {
        redirect: "manual",
        signal: AbortSignal.any([signal, AbortSignal.timeout(250)]),
      });
      await response.body?.cancel();
      if (response.status === 200 && !gateway.problem) return undefined;
    } catch {
      // 进程可能尚未开始监听。
    }
    await delay(50, undefined, { signal });
  }
  return gateway.problem ?? "gateway_start_timeout";
}

async function responseText(response: Response): Promise<string> {
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, size).toString("utf8");
      size += value.byteLength;
      if (size > 64 * 1024) throw new Error("response_too_large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function validReceipt(
  header: string | null,
  expected: Fixture["receipt"] | Fixture["rejection"],
): boolean {
  if (header === null || header.length > 4096) return false;
  try {
    const bytes = Buffer.from(header, "base64");
    if (
      bytes.toString("base64").replace(/=+$/, "") !== header.replace(/=+$/, "")
    )
      return false;
    const value: unknown = JSON.parse(bytes.toString("utf8"));
    return (
      isRecord(value) &&
      Object.entries(expected).every(([key, field]) => value[key] === field)
    );
  } catch {
    return false;
  }
}

async function runScenario(
  path: string,
  scenario: Scenario,
  command: Command,
  signal: AbortSignal,
): Promise<ScenarioResult> {
  const expected: readonly Operation[] = expectedCalls[scenario.mode];
  const cwd = await mkdtemp(join(tmpdir(), "kite-x402-testkit-"));
  let fixture: Fixture | undefined;
  let gateway: ReturnType<typeof launchGateway> | undefined;
  let httpStatus: number | undefined;
  const result = (reasonCode: string): ScenarioResult => ({
    id: scenario.id,
    mode: scenario.mode,
    status: reasonCode === "passed" ? "passed" : "failed",
    reasonCode,
    expectedHttpStatus: scenario.httpStatus,
    ...(httpStatus === undefined ? {} : { httpStatus }),
    expectedCalls: expected,
    calls: [...(fixture?.calls ?? [])],
  });

  try {
    fixture = await startFixture(path, scenario);
    const port = await availablePort();
    const origin = `http://127.0.0.1:${port}`;
    signal.throwIfAborted();
    gateway = launchGateway(command, cwd, port, fixture, scenario);
    const problem = await ready(origin, gateway, signal);
    if (problem) return result(problem);
    const url = `${origin}${path}`;
    const challenge = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
    });
    await challenge.body?.cancel();
    const required = challenge.headers.get("payment-required");
    if (challenge.status !== 402 || required === null)
      return result("missing_challenge");
    const terms = validateChallenge(required, {
      network: NETWORK,
      asset: KITE_NETWORKS[NETWORK].asset,
      payTo: PAY_TO,
      amount: AMOUNT,
    });
    if (!terms.ok) return result(terms.reasonCode);
    if (fixture.calls.length !== 0) return result("unexpected_unpaid_calls");

    const paid = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
      headers: { "payment-signature": paymentHeader(terms.accepted) },
    });
    httpStatus = paid.status;
    const body = await responseText(paid);
    if (fixture.invalidRequests !== 0)
      return result("unexpected_fixture_request");
    if (
      fixture.calls.length !== expected.length ||
      !expected.every((call, index) => fixture?.calls[index] === call)
    )
      return result("unexpected_call_sequence");
    const expectedStatuses = [scenario.httpStatus].flat();
    if (!expectedStatuses.includes(httpStatus))
      return result("unexpected_http_status");
    const receipt = paid.headers.get("payment-response");
    if (scenario.mode === "success") {
      if (!validReceipt(receipt, fixture.receipt))
        return result("invalid_simulated_receipt");
      let delivered: unknown;
      try {
        delivered = JSON.parse(body);
      } catch {
        return result("missing_upstream_delivery");
      }
      if (
        !isRecord(delivered) ||
        delivered.testkitResource !== fixture.delivery.testkitResource
      )
        return result("missing_upstream_delivery");
    } else {
      if (body.includes(fixture.delivery.testkitResource))
        return result("unexpected_paid_delivery");
      if (
        receipt !== null &&
        (scenario.mode !== "settle-rejected" ||
          !validReceipt(receipt, fixture.rejection))
      ) {
        return result("unexpected_payment_response");
      }
    }
    return result("passed");
  } catch (error) {
    signal.throwIfAborted();
    const reasonCode =
      error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name)
        ? "request_timeout"
        : error instanceof Error && error.message === "response_too_large"
          ? "response_too_large"
          : "simulation_error";
    return result(reasonCode);
  } finally {
    try {
      await gateway?.close();
    } finally {
      await fixture?.close();
      await rm(cwd, { recursive: true, force: true });
    }
  }
}

export async function runSimulation(
  suite: Suite,
  command: Command,
  signal: AbortSignal,
): Promise<SimulationReport> {
  const scenarios: ScenarioResult[] = [];
  for (const scenario of suite.scenarios) {
    signal.throwIfAborted();
    scenarios.push(await runScenario(suite.path, scenario, command, signal));
  }
  return {
    schemaVersion: 1,
    evidence: "simulation",
    status: scenarios.every((scenario) => scenario.status === "passed")
      ? "passed"
      : "failed",
    scenarios,
  };
}
