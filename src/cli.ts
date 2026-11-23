#!/usr/bin/env node
import { checkEndpoint, type CheckOptions } from "./checker.js";
import { formatReceipt, verifyReceipt } from "./receipt.js";
import { formatText } from "./report.js";
import { loadSuite, type Suite } from "./scenarios.js";
import { runSimulation, type Command } from "./simulation.js";
import { formatJUnit } from "./simulation-report.js";

const HELP = `Kite x402 Testkit

Usage:
  kite-x402-testkit check --url <url> [options]
  kite-x402-testkit simulate --suite <file> [--format json|junit] -- <gateway> [args...]
  kite-x402-testkit verify-receipt --tx <hash> --payer <address> --pay-to <address> --amount <integer> [options]

Receipt options:
  --rpc-url <url>            Kite testnet RPC override
  --confirmations <n>        Minimum confirmations, including the mined block (default 2)
  --timeout-ms <n>           Total RPC deadline from 100 to 30000 (default 10000)
  --format <text|json>       Output format (default text)

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

function readOptions(
  args: string[],
  supported: Set<string>,
): Map<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (
      !flag ||
      !supported.has(flag) ||
      values.has(flag) ||
      !value ||
      value.startsWith("--")
    )
      throw new Error("invalid_input");
    values.set(flag, value);
  }
  return values;
}

function parseArgs(args: string[]): {
  options: CheckOptions;
  format: "text" | "json";
} {
  if (args[0] !== "check") throw new Error("invalid_input");
  const values = readOptions(
    args.slice(1),
    new Set([
      "--url",
      "--network",
      "--asset",
      "--pay-to",
      "--amount",
      "--timeout-ms",
      "--format",
    ]),
  );
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

async function receipt(args: string[]): Promise<void> {
  let options: Map<string, string>;
  const invalid = () => {
    process.stderr.write(
      "Error: invalid receipt option. See verify-receipt --help.\n",
    );
    process.exitCode = 2;
  };
  try {
    options = readOptions(
      args,
      new Set([
        "--tx",
        "--payer",
        "--pay-to",
        "--amount",
        "--rpc-url",
        "--confirmations",
        "--timeout-ms",
        "--format",
      ]),
    );
  } catch {
    invalid();
    return;
  }
  const transactionHash = options.get("--tx");
  const payer = options.get("--payer");
  const payTo = options.get("--pay-to");
  const amount = options.get("--amount");
  const rpcUrl = options.get("--rpc-url");
  const confirmations = options.get("--confirmations");
  const timeoutMs = options.get("--timeout-ms");
  const format = options.get("--format") ?? "text";
  if (
    !transactionHash ||
    !payer ||
    !payTo ||
    !amount ||
    (format !== "text" && format !== "json") ||
    [confirmations, timeoutMs].some(
      (value) => value !== undefined && !/^\d+$/.test(value),
    )
  ) {
    invalid();
    return;
  }
  const report = await verifyReceipt({
    transactionHash,
    payer,
    payTo,
    amount,
    ...(rpcUrl === undefined ? {} : { rpcUrl }),
    ...(confirmations === undefined
      ? {}
      : { confirmations: Number(confirmations) }),
    ...(timeoutMs === undefined ? {} : { timeoutMs: Number(timeoutMs) }),
  });
  process.stdout.write(
    `${format === "json" ? JSON.stringify(report, null, 2) : formatReceipt(report)}\n`,
  );
  if (report.reasonCode === "invalid_input") process.exitCode = 2;
  else if (report.status === "inconclusive") process.exitCode = 3;
  else if (report.status === "failed") process.exitCode = 1;
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
  if (args[0] === "verify-receipt") {
    await receipt(args.slice(1));
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
