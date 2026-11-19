export const KITE_NETWORKS = {
  "eip155:2366": {
    label: "Kite Mainnet",
    asset: "0x7aB6f3ed87C42eF0aDb67Ed95090f8bF5240149e",
    domainName: "Bridged USDC (Kite AI)",
    domainVersion: "2",
  },
  "eip155:2368": {
    label: "Kite Testnet",
    asset: "0x38129cf4CE5E183eFF248F42A7D345Bb1B47621A",
    domainName: "pieUSD",
    domainVersion: "1",
  },
} as const;

export type KiteNetworkId = keyof typeof KITE_NETWORKS;

const MAX_UINT256 = (1n << 256n) - 1n;

export function isPositiveUint256(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{1,78}$/.test(value)) return false;
  const amount = BigInt(value);
  return amount > 0n && amount <= MAX_UINT256;
}

export function isKiteNetworkId(value: string): value is KiteNetworkId {
  return Object.hasOwn(KITE_NETWORKS, value);
}
