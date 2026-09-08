// ponytail: 120ms batch is the ceiling; drop toward 0 if Convex write load is fine
const FLUSH_MS = 120;

export function createLiveLog(write: (text: string) => Promise<unknown>) {
  let buf = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chain = Promise.resolve();

  const flush = () => {
    if (buf === "") return;
    const text = buf;
    buf = "";
    chain = chain.then(async () => { await write(text); });
  };

  return {
    push(text: string) {
      if (text === "") return;
      buf += text;
      clearTimeout(timer);
      timer = setTimeout(flush, FLUSH_MS);
    },
    async close() {
      clearTimeout(timer);
      flush();
      await chain;
    },
  };
}
