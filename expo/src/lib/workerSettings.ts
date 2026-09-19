// ponytail: Metro only watches expo/ + convex/. Copy of shared/secrets + serverVariableNames.
export const serverVariableNames = [
  "FACTORY_PROVIDER",
  "CURSOR_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "CODEX_API_KEY",
  "CODEX_BASE_URL",
  "CODEX_PATH",
  "XAI_API_KEY",
  "XAI_MANAGEMENT_KEY",
  "GROK_PATH",
  "ANTHROPIC_API_KEY",
  "CLAUDE_PATH",
  "GITHUB_CLIENT_ID",
] as const;

function encode(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

export async function sealSecret(publicKey: string, value: string) {
  if (new TextEncoder().encode(value).length > 16384 || value.includes("\0")) {
    throw new Error("Values must be at most 16 KB and cannot contain NUL characters.");
  }
  const rsa = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(publicKey) as JsonWebKey,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const aes = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return JSON.stringify({
    version: 1,
    key: encode(await crypto.subtle.encrypt("RSA-OAEP", rsa, await crypto.subtle.exportKey("raw", aes))),
    iv: encode(iv.buffer),
    body: encode(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, new TextEncoder().encode(value)),
    ),
  });
}
