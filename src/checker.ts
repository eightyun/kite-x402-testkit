import { validateChallenge } from "./challenge.js";
import {
  isKiteNetworkId,
  isPositiveUint256,
  type KiteNetworkId,
} from "./kite.js";
import type { CheckReport } from "./report.js";

export interface CheckOptions {
  url: string;
  network?: string;
  asset?: string;
  payTo?: string;
  amount?: string;
  timeoutMs?: number;
}

function validateUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("invalid_input");
  }
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    url.hostname.toLowerCase(),
  );
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== ""
  ) {
    throw new Error("invalid_input");
  }
  return url;
}

function failedReport(
  url: URL,
  reasonCode: string,
  httpStatus?: number,
): CheckReport {
  return {
    schemaVersion: 1,
    status: "failed",
    reasonCode,
    target: { origin: url.origin, pathname: url.pathname },
    ...(httpStatus === undefined ? {} : { httpStatus }),
    checks: [{ id: "endpoint.challenge", status: "failed", reasonCode }],
    offers: [],
  };
}

function invalidInputReport(): CheckReport {
  return {
    schemaVersion: 1,
    status: "failed",
    reasonCode: "invalid_input",
    checks: [{ id: "input", status: "failed", reasonCode: "invalid_input" }],
    offers: [],
  };
}

function validateOptions(options: CheckOptions): {
  url: URL;
  network?: KiteNetworkId;
  timeoutMs: number;
} {
  const url = validateUrl(options.url);
  if (options.network !== undefined && !isKiteNetworkId(options.network))
    throw new Error("invalid_input");
  if (options.asset !== undefined && !/^0x[a-fA-F0-9]{40}$/.test(options.asset))
    throw new Error("invalid_input");
  if (options.payTo !== undefined && !/^0x[a-fA-F0-9]{40}$/.test(options.payTo))
    throw new Error("invalid_input");
  if (options.amount !== undefined && !isPositiveUint256(options.amount))
    throw new Error("invalid_input");
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000)
    throw new Error("invalid_input");
  return {
    url,
    ...(options.network === undefined
      ? {}
      : { network: options.network as KiteNetworkId }),
    timeoutMs,
  };
}

export async function checkEndpoint(
  options: CheckOptions,
): Promise<CheckReport> {
  let validated: ReturnType<typeof validateOptions>;
  try {
    validated = validateOptions(options);
  } catch {
    return invalidInputReport();
  }

  const { url, network, timeoutMs } = validated;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" },
    });
  } catch (error) {
    const reasonCode =
      error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name)
        ? "request_timeout"
        : "transport_error";
    return failedReport(url, reasonCode);
  }

  try {
    await response.body?.cancel();
  } catch {
    // 响应正文不参与验收；取消读取仅作尽力清理。
  }

  if (response.status !== 402)
    return failedReport(url, "unexpected_http_status", response.status);
  const header = response.headers.get("payment-required");
  if (header === null)
    return failedReport(url, "missing_payment_required", response.status);

  const result = validateChallenge(header, {
    ...(network === undefined ? {} : { network }),
    ...(options.asset === undefined ? {} : { asset: options.asset }),
    ...(options.payTo === undefined ? {} : { payTo: options.payTo }),
    ...(options.amount === undefined ? {} : { amount: options.amount }),
  });
  return {
    schemaVersion: 1,
    status: result.ok ? "passed" : "failed",
    reasonCode: result.ok ? "passed" : result.reasonCode,
    target: { origin: url.origin, pathname: url.pathname },
    httpStatus: response.status,
    checks: result.checks,
    offers: result.offers,
  };
}
