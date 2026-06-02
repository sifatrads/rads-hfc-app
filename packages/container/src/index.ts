/**
 * RADS-HFC-APP encrypted single-file project container (`.rhfc`).
 *
 * One file per project: the whole project (model JSON + drawing + results) is
 * compressed (DEFLATE) then encrypted (AES-256-GCM) into one binary blob.
 *
 * Key modes (see plan, honesty flag 4):
 *   - "app"        : key derived from a fixed app constant. Any RADS-HFC-APP build
 *                    (and the free viewer) opens the file with no prompt. This locks
 *                    the format to the app and protects data at rest, but it is NOT a
 *                    secret — the app is source-available, so the key is public.
 *                    It is format-lock + at-rest protection, NOT DRM.
 *   - "passphrase" : key = PBKDF2(passphrase, salt). Truly confidential; the passphrase
 *                    is required to open the file anywhere.
 *
 * Binary layout (little/big-endian noted):
 *   0..3   magic "RHFC"
 *   4      format version (uint8) = 1
 *   5      key mode (uint8): 0 = app, 1 = passphrase
 *   6..9   PBKDF2 iterations (uint32, big-endian; 0 for app mode)
 *   10..25 salt (16 bytes; zeros for app mode)
 *   26..37 AES-GCM IV / nonce (12 bytes; random per save)
 *   38..   AES-256-GCM ciphertext (GCM tag included)
 */

export type KeyMode = "app" | "passphrase";

export interface EncodeOptions {
  /** Default "app". */
  keyMode?: KeyMode;
  /** Required when keyMode === "passphrase". */
  passphrase?: string;
  /** PBKDF2 iterations for passphrase mode (default 210000, OWASP 2023). */
  iterations?: number;
}

export interface DecodeOptions {
  passphrase?: string;
}

export const RHFC_MAGIC = "RHFC";
const MAGIC_BYTES = new Uint8Array([0x52, 0x48, 0x46, 0x43]); // 'R','H','F','C'
const FORMAT_VERSION = 1;
const HEADER_LEN = 38;
const DEFAULT_ITERATIONS = 210_000;

// NOT a secret. Format-lock material only (the app is source-available).
const APP_KEY_MATERIAL = "RADS-HFC-APP/v1/format-lock — not a secret (source-available)";

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

/**
 * Copy bytes into a Uint8Array backed by a concrete ArrayBuffer — a TS-safe
 * `BufferSource` that works for both Web Crypto and CompressionStream at runtime.
 * (TS 5.7 types Uint8Array as Uint8Array<ArrayBufferLike>, which the lib's
 * BufferSource = ArrayBufferView<ArrayBuffer> | ArrayBuffer does not accept; and
 * a bare ArrayBuffer stalls Node's CompressionStream writer, so we return a view.)
 */
function buf(u: Uint8Array): Uint8Array<ArrayBuffer> {
  const view = new Uint8Array(new ArrayBuffer(u.byteLength));
  view.set(u);
  return view;
}

/** True if the bytes begin with the RHFC magic header. */
export function isRhfc(file: Uint8Array): boolean {
  return (
    file.length >= 4 &&
    file[0] === 0x52 &&
    file[1] === 0x48 &&
    file[2] === 0x46 &&
    file[3] === 0x43
  );
}

/** Encrypt arbitrary bytes into a `.rhfc` container. */
export async function encode(plaintext: Uint8Array, opts: EncodeOptions = {}): Promise<Uint8Array> {
  const keyMode: KeyMode = opts.keyMode ?? "app";
  const iterations = opts.iterations ?? DEFAULT_ITERATIONS;

  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);

  let rawKey: Uint8Array;
  if (keyMode === "passphrase") {
    if (!opts.passphrase) throw new Error("A passphrase is required for keyMode 'passphrase'.");
    globalThis.crypto.getRandomValues(salt);
    rawKey = await derivePassphraseKey(opts.passphrase, salt, iterations);
  } else {
    rawKey = await appKey(); // salt left as zeros, iterations recorded as 0
  }

  const key = await importAesKey(rawKey);
  const compressed = await deflate(plaintext);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: buf(iv) }, key, buf(compressed)));

  const out = new Uint8Array(HEADER_LEN + ct.length);
  const dv = new DataView(out.buffer);
  out.set(MAGIC_BYTES, 0);
  dv.setUint8(4, FORMAT_VERSION);
  dv.setUint8(5, keyMode === "passphrase" ? 1 : 0);
  dv.setUint32(6, keyMode === "passphrase" ? iterations : 0, false);
  out.set(salt, 10);
  out.set(iv, 26);
  out.set(ct, HEADER_LEN);
  return out;
}

/** Decrypt a `.rhfc` container back to the original bytes. */
export async function decode(file: Uint8Array, opts: DecodeOptions = {}): Promise<Uint8Array> {
  if (!isRhfc(file)) throw new Error("Not a RADS-HFC project file (bad magic header).");
  if (file.length < HEADER_LEN) throw new Error("Corrupt .rhfc file (truncated header).");

  const dv = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const version = dv.getUint8(4);
  if (version !== FORMAT_VERSION) throw new Error(`Unsupported .rhfc format version ${version}.`);

  const keyMode: KeyMode = dv.getUint8(5) === 1 ? "passphrase" : "app";
  const iterations = dv.getUint32(6, false);
  const salt = file.slice(10, 26);
  const iv = file.slice(26, 38);
  const ct = file.slice(HEADER_LEN);

  let rawKey: Uint8Array;
  if (keyMode === "passphrase") {
    if (!opts.passphrase) {
      throw new Error("This project is passphrase-protected; a passphrase is required to open it.");
    }
    rawKey = await derivePassphraseKey(opts.passphrase, salt, iterations);
  } else {
    rawKey = await appKey();
  }

  const key = await importAesKey(rawKey);
  let compressed: Uint8Array;
  try {
    compressed = new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: buf(iv) }, key, buf(ct)));
  } catch {
    throw new Error(
      keyMode === "passphrase"
        ? "Wrong passphrase, or the file is corrupted/tampered."
        : "The .rhfc file is corrupted or was tampered with.",
    );
  }
  return inflate(compressed);
}

/** Convenience: encrypt a JSON-serializable object into a `.rhfc` container. */
export async function encodeJSON(obj: unknown, opts?: EncodeOptions): Promise<Uint8Array> {
  return encode(new TextEncoder().encode(JSON.stringify(obj)), opts);
}

/** Convenience: decrypt a `.rhfc` container into a parsed JSON object. */
export async function decodeJSON<T = unknown>(file: Uint8Array, opts?: DecodeOptions): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await decode(file, opts))) as T;
}

// ── internals ───────────────────────────────────────────────────────────────

async function appKey(): Promise<Uint8Array> {
  const digest = await subtle().digest("SHA-256", buf(new TextEncoder().encode(APP_KEY_MATERIAL)));
  return new Uint8Array(digest);
}

async function derivePassphraseKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const base = await subtle().importKey("raw", buf(new TextEncoder().encode(passphrase)), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle().deriveBits({ name: "PBKDF2", salt: buf(salt), iterations, hash: "SHA-256" }, base, 256);
  return new Uint8Array(bits);
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey("raw", buf(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  return collectStream(new CompressionStream("deflate"), data);
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  return collectStream(new DecompressionStream("deflate"), data);
}

async function collectStream(transform: CompressionStream | DecompressionStream, data: Uint8Array): Promise<Uint8Array> {
  const writer = transform.writable.getWriter();
  void writer.write(buf(data));
  void writer.close();
  const reader = transform.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
