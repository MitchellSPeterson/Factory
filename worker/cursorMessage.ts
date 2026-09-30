import { readFileSync } from "node:fs";
import type { SDKUserMessage } from "@cursor/sdk";
import { mimeForImagePath } from "./grokAcp";
import { promptOrImageFallback } from "./proc";

export type CursorImageData = { data: string; mimeType: string };

export function cursorImagesFromPaths(paths: readonly string[]): CursorImageData[] {
  return paths.flatMap((file) => {
    try {
      return [{ data: readFileSync(file).toString("base64"), mimeType: mimeForImagePath(file) }];
    } catch {
      console.warn(`Skipping unreadable image attachment: ${file}`);
      return [];
    }
  });
}

export function cursorUserMessage(
  prompt: string,
  images: readonly CursorImageData[] = [],
): string | SDKUserMessage {
  const text = promptOrImageFallback(prompt, images.length > 0);
  if (images.length === 0) return text;
  return { text, images: [...images] };
}
