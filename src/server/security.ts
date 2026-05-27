import "server-only";

import { randomBytes } from "crypto";

/**
 * Generates a unique, cryptographically random coupon code.
 *
 * Format:  GRID-XXXXXXXX-XXXXXXXX-XXXXXXXX
 * Entropy: 96 bits — collision probability is negligible at millions of codes.
 */
export function createCouponCode(): string {

  const random =
    crypto.randomUUID()
      .replace(/-/g, "")
      .slice(0, 10)
      .toUpperCase();

  return `GRID-${random}`;
}