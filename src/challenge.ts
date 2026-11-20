import {
  isKiteNetworkId,
  isPositiveUint256,
  KITE_NETWORKS,
  type KiteNetworkId,
} from "./kite.js";
import type { CheckReport, KiteOfferSummary, ReportCheck } from "./report.js";

const MAX_CHALLENGE_BYTES = 64 * 1024;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

interface ExpectedTerms {
  network?: KiteNetworkId;
  asset?: string;
  payTo?: string;
  amount?: string;
}

interface ParsedOffer extends KiteOfferSummary {
  networkId: KiteNetworkId;
  original: Record<string, unknown>;
}

type ChallengeResult =
  | {
      ok: true;
      checks: ReportCheck[];
      offers: KiteOfferSummary[];
      accepted: Record<string, unknown>;
    }
  | {
      ok: false;
      reasonCode: string;
      checks: ReportCheck[];
      offers: KiteOfferSummary[];
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeChallenge(value: string): unknown {
  if (Buffer.byteLength(value, "utf8") > MAX_CHALLENGE_BYTES) {
    throw new Error("challenge_too_large");
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) {
    throw new Error("invalid_base64");
  }
  const decoded = Buffer.from(value, "base64");
  const canonical = decoded.toString("base64").replace(/=+$/, "");
  if (canonical !== value.replace(/=+$/, "")) throw new Error("invalid_base64");
  try {
    return JSON.parse(decoded.toString("utf8")) as unknown;
  } catch {
    throw new Error("invalid_challenge_json");
  }
}

function parseKiteOffer(value: unknown): ParsedOffer | undefined {
  if (!isObject(value) || typeof value.network !== "string") return undefined;
  if (!isKiteNetworkId(value.network)) return undefined;
  const networkId = value.network as KiteNetworkId;
  const config = KITE_NETWORKS[networkId];
  const extra = value.extra;
  if (
    value.scheme !== "exact" ||
    typeof value.asset !== "string" ||
    value.asset.toLowerCase() !== config.asset.toLowerCase() ||
    !isPositiveUint256(value.amount) ||
    typeof value.payTo !== "string" ||
    !ADDRESS_PATTERN.test(value.payTo) ||
    typeof value.maxTimeoutSeconds !== "number" ||
    !Number.isSafeInteger(value.maxTimeoutSeconds) ||
    value.maxTimeoutSeconds <= 0 ||
    !isObject(extra) ||
    extra.name !== config.domainName ||
    extra.version !== config.domainVersion
  ) {
    return undefined;
  }
  return {
    networkId,
    original: value,
    scheme: "exact",
    network: networkId,
    asset: value.asset,
    amount: value.amount,
    payTo: value.payTo,
    maxTimeoutSeconds: value.maxTimeoutSeconds,
    domainName: config.domainName,
    domainVersion: config.domainVersion,
  };
}

function assertion(
  id: string,
  expected: string | undefined,
  actual: string | undefined,
): ReportCheck {
  if (expected === undefined) return { id, status: "passed" };
  if (actual === expected || actual?.toLowerCase() === expected.toLowerCase()) {
    return { id, status: "passed", expected, actual };
  }
  return {
    id,
    status: "failed",
    reasonCode: "expectation_mismatch",
    expected,
    ...(actual === undefined ? {} : { actual }),
  };
}

export function validateChallenge(
  header: string,
  expected: ExpectedTerms,
): ChallengeResult {
  let payload: unknown;
  try {
    payload = decodeChallenge(header);
  } catch (error) {
    const reasonCode =
      error instanceof Error ? error.message : "invalid_challenge_json";
    return {
      ok: false,
      reasonCode,
      checks: [{ id: "challenge.decode", status: "failed", reasonCode }],
      offers: [],
    };
  }

  if (!isObject(payload) || payload.x402Version !== 2) {
    return {
      ok: false,
      reasonCode: "unsupported_x402_version",
      checks: [
        {
          id: "protocol.version",
          status: "failed",
          reasonCode: "unsupported_x402_version",
          expected: "2",
        },
      ],
      offers: [],
    };
  }
  const versionCheck: ReportCheck = {
    id: "protocol.version",
    status: "passed",
    expected: "2",
    actual: "2",
  };
  if (!Array.isArray(payload.accepts)) {
    return {
      ok: false,
      reasonCode: "no_kite_offer",
      checks: [
        versionCheck,
        { id: "kite.offer", status: "failed", reasonCode: "no_kite_offer" },
      ],
      offers: [],
    };
  }

  const parsedOffers = payload.accepts
    .map(parseKiteOffer)
    .filter((offer): offer is ParsedOffer => offer !== undefined);
  const offers = parsedOffers.map(
    ({ networkId: _networkId, original: _original, ...offer }) => offer,
  );
  const eligible =
    expected.network === undefined
      ? parsedOffers
      : parsedOffers.filter((offer) => offer.networkId === expected.network);

  const offerCheck: ReportCheck =
    eligible.length > 0
      ? {
          id: "kite.offer",
          status: "passed",
          actual: eligible.map((offer) => offer.network).join(", "),
        }
      : {
          id: "kite.offer",
          status: "failed",
          reasonCode: "no_kite_offer",
          ...(expected.network === undefined
            ? {}
            : { expected: expected.network }),
        };
  const checks = [versionCheck, offerCheck];
  if (eligible.length === 0) {
    return { ok: false, reasonCode: "no_kite_offer", checks, offers };
  }

  const expectedAsset = expected.asset?.toLowerCase();
  const matched = eligible.find(
    (offer) =>
      (expectedAsset === undefined ||
        offer.asset.toLowerCase() === expectedAsset) &&
      (expected.payTo === undefined ||
        offer.payTo.toLowerCase() === expected.payTo.toLowerCase()) &&
      (expected.amount === undefined || offer.amount === expected.amount),
  );
  const selected =
    matched ??
    eligible.reduce((best, offer) => {
      const score =
        Number(
          expected.asset === undefined ||
            offer.asset.toLowerCase() === expected.asset.toLowerCase(),
        ) +
        Number(
          expected.payTo === undefined ||
            offer.payTo.toLowerCase() === expected.payTo.toLowerCase(),
        ) +
        Number(
          expected.amount === undefined || offer.amount === expected.amount,
        );
      const bestScore =
        Number(
          expected.asset === undefined ||
            best.asset.toLowerCase() === expected.asset.toLowerCase(),
        ) +
        Number(
          expected.payTo === undefined ||
            best.payTo.toLowerCase() === expected.payTo.toLowerCase(),
        ) +
        Number(
          expected.amount === undefined || best.amount === expected.amount,
        );
      return score > bestScore ? offer : best;
    });
  if (expected.asset !== undefined)
    checks.push(assertion("expect.asset", expected.asset, selected.asset));
  if (expected.payTo !== undefined)
    checks.push(assertion("expect.payTo", expected.payTo, selected.payTo));
  if (expected.amount !== undefined)
    checks.push(assertion("expect.amount", expected.amount, selected.amount));
  return matched
    ? { ok: true, checks, offers, accepted: matched.original }
    : { ok: false, reasonCode: "expectation_mismatch", checks, offers };
}
