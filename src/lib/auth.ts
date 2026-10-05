// Dashboard session: a signed, expiring cookie. Uses Web Crypto so the same
// code runs in the proxy and in server actions.

export const SESSION_COOKIE = "inquira_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

const encoder = new TextEncoder();

function secret(): string | null {
  return process.env.DASHBOARD_SECRET || process.env.DASHBOARD_PASSWORD || null;
}

async function hmac(value: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value));
  return Buffer.from(sig).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionValue(): Promise<string> {
  const key = secret();
  if (!key) throw new Error("DASHBOARD_PASSWORD is not set");
  const expires = String(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS);
  return `${expires}.${await hmac(expires, key)}`;
}

export async function verifySessionValue(value: string | undefined): Promise<boolean> {
  const key = secret();
  if (!key || !value) return false;
  const [expires, signature] = value.split(".");
  if (!expires || !signature || Number(expires) < Date.now() / 1000) return false;
  return safeEqual(signature, await hmac(expires, key));
}

export async function passwordMatches(input: string): Promise<boolean> {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return false;
  // Compare digests so the comparison time doesn't depend on the input length.
  const [a, b] = await Promise.all([hmac(input, "pw"), hmac(expected, "pw")]);
  return safeEqual(a, b);
}
