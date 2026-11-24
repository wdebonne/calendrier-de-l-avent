// Backup file container: a plain .tar.gz, or the same stream encrypted with a password.
// Pure Node module, unit tested.
import crypto from "node:crypto";
import fs from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import { packTar, readTar, type TarInput, type TarVisitor } from "./tar";

export type BackupErrorCode =
  | "busy"
  | "invalidFile"
  | "corrupted"
  | "passwordRequired"
  | "wrongPassword"
  | "newerVersion"
  | "noAdmin"
  | "noSpace"
  | "notFound"
  | "failed";

export class BackupError extends Error {
  constructor(
    public code: BackupErrorCode,
    detail?: string,
  ) {
    super(detail ?? code);
  }
}

// Encrypted layout: magic | salt | iv | password check | AES-256-GCM ciphertext | tag
const MAGIC = Buffer.from("ADVENTBK1\n");
const SALT = 16;
const IV = 12;
const CHECK = 16;
const TAG = 16;
const HEADER = MAGIC.length + SALT + IV + CHECK;

function deriveKey(password: string, salt: Buffer): Promise<{ key: Buffer; check: Buffer }> {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password.normalize("NFC"), salt, 32 + CHECK, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, out) =>
      e ? reject(e) : resolve({ key: out.subarray(0, 32), check: out.subarray(32) }),
    ),
  );
}

export type ContainerKind = "plain" | "encrypted" | null;

async function readAt(file: string, start: number, length: number): Promise<Buffer> {
  const handle = await fs.promises.open(file, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function containerKind(file: string): Promise<ContainerKind> {
  const head = await readAt(file, 0, MAGIC.length);
  if (head.equals(MAGIC)) return "encrypted";
  return head[0] === 0x1f && head[1] === 0x8b ? "plain" : null;
}

export async function writeContainer(
  file: string,
  entries: AsyncIterable<TarInput> | Iterable<TarInput>,
  password?: string,
): Promise<void> {
  // Media is already compressed: the fastest level is enough.
  const source = Readable.from(packTar(entries), { objectMode: false });
  const gzip = zlib.createGzip({ level: 1 });
  const out = fs.createWriteStream(file, { mode: 0o600, flags: "wx" });
  if (!password) {
    await pipeline(source, gzip, out);
    return;
  }
  const salt = crypto.randomBytes(SALT);
  const iv = crypto.randomBytes(IV);
  const { key, check } = await deriveKey(password, salt);
  const head = Buffer.concat([MAGIC, salt, iv, check]);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(head);
  const encrypt = new Transform({
    transform(chunk, _enc, cb) {
      cb(null, cipher.update(chunk));
    },
    flush(cb) {
      this.push(cipher.final());
      this.push(cipher.getAuthTag());
      cb();
    },
  });
  encrypt.push(head);
  await pipeline(source, gzip, encrypt, out);
}

/** Streams the archive to `visit`. Integrity is only guaranteed once the promise resolves. */
export async function readContainer(file: string, visit: TarVisitor, password?: string): Promise<void> {
  const kind = await containerKind(file);
  if (!kind) throw new BackupError("invalidFile");
  const { size } = await fs.promises.stat(file);
  let stopped = false;
  const consume = async (stream: AsyncIterable<Buffer>) => {
    await readTar(stream, async (entry) => {
      const r = await visit(entry);
      if (r === "stop") stopped = true;
      return r;
    });
  };

  try {
    if (kind === "plain") {
      await pipeline(fs.createReadStream(file), zlib.createGunzip(), consume);
      return;
    }
    if (!password) throw new BackupError("passwordRequired");
    if (size < HEADER + TAG) throw new BackupError("corrupted");
    const head = await readAt(file, 0, HEADER);
    const salt = head.subarray(MAGIC.length, MAGIC.length + SALT);
    const iv = head.subarray(MAGIC.length + SALT, MAGIC.length + SALT + IV);
    const { key, check } = await deriveKey(password, salt);
    if (!crypto.timingSafeEqual(check, head.subarray(HEADER - CHECK))) throw new BackupError("wrongPassword");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(head);
    decipher.setAuthTag(await readAt(file, size - TAG, TAG));
    await pipeline(fs.createReadStream(file, { start: HEADER, end: size - TAG - 1 }), decipher, zlib.createGunzip(), consume);
  } catch (e) {
    if (stopped) return; // the pipeline was cut short on purpose
    if (e instanceof BackupError) throw e;
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOSPC") throw new BackupError("noSpace");
    throw new BackupError("corrupted", (e as Error).message);
  }
}
