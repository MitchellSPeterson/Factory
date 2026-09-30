/** No network, navigation, frame embedding, or Worker credentials inside an artifact. */
export function isolatedArtifactHtml(html: string) {
  const policy =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width, initial-scale=1">`;
  // Prepend the restrictive policy before any untrusted script can execute.
  return `<!doctype html><html><head>${meta}</head><body>${html}</body></html>`;
}
