import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { startFixture, stopFixture } from "./helpers.js";

const cliPath = fileURLToPath(new URL("../src/cli.js", import.meta.url));

async function runCli(
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [cliPath, ...args], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 5_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

test("CLI emits JSON and returns success for a passing endpoint", async () => {
  const fixture = await startFixture();
  try {
    const result = await runCli([
      "check",
      "--url",
      fixture.url,
      "--format",
      "json",
    ]);
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      status: string;
      reasonCode: string;
    };
    assert.equal(report.status, "passed");
    assert.equal(report.reasonCode, "passed");
  } finally {
    await stopFixture(fixture.server);
  }
});

test("CLI uses separate exit codes for failed checks and invalid input", async () => {
  const invalidInput = await runCli(["check", "--url", "http://example.com"]);
  assert.equal(invalidInput.code, 2);

  const result = await runCli(["unknown"]);
  assert.equal(result.code, 2);

  const fixture = await startFixture({ status: 200 });
  try {
    const failedCheck = await runCli(["check", "--url", fixture.url]);
    assert.equal(failedCheck.code, 1);
  } finally {
    await stopFixture(fixture.server);
  }
});
