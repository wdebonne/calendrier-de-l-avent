// Minimal streaming tar (ustar) writer and reader. Pure module, unit tested.
// Only what backups need: regular files with short names.

const BLOCK = 512;

export interface TarInput {
  name: string;
  size: number;
  content: AsyncIterable<Buffer> | Iterable<Buffer>;
}

function octal(value: number, length: number): string {
  const s = value.toString(8);
  if (s.length > length - 1) throw new Error("tar: value too large");
  return s.padStart(length - 1, "0") + "\0";
}

function header(name: string, size: number): Buffer {
  if (Buffer.byteLength(name) > 100) throw new Error("tar: name too long");
  const b = Buffer.alloc(BLOCK);
  b.write(name, 0);
  b.write(octal(0o600, 8), 100);
  b.write(octal(0, 8), 108);
  b.write(octal(0, 8), 116);
  b.write(octal(size, 12), 124);
  b.write(octal(0, 12), 136);
  b.write("        ", 148);
  b.write("0", 156);
  b.write("ustar\0" + "00", 257);
  let sum = 0;
  for (const byte of b) sum += byte;
  b.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
  return b;
}

export async function* packTar(entries: AsyncIterable<TarInput> | Iterable<TarInput>): AsyncGenerator<Buffer> {
  for await (const entry of entries) {
    yield header(entry.name, entry.size);
    let written = 0;
    for await (const chunk of entry.content) {
      written += chunk.length;
      yield chunk;
    }
    if (written !== entry.size) throw new Error(`tar: size mismatch for ${entry.name}`);
    const rest = entry.size % BLOCK;
    if (rest) yield Buffer.alloc(BLOCK - rest);
  }
  yield Buffer.alloc(BLOCK * 2);
}

class ByteReader {
  private queue: Buffer = Buffer.alloc(0);
  private it: AsyncIterator<Buffer>;

  constructor(source: AsyncIterable<Buffer>) {
    this.it = source[Symbol.asyncIterator]();
  }

  private async pull(): Promise<boolean> {
    const { value, done } = await this.it.next();
    if (done) return false;
    this.queue = this.queue.length ? Buffer.concat([this.queue, value]) : value;
    return true;
  }

  /** Exactly n bytes (n is small), or null at a clean end of stream. */
  async read(n: number): Promise<Buffer | null> {
    while (this.queue.length < n) {
      if (!(await this.pull())) {
        if (this.queue.length === 0) return null;
        throw new Error("tar: truncated archive");
      }
    }
    const out = this.queue.subarray(0, n);
    this.queue = this.queue.subarray(n);
    return out;
  }

  async *stream(n: number): AsyncGenerator<Buffer> {
    let left = n;
    while (left > 0) {
      if (!this.queue.length && !(await this.pull())) throw new Error("tar: truncated archive");
      const out = this.queue.subarray(0, left);
      this.queue = this.queue.subarray(out.length);
      left -= out.length;
      if (out.length) yield out;
    }
  }

  /** Consumes the rest, so that upstream integrity checks (gzip, GCM tag) run. */
  async drain() {
    this.queue = Buffer.alloc(0);
    while (!(await this.it.next()).done);
  }

  async close() {
    await this.it.return?.();
  }
}

export type TarVisitor = (entry: { name: string; size: number; content: AsyncIterable<Buffer> }) => Promise<void | "stop">;

/** Visits each file in order. Returning "stop" ends early; otherwise the archive must be complete. */
export async function readTar(source: AsyncIterable<Buffer>, visit: TarVisitor): Promise<void> {
  const reader = new ByteReader(source);
  for (;;) {
    const h = await reader.read(BLOCK);
    if (!h) throw new Error("tar: missing end of archive");
    if (h.every((b) => b === 0)) break;
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
    if (parseInt(h.subarray(148, 154).toString("latin1"), 8) !== sum) throw new Error("tar: bad checksum");
    const type = String.fromCharCode(h[156]);
    if (type !== "0" && type !== "\0") throw new Error("tar: unsupported entry");
    const name = h.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
    const size = parseInt(h.subarray(124, 135).toString("latin1"), 8);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error("tar: bad size");

    const content = reader.stream(size);
    if ((await visit({ name, size, content })) === "stop") {
      await reader.close();
      return;
    }
    for await (const _ of content) {
      /* whatever the visitor did not read */
    }
    const rest = size % BLOCK;
    if (rest) await reader.read(BLOCK - rest);
  }
  await reader.drain();
}
