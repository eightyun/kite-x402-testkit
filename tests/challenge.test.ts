import assert from "node:assert/strict";
import test from "node:test";
import { validateChallenge } from "../src/challenge.js";
import { encodeChallenge, kiteChallenge } from "./helpers.js";

function failureReason(header: string): string {
  const result = validateChallenge(header, {});
  if (result.ok) throw new Error("Expected challenge validation to fail");
  return result.reasonCode;
}

test("accepts valid Kite mainnet and testnet offers", () => {
  for (const network of ["eip155:2366", "eip155:2368"] as const) {
    const result = validateChallenge(encodeChallenge(kiteChallenge(network)), {
      network,
    });
    assert.equal(result.ok, true);
    assert.equal(result.offers[0]?.network, network);
  }
});

test("rejects malformed Base64 and malformed JSON with stable reasons", () => {
  assert.equal(failureReason("!not-base64"), "invalid_base64");
  assert.equal(
    failureReason(Buffer.from("{").toString("base64")),
    "invalid_challenge_json",
  );
});

test("rejects unsupported versions, wrong asset, and wrong domain", () => {
  const wrongVersion = structuredClone(kiteChallenge()) as {
    x402Version: number;
  };
  wrongVersion.x402Version = 1;
  assert.equal(
    failureReason(encodeChallenge(wrongVersion)),
    "unsupported_x402_version",
  );

  const wrongAsset = structuredClone(kiteChallenge()) as {
    accepts: Array<Record<string, unknown>>;
  };
  wrongAsset.accepts[0]!.asset = "0x9999999999999999999999999999999999999999";
  assert.equal(failureReason(encodeChallenge(wrongAsset)), "no_kite_offer");

  const wrongDomain = structuredClone(kiteChallenge()) as {
    accepts: Array<{ extra: { name: string } }>;
  };
  wrongDomain.accepts[0]!.extra.name = "Wrong Token";
  assert.equal(failureReason(encodeChallenge(wrongDomain)), "no_kite_offer");
});

test("applies expected values to the same Kite offer", () => {
  const payload = kiteChallenge() as {
    accepts: Array<Record<string, unknown>>;
  };
  const original = payload.accepts[0];
  assert.ok(original);
  payload.accepts.push({
    ...original,
    payTo: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    amount: "10",
  });
  const result = validateChallenge(encodeChallenge(payload), {
    network: "eip155:2368",
    payTo: "0x1234567890123456789012345678901234567890",
    amount: "10",
  });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("Expected expected-value mismatch");
  assert.equal(result.reasonCode, "expectation_mismatch");
});

test("reports expected-value mismatch", () => {
  const result = validateChallenge(encodeChallenge(kiteChallenge()), {
    network: "eip155:2368",
    amount: "2",
  });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("Expected expected-value mismatch");
  assert.equal(result.reasonCode, "expectation_mismatch");
});

test("rejects challenge headers above the size limit", () => {
  assert.equal(failureReason("A".repeat(70_000)), "challenge_too_large");
});

test("rejects offers with invalid timeout or non-uint256 amount", () => {
  const noTimeout = structuredClone(kiteChallenge()) as {
    accepts: Array<Record<string, unknown>>;
  };
  delete noTimeout.accepts[0]!.maxTimeoutSeconds;
  assert.equal(failureReason(encodeChallenge(noTimeout)), "no_kite_offer");

  const largeAmount = structuredClone(kiteChallenge()) as {
    accepts: Array<Record<string, unknown>>;
  };
  largeAmount.accepts[0]!.amount = "1".repeat(79);
  assert.equal(failureReason(encodeChallenge(largeAmount)), "no_kite_offer");
});
