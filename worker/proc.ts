/** Drop undefined values so an env map can be handed to Bun.spawn. */
export function definedEnv(env: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

export const IMAGE_ONLY_PROMPT = "See the attached image.";

/** Image-only messages still need some text for providers that reject empty prompts. */
export function promptOrImageFallback(prompt: string, hasImages: boolean): string {
  return prompt.trim() === "" && hasImages ? IMAGE_ONLY_PROMPT : prompt;
}
