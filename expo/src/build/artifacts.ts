import { useEffect, useState } from "react";
import { useConnection } from "@/lib/factory";

export type PreviewAnchor = {
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
  label?: string;
};
export type PreviewPin = {
  id: string;
  anchor: PreviewAnchor;
  label: string;
  resolved: boolean;
};
export type ArtifactPreviewProps = {
  html: string;
  title: string;
  pinning?: boolean;
  pins?: PreviewPin[];
  onPin?: (anchor: PreviewAnchor) => void;
  onSelectPin?: (id: string) => void;
};

export { isolatedArtifactHtml } from "./artifactHtml";

function base64(bytes: Uint8Array) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    result +=
      alphabet[(n >>> 18) & 63] +
      alphabet[(n >>> 12) & 63] +
      (b === undefined ? "=" : alphabet[(n >>> 6) & 63]) +
      (c === undefined ? "=" : alphabet[n & 63]);
  }
  return result;
}

export function useBuildArtifact(
  buildId: string,
  artifactId?: string,
  mimeHint?: string,
) {
  const { pairing } = useConnection();
  const [result, setResult] = useState<{
    content?: string;
    mime?: string;
    error?: string;
  }>({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setResult({});
    if (!pairing || !artifactId) return;
    const abort = new AbortController();
    void fetch(
      `${pairing.url}/mailbox/build-artifacts/${encodeURIComponent(buildId)}/${encodeURIComponent(artifactId)}${mimeHint?.startsWith("image/") ? "?format=raw" : ""}`,
      {
        headers: { authorization: `Bearer ${pairing.token}` },
        signal: abort.signal,
      },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? "This artifact is unavailable on the Worker."
              : "Could not load this artifact from the Worker.",
          );
        let content: string;
        let mime: string;
        if (mimeHint?.startsWith("image/")) {
          mime = mimeHint;
          content = `data:${mime};base64,${base64(new Uint8Array(await response.arrayBuffer()))}`;
        } else {
          const body = (await response.json()) as {
            content: string;
            mime: string;
            title: string;
          };
          mime = body.mime;
          content = body.content;
        }
        if (!abort.signal.aborted) setResult({ content, mime });
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          setResult({
            error:
              error instanceof Error
                ? error.message
                : "Could not load artifact.",
          });
      });
    return () => abort.abort();
  }, [pairing?.url, pairing?.token, buildId, artifactId, mimeHint, retry]);
  return { ...result, reload: () => setRetry((value) => value + 1) };
}
