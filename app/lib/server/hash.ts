import { randomBytes } from "node:crypto";
import { keccak256, toBytes, toHex, type Hex } from "viem";

/** JSON with sorted keys and bigints as strings, so the same payload always hashes the same. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (typeof v === "bigint") return v.toString();
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]));
    }
    return v;
  });
}

/**
 * Salted hash of a charge or decision. Only the hash goes onchain; the payload and salt stay in the database,
 * so anyone holding both can prove what was decided without the chain revealing it.
 */
export function saltedHash(payload: unknown, salt: Hex = toHex(randomBytes(32))): { salt: Hex; hash: Hex } {
  return { salt, hash: keccak256(toBytes(`${salt}:${canonicalJson(payload)}`)) };
}
