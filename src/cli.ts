#!/usr/bin/env node
import { checkEndpoint, type CheckOptions } from "./checker.js";
import { formatText } from "./report.js";

const HELP = `Kite x402 Testkit

Usage:
  kite-x402-testkit check --url <url> [options]

Options:
  --url <url>                Endpoint that returns an unpaid x402 challenge
  --network <id>             Expected Kite network (eip155:2366 or eip155:2368)
  --asset <address>          Expected settlement asset
  --pay-to <address>         Expected receiving address
  --amount <integer>         Expected amount in atomic token units
  --timeout-ms <n>           Request deadline from 100 to 30000 (default 10000)
  --format <text|json>       Output format (default text)
  --help                     Show this help
`;

function parseArgs(args: string[]): {
  options: CheckOptions;
  format: "text" | "json";
} {
  if (args[0] !== "check") throw new Error("invalid_input");
  const values = new Map<string, string>();
  const supported = new Set([
    "--url",
    "--network",
    "--asset",
    "--pay-to",
    "--amount",
    "--timeout-ms",
    "--format",
  ]);
  for (let index = 1; index < args.length; index++) {
    const flag = args[index];
    if (!flag || !supported.has(flag) || values.has(flag))
      throw new Error("invalid_input");
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error("invalid_input");
    values.set(flag, value);
    index++;
  }
  const url = values.get("--url");
  if (!url) throw new Error("invalid_input");
  const format = values.get("--format") ?? "text";
  if (format !== "text" && format !== "json") throw new Error("invalid_input");
  const timeoutArg = values.get("--timeout-ms");
  const timeoutMs = timeoutArg === undefined ? undefined : Number(timeoutArg);
  if (timeoutArg !== undefined && !/^\d+$/.test(timeoutArg))
    throw new Error("invalid_input");
  return {
    options: {
      url,
      ...(values.has("--network") ? { network: values.get("--network")! } : {}),
      ...(values.has("--asset") ? { asset: values.get("--asset")! } : {}),
      ...(values.has("--pay-to") ? { payTo: values.get("--pay-to")! } : {}),
      ...(values.has("--amount") ? { amount: values.get("--amount")! } : {}),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    },
    format,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    process.stdout.write(HELP);
    return;
  }
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs(args);
  } catch {
    process.stderr.write(`${HELP}\nError: invalid command or option.\n`);
    process.exitCode = 2;
    return;
  }

  const report = await checkEndpoint(parsed.options);
  process.stdout.write(
    parsed.format === "json"
      ? `${JSON.stringify(report, null, 2)}\n`
      : `${formatText(report)}\n`,
  );
  if (report.reasonCode === "invalid_input") {
    process.exitCode = 2;
  } else if (report.status === "failed") {
    process.exitCode = 1;
  }
}

void main();
