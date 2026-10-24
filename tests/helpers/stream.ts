// Opens the live stream over a real HTTP connection and collects events as they arrive.
export async function openStream(baseUrl: string) {
  const controller = new AbortController();
  const res = await fetch(`${baseUrl}/api/events`, { signal: controller.signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  /** Resolves with the data of the next event of this type. */
  async function next(type: string, timeoutMs = 3000): Promise<any> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const match = new RegExp(`event: ${type.replace('.', '\\.')}\\ndata: (.*)\\n\\n`).exec(buffer);
      if (match) {
        buffer = buffer.slice(match.index + match[0].length);
        return JSON.parse(match[1]);
      }
      if (Date.now() > deadline) throw new Error(`No ${type} event within ${timeoutMs} ms`);
      const { value, done } = await reader.read();
      if (done) throw new Error('Stream closed');
      buffer += decoder.decode(value, { stream: true });
    }
  }

  return { res, next, close: () => controller.abort() };
}
