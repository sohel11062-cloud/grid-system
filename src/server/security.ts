import { createHash, randomBytes } from "crypto";

function toBase64Url(buf: Buffer): string {
  return buf.toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function randomState(bytes = 32): string {
  return toBase64Url(randomBytes(bytes));
}

export function createCouponCode(): string {
  const seg = () => randomBytes(2).toString("hex").toUpperCase();
  return `GRID-${seg()}-${seg()}-${seg()}`;
}