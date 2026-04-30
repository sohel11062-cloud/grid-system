import { createHash, randomBytes } from "crypto";

function toBase64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function randomState(size = 32) {
  return toBase64Url(randomBytes(size));
}

export function createPkcePair() {
  const verifier = randomState(64);
  const challenge = toBase64Url(createHash("sha256").update(verifier).digest());

  return { verifier, challenge };
}

export function createCouponCode() {
  const segment = () => randomBytes(2).toString("hex").toUpperCase();
  return `GRID-${segment()}-${segment()}-${segment()}`;
}
