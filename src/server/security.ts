import "server-only";

import { randomBytes } from "crypto";

/**
 * Generate a unique coupon code in the format:
 *   GRID-XXXXXXXX-XXXXXXXX-XXXXXXXX
 *
 * Uses cryptographically random bytes to minimise collision probability.
 * With 96 bits of randomness the collision probability is negligible
 * even at millions of coupons.
 */
export function createCouponCode(): string {
  const seg = () => randomBytes(4).toString("hex").toUpperCase();
  return `GRID-${seg()}-${seg()}-${seg()}`;
}
