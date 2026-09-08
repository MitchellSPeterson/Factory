// Hybrid encryption: only the destination worker holds the private key.
function encode(bytes: ArrayBuffer) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }
function decode(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
export async function sealSecret(publicKey: string, value: string) {
  if (new TextEncoder().encode(value).length > 16384 || value.includes("\0")) throw new Error("Values must be at most 16 KB and cannot contain NUL characters.");
  const rsa = await crypto.subtle.importKey("jwk", JSON.parse(publicKey), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const aes = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return JSON.stringify({ version: 1, key: encode(await crypto.subtle.encrypt("RSA-OAEP", rsa, await crypto.subtle.exportKey("raw", aes))), iv: encode(iv.buffer), body: encode(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, new TextEncoder().encode(value))) });
}
export async function openSecret(privateKey: JsonWebKey, sealed: string) {
  const data = JSON.parse(sealed) as { version: number; key: string; iv: string; body: string };
  if (data.version !== 1) throw new Error("Unsupported encrypted value.");
  const rsa = await crypto.subtle.importKey("jwk", privateKey, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
  const raw = await crypto.subtle.decrypt("RSA-OAEP", rsa, decode(data.key));
  const aes = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(data.iv) }, aes, decode(data.body)));
}
