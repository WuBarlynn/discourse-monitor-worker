import type { Env } from "./types";

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

export async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
  const cookie = request.headers.get("Cookie")?.match(/(?:^|;\s*)monitor_session=([^;]+)/)?.[1];
  if (!cookie) return false;
  const [payload, signature] = cookie.split(".");
  if (!payload || !signature || signature !== await sign(payload, env.SESSION_SECRET)) return false;
  try {
    const session = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { expiresAt: number };
    return session.expiresAt > Date.now();
  } catch {
    return false;
  }
}

export async function createSessionCookie(env: Env): Promise<string> {
  const payload = toBase64Url(encoder.encode(JSON.stringify({ expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 })));
  const signature = await sign(payload, env.SESSION_SECRET);
  return `monitor_session=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`;
}

export function clearSessionCookie(): string {
  return "monitor_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
}

export function passwordsMatch(actual: string, expected: string): boolean {
  const a = encoder.encode(actual);
  const b = encoder.encode(expected);
  if (a.byteLength !== b.byteLength) return false;
  let result = 0;
  for (let index = 0; index < a.byteLength; index += 1) result |= a[index] ^ b[index];
  return result === 0;
}
