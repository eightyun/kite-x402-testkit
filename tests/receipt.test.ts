import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test, { type TestContext } from "node:test";
import { KITE_NETWORKS } from "../src/kite.js";
import { verifyReceipt } from "../src/receipt.js";

const transactionHash = `0x${"ab".repeat(32)}`;
const blockHash = `0x${"cd".repeat(32)}`;
const payer = `0x${"01".repeat(20)}`;
const payTo = `0x${"02".repeat(20)}`;
const amount = "9007199254740993";
const transfer = {
  address: KITE_NETWORKS["eip155:2368"].asset,
  topics: [
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    `0x${payer.slice(2).padStart(64, "0")}`,
    `0x${payTo.slice(2).padStart(64, "0")}`,
  ],
  data: `0x${BigInt(amount).toString(16).padStart(64, "0")}`,
  transactionHash,
  blockHash,
  logIndex: "0x2",
  removed: false,
};
const receipt = {
  transactionHash,
  blockHash,
  blockNumber: "0x20",
  status: "0x1",
  logs: [transfer],
};
const defaults: Record<string, unknown> = {
  eth_chainId: "0x940",
  eth_getTransactionReceipt: receipt,
  eth_blockNumber: "0x21",
  eth_getBlockByNumber: { number: "0x20", hash: blockHash },
};

async function fixture(
  t: TestContext,
  overrides: Record<string, unknown> = {},
) {
  const calls: [string, unknown[]][] = [];
  const results = { ...defaults, ...overrides };
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += String(chunk);
    const rpc = JSON.parse(body) as {
      id: number;
      method: string;
      params: unknown[];
    };
    calls.push([rpc.method, rpc.params]);
    if (results[rpc.method] === undefined) return;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id: rpc.id,
        result: results[rpc.method],
      }),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  t.after(() => closeServer(server));
  return {
    rpcUrl: `http://127.0.0.1:${address.port}/rpc?token=private`,
    calls,
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

const input = { transactionHash, payer, payTo, amount };

test("verify-receipt CLI proves one confirmed transfer without disclosing its RPC URL", async (t) => {
  const { rpcUrl, calls } = await fixture(t);
  const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
  const args = [
    cli,
    "verify-receipt",
    "--tx",
    transactionHash,
    "--payer",
    payer,
    "--pay-to",
    payTo,
    "--amount",
    amount,
    "--rpc-url",
    rpcUrl,
    "--format",
    "json",
  ];
  const run = promisify(execFile);
  const { stdout, stderr } = await run(process.execPath, args, {
    timeout: 5000,
  });
  assert.equal(stderr, "");
  assert.doesNotMatch(stdout, /private/);
  const report = JSON.parse(stdout);
  assert.equal(report.status, "passed");
  assert.equal(report.evidence, "chain_receipt");
  assert.deepEqual(report.block, {
    hash: blockHash,
    number: "32",
    confirmations: "2",
  });
  assert.deepEqual(report.transfer, { logIndex: "2" });
  assert.deepEqual(calls, [
    ["eth_chainId", []],
    ["eth_getTransactionReceipt", [transactionHash]],
    ["eth_blockNumber", []],
    ["eth_getBlockByNumber", ["0x20", false]],
  ]);
  await assert.rejects(
    run(process.execPath, [...args, "--confirmations", "3"], { timeout: 5000 }),
    (error: unknown) => {
      assert.ok(
        error &&
          typeof error === "object" &&
          "code" in error &&
          "stdout" in error,
      );
      assert.equal(error.code, 3);
      assert.match(String(error.stdout), /insufficient_confirmations/);
      return true;
    },
  );
});

test("receipt verification rejects an invalid chain or inconsistent evidence", async (t) => {
  const cases = [
    { reason: "wrong_chain", changes: { eth_chainId: "0x93e" } },
    {
      reason: "transaction_reverted",
      changes: {
        eth_getTransactionReceipt: { ...receipt, status: "0x0", logs: [] },
      },
    },
    {
      reason: "transfer_mismatch",
      changes: {
        eth_getTransactionReceipt: {
          ...receipt,
          logs: [
            {
              ...transfer,
              data: `0x${(BigInt(amount) - 1n).toString(16).padStart(64, "0")}`,
            },
          ],
        },
      },
    },
    {
      reason: "transfer_mismatch",
      changes: {
        eth_getTransactionReceipt: {
          ...receipt,
          logs: [{ ...transfer, address: payTo }],
        },
      },
    },
    {
      reason: "transfer_mismatch",
      changes: {
        eth_getTransactionReceipt: {
          ...receipt,
          logs: [
            {
              ...transfer,
              topics: [...transfer.topics.slice(0, 2), transfer.topics[1]],
            },
          ],
        },
      },
    },
    {
      reason: "ambiguous_transfer",
      changes: {
        eth_getTransactionReceipt: {
          ...receipt,
          logs: [transfer, { ...transfer, logIndex: "0x3" }],
        },
      },
    },
  ];
  for (const { reason, changes } of cases) {
    const { rpcUrl, calls } = await fixture(t, changes);
    const report = await verifyReceipt({ ...input, rpcUrl });
    assert.equal(report.status, "failed", reason);
    assert.equal(report.reasonCode, reason);
    assert.equal(report.transfer, undefined);
    if (reason === "wrong_chain")
      assert.deepEqual(calls, [["eth_chainId", []]]);
  }
});

test("receipt verification distinguishes pending and unavailable evidence", async (t) => {
  const cases = [
    {
      reason: "receipt_not_found",
      changes: { eth_getTransactionReceipt: null },
    },
    {
      reason: "block_not_canonical",
      changes: {
        eth_getBlockByNumber: {
          ...(defaults.eth_getBlockByNumber as object),
          hash: `0x${"12".repeat(32)}`,
        },
      },
    },
    {
      reason: "invalid_rpc_response",
      changes: {
        eth_getTransactionReceipt: { ...receipt, transactionHash: blockHash },
      },
    },
    {
      reason: "rpc_timeout",
      changes: { eth_getTransactionReceipt: undefined },
    },
  ];
  for (const { reason, changes } of cases) {
    const { rpcUrl } = await fixture(t, changes);
    const report = await verifyReceipt({
      ...input,
      rpcUrl,
      timeoutMs: reason === "rpc_timeout" ? 100 : 5000,
    });
    assert.equal(report.status, "inconclusive");
    assert.equal(report.reasonCode, reason);
  }
});
