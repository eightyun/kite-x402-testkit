import { isPositiveUint256, KITE_NETWORKS } from "./kite.js";

const NETWORK = "eip155:2368";
const ASSET = KITE_NETWORKS[NETWORK].asset.toLowerCase();
const DEFAULT_RPC = "https://rpc-testnet.gokite.ai";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const HASH = /^0x[0-9a-f]{64}$/i;
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/i;
const MAX_RPC_BYTES = 1024 * 1024;

export interface ReceiptOptions {
  transactionHash: string;
  payer: string;
  payTo: string;
  amount: string;
  rpcUrl?: string;
  confirmations?: number;
  timeoutMs?: number;
}

type ReceiptOutcome =
  | { status: "passed"; reasonCode: "passed" }
  | {
      status: "failed";
      reasonCode:
        | "invalid_input"
        | "wrong_chain"
        | "transaction_reverted"
        | "transfer_mismatch"
        | "ambiguous_transfer";
    }
  | {
      status: "inconclusive";
      reasonCode:
        | "receipt_not_found"
        | "insufficient_confirmations"
        | "block_not_canonical"
        | "rpc_timeout"
        | "rpc_error"
        | "invalid_rpc_response";
    };

export type ReceiptReport = ReceiptOutcome & {
  schemaVersion: 1;
  evidence: "chain_receipt";
  network: typeof NETWORK;
  transactionHash?: string;
  expected?: {
    asset: string;
    payer: string;
    payTo: string;
    amount: string;
    confirmations: number;
  };
  block?: { hash: string; number: string; confirmations: string };
  transfer?: { logIndex: string };
};

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matches(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value);
}

function quantity(value: unknown): bigint {
  if (!matches(value, QUANTITY)) throw new InvalidRpcResponse();
  return BigInt(value);
}

class InvalidRpcResponse extends Error {}

function validate(options: ReceiptOptions) {
  const url = new URL(options.rpcUrl ?? DEFAULT_RPC);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const confirmations = options.confirmations ?? 2;
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (
    !(url.protocol === "https:" || (loopback && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.hash ||
    !HASH.test(options.transactionHash) ||
    !ADDRESS.test(options.payer) ||
    !ADDRESS.test(options.payTo) ||
    !isPositiveUint256(options.amount) ||
    !Number.isSafeInteger(confirmations) ||
    confirmations < 1 ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 30_000
  ) {
    throw new Error("invalid_input");
  }
  return {
    url,
    timeoutMs,
    transactionHash: options.transactionHash.toLowerCase(),
    expected: {
      asset: ASSET,
      payer: options.payer.toLowerCase(),
      payTo: options.payTo.toLowerCase(),
      amount: BigInt(options.amount).toString(),
      confirmations,
    },
  };
}

async function readRpcBody(response: Response): Promise<unknown> {
  if (!response.body) throw new InvalidRpcResponse();
  let length = 0;
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.body) {
    length += chunk.byteLength;
    if (length > MAX_RPC_BYTES) throw new InvalidRpcResponse();
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks, length).toString("utf8"));
  } catch {
    throw new InvalidRpcResponse();
  }
}

function rpcClient(url: URL, signal: AbortSignal) {
  let nextId = 1;
  return async (method: string, params: unknown[]): Promise<unknown> => {
    const id = nextId++;
    const response = await fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("rpc_error");
    }
    const message = await readRpcBody(response);
    if (!object(message) || message.jsonrpc !== "2.0" || message.id !== id)
      throw new InvalidRpcResponse();
    if (Object.hasOwn(message, "error")) throw new Error("rpc_error");
    if (!Object.hasOwn(message, "result")) throw new InvalidRpcResponse();
    return message.result;
  };
}

function findTransfers(
  logs: unknown[],
  expected: NonNullable<ReceiptReport["expected"]>,
  transactionHash: string,
  blockHash: string,
): string[] {
  const payerTopic = `0x${expected.payer.slice(2).padStart(64, "0")}`;
  const recipientTopic = `0x${expected.payTo.slice(2).padStart(64, "0")}`;
  const matchingIndexes: string[] = [];
  for (const log of logs) {
    if (
      !object(log) ||
      !matches(log.address, ADDRESS) ||
      !Array.isArray(log.topics)
    )
      throw new InvalidRpcResponse();
    if (
      log.address.toLowerCase() !== ASSET ||
      typeof log.topics[0] !== "string" ||
      log.topics[0].toLowerCase() !== TRANSFER_TOPIC
    )
      continue;
    if (
      log.topics.length !== 3 ||
      !matches(log.topics[1], HASH) ||
      !matches(log.topics[2], HASH) ||
      !matches(log.data, HASH) ||
      !matches(log.transactionHash, HASH) ||
      log.transactionHash.toLowerCase() !== transactionHash ||
      !matches(log.blockHash, HASH) ||
      log.blockHash.toLowerCase() !== blockHash ||
      log.removed !== false
    )
      throw new InvalidRpcResponse();
    const index = quantity(log.logIndex).toString();
    if (
      log.topics[1].toLowerCase() === payerTopic &&
      log.topics[2].toLowerCase() === recipientTopic &&
      BigInt(log.data) === BigInt(expected.amount)
    )
      matchingIndexes.push(index);
  }
  return matchingIndexes;
}

export async function verifyReceipt(
  options: ReceiptOptions,
): Promise<ReceiptReport> {
  const base = {
    schemaVersion: 1,
    evidence: "chain_receipt",
    network: NETWORK,
  } as const;
  let input: ReturnType<typeof validate>;
  try {
    input = validate(options);
  } catch {
    return { ...base, status: "failed", reasonCode: "invalid_input" };
  }
  const { transactionHash, expected } = input;
  const report = { ...base, transactionHash, expected };
  const signal = AbortSignal.timeout(input.timeoutMs);
  const call = rpcClient(input.url, signal);
  try {
    if (quantity(await call("eth_chainId", [])) !== 2368n)
      return { ...report, status: "failed", reasonCode: "wrong_chain" };

    const receipt = await call("eth_getTransactionReceipt", [transactionHash]);
    if (receipt === null)
      return {
        ...report,
        status: "inconclusive",
        reasonCode: "receipt_not_found",
      };
    if (
      !object(receipt) ||
      !matches(receipt.transactionHash, HASH) ||
      receipt.transactionHash.toLowerCase() !== transactionHash ||
      !matches(receipt.blockHash, HASH) ||
      !matches(receipt.blockNumber, QUANTITY) ||
      !Array.isArray(receipt.logs) ||
      (receipt.status !== "0x0" && receipt.status !== "0x1")
    )
      throw new InvalidRpcResponse();

    const blockNumber = quantity(receipt.blockNumber);
    const tip = quantity(await call("eth_blockNumber", []));
    const canonical = await call("eth_getBlockByNumber", [
      receipt.blockNumber,
      false,
    ]);
    const blockHash = receipt.blockHash.toLowerCase();
    if (canonical === null)
      return {
        ...report,
        status: "inconclusive",
        reasonCode: "block_not_canonical",
      };
    if (
      !object(canonical) ||
      !matches(canonical.hash, HASH) ||
      quantity(canonical.number) !== blockNumber
    )
      throw new InvalidRpcResponse();
    if (canonical.hash.toLowerCase() !== blockHash)
      return {
        ...report,
        status: "inconclusive",
        reasonCode: "block_not_canonical",
      };

    const confirmations = tip >= blockNumber ? tip - blockNumber + 1n : 0n;
    const withBlock = {
      ...report,
      block: {
        hash: blockHash,
        number: blockNumber.toString(),
        confirmations: confirmations.toString(),
      },
    };
    if (confirmations < BigInt(expected.confirmations))
      return {
        ...withBlock,
        status: "inconclusive",
        reasonCode: "insufficient_confirmations",
      };
    if (receipt.status === "0x0")
      return {
        ...withBlock,
        status: "failed",
        reasonCode: "transaction_reverted",
      };

    const [logIndex, ...otherMatches] = findTransfers(
      receipt.logs,
      expected,
      transactionHash,
      blockHash,
    );
    if (logIndex === undefined)
      return {
        ...withBlock,
        status: "failed",
        reasonCode: "transfer_mismatch",
      };
    if (otherMatches.length > 0)
      return {
        ...withBlock,
        status: "failed",
        reasonCode: "ambiguous_transfer",
      };
    return {
      ...withBlock,
      status: "passed",
      reasonCode: "passed",
      transfer: { logIndex },
    };
  } catch (error) {
    const reasonCode = signal.aborted
      ? "rpc_timeout"
      : error instanceof InvalidRpcResponse
        ? "invalid_rpc_response"
        : "rpc_error";
    return { ...report, status: "inconclusive", reasonCode };
  }
}

export function formatReceipt(report: ReceiptReport): string {
  return [
    `${report.status.toUpperCase()}: ${report.reasonCode}`,
    report.transactionHash &&
      `Transaction: ${report.transactionHash} (${report.network})`,
    report.block &&
      `Block: ${report.block.number} (${report.block.confirmations} confirmations, ${report.block.hash})`,
    report.transfer && `Transfer log: ${report.transfer.logIndex}`,
  ]
    .filter(Boolean)
    .join("\n");
}
