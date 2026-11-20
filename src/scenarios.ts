import { constants } from "node:fs";
import { open } from "node:fs/promises";

export type Mode = "success" | "upstream-error";
export type Operation = "verify" | "upstream" | "settle";

export interface Scenario {
  id: string;
  mode: Mode;
  httpStatus: number;
}

export interface Suite {
  path: string;
  scenarios: Scenario[];
}

export const expectedCalls: Record<Mode, readonly Operation[]> = {
  success: ["verify", "upstream", "settle"],
  "upstream-error": ["verify", "upstream"],
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function loadSuite(path: string): Promise<Suite> {
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  let value: unknown;
  try {
    const maxBytes = 32 * 1024;
    const info = await file.stat();
    if (!info.isFile() || info.size > maxBytes)
      throw new Error("invalid_suite");
    const buffer = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > maxBytes) throw new Error("invalid_suite");
    value = JSON.parse(
      buffer.subarray(0, bytesRead).toString("utf8"),
    ) as unknown;
  } finally {
    await file.close();
  }
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) => !["schemaVersion", "path", "scenarios"].includes(key),
    ) ||
    value.schemaVersion !== 1 ||
    typeof value.path !== "string" ||
    value.path.length > 256 ||
    !/^\/v1(?:\/[a-zA-Z0-9_-]+)+$/.test(value.path) ||
    !Array.isArray(value.scenarios) ||
    value.scenarios.length === 0 ||
    value.scenarios.length > 20
  )
    throw new Error("invalid_suite");

  const ids = new Set<string>();
  const scenarios: Scenario[] = [];
  for (const scenario of value.scenarios as unknown[]) {
    if (
      !isRecord(scenario) ||
      Object.keys(scenario).some(
        (key) => !["id", "mode", "httpStatus"].includes(key),
      ) ||
      typeof scenario.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(scenario.id) ||
      ids.has(scenario.id) ||
      (scenario.mode !== "success" && scenario.mode !== "upstream-error") ||
      typeof scenario.httpStatus !== "number" ||
      !Number.isInteger(scenario.httpStatus) ||
      (scenario.mode === "success"
        ? scenario.httpStatus !== 200
        : scenario.httpStatus < 400 || scenario.httpStatus > 599)
    )
      throw new Error("invalid_suite");
    ids.add(scenario.id);
    scenarios.push({
      id: scenario.id,
      mode: scenario.mode,
      httpStatus: scenario.httpStatus,
    });
  }
  return { path: value.path, scenarios };
}
