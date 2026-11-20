#!/usr/bin/env node
import { checkEndpoint, type CheckOptions } from "./checker.js";
import { formatText } from "./report.js";
import { loadSuite, type Suite } from "./scenarios.js";
import { runSimulation, type Command } from "./simulation.js";
import { formatJUnit } from "./simulation-report.js";

const HELP = `Kite x402 Testkit

Usage:
  kite-x402-testkit check --url <url> [options]
  kite-x402-testkit simulate --suite <file> [--format json|junit] -- <gateway> [args...]

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

async function simulate(
  flags: string[],
  [executable, ...args]: string[],
): Promise<void> {
  const options = new Map<string, string>();
  for (let index = 1; index < flags.length; index += 2) {
    const flag = flags[index];
    const value = flags[index + 1];
    if (
      (flag !== "--suite" && flag !== "--format") ||
      options.has(flag) ||
      !value ||
      value.startsWith("--")
    ) {
      process.stderr.write(
        "Error: invalid simulation option. See simulate --help.\n",
      );
      process.exitCode = 2;
      return;
    }
    options.set(flag, value);
  }
  const path = options.get("--suite");
  const format = options.get("--format") ?? "json";
  if (!path || !executable || (format !== "json" && format !== "junit")) {
    process.stderr.write(
      "Error: invalid simulation option. See simulate --help.\n",
    );
    process.exitCode = 2;
    return;
  }
  let suite: Suite;
  try {
    suite = await loadSuite(path);
  } catch {
    process.stderr.write("Error: invalid or unreadable scenario suite.\n");
    process.exitCode = 2;
    return;
  }
  const command: Command = [executable, ...args];
  const controller = new AbortController();
  let interruptCode = 0;
  const interrupt = (code: number) => {
    interruptCode ||= code;
    controller.abort();
  };
  const onInterrupt = () => interrupt(130);
  const onTerminate = () => interrupt(143);
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  try {
    const report = await runSimulation(suite, command, controller.signal);
    controller.signal.throwIfAborted();
    process.stdout.write(
      `${format === "junit" ? formatJUnit(report) : JSON.stringify(report, null, 2)}\n`,
    );
    if (report.status === "failed") process.exitCode = 1;
  } catch {
    process.stderr.write(
      interruptCode
        ? "Simulation interrupted.\n"
        : "Error: could not run the simulation.\n",
    );
    process.exitCode = interruptCode || 1;
  } finally {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const separator = args[0] === "simulate" ? args.indexOf("--") : -1;
  const flags = separator === -1 ? args : args.slice(0, separator);
  if (flags.length === 0 || flags.includes("--help") || flags.includes("-h")) {
    process.stdout.write(HELP);
    return;
  }
  if (args[0] === "simulate") {
    await simulate(flags, separator === -1 ? [] : args.slice(separator + 1));
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
