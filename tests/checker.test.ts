import assert from "node:assert/strict";
import test from "node:test";
import { checkEndpoint } from "../src/checker.js";
import { startFixture, stopFixture } from "./helpers.js";

test("checks a Kite challenge and excludes query data from its report", async () => {
  const fixture = await startFixture();
  try {
    const report = await checkEndpoint({
      url: fixture.url,
      network: "eip155:2368",
      payTo: "0x1234567890123456789012345678901234567890",
      amount: "1000000000000000",
    });
    assert.equal(report.status, "passed");
    assert.equal(report.httpStatus, 402);
    assert.equal(report.target?.pathname, "/v1/check");
    assert.equal(JSON.stringify(report).includes("private=query-value"), false);
  } finally {
    await stopFixture(fixture.server);
  }
});

test("rejects a non-402 response and does not follow redirects", async () => {
  const ordinary = await startFixture({ status: 200 });
  const redirect = await startFixture({ redirect: "https://example.com/" });
  try {
    assert.equal(
      (await checkEndpoint({ url: ordinary.url })).reasonCode,
      "unexpected_http_status",
    );
    assert.equal(
      (await checkEndpoint({ url: redirect.url })).reasonCode,
      "unexpected_http_status",
    );
  } finally {
    await Promise.all([
      stopFixture(ordinary.server),
      stopFixture(redirect.server),
    ]);
  }
});

test("distinguishes a missing challenge header", async () => {
  const fixture = await startFixture({ header: null });
  try {
    assert.equal(
      (await checkEndpoint({ url: fixture.url })).reasonCode,
      "missing_payment_required",
    );
  } finally {
    await stopFixture(fixture.server);
  }
});

test("returns bounded timeout and validates input before network access", async () => {
  const slow = await startFixture({ delayMs: 500 });
  try {
    assert.equal(
      (await checkEndpoint({ url: slow.url, timeoutMs: 100 })).reasonCode,
      "request_timeout",
    );
  } finally {
    await stopFixture(slow.server);
  }

  assert.equal(
    (await checkEndpoint({ url: "http://example.com/v1/pay" })).reasonCode,
    "invalid_input",
  );
  assert.equal(
    (await checkEndpoint({ url: "https://user:pass@example.com/v1/pay" }))
      .reasonCode,
    "invalid_input",
  );
  assert.equal(
    (await checkEndpoint({ url: "file:///etc/passwd" })).reasonCode,
    "invalid_input",
  );
});
