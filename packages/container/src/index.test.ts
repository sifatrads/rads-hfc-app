import { describe, it, expect } from "vitest";
import { encode, decode, encodeJSON, decodeJSON, isRhfc, RHFC_MAGIC } from "./index";

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (u: Uint8Array) => new TextDecoder().decode(u);

describe("rhfc encrypted container", () => {
  it("round-trips a JSON project in app mode", async () => {
    const obj = {
      meta: { name: "Demo Project", standardId: "nfpa13" },
      network: { nodes: [1, 2, 3], pipes: [] },
      note: "MOST-REMOTE-SPRINKLER",
    };
    const file = await encodeJSON(obj);
    expect(isRhfc(file)).toBe(true);
    expect(dec(file.slice(0, 4))).toBe(RHFC_MAGIC);
    const back = await decodeJSON<typeof obj>(file);
    expect(back).toEqual(obj);
  });

  it("produces a single encrypted blob with no plaintext leakage", async () => {
    const marker = "PLAINTEXT-SHOULD-NOT-APPEAR-XYZ";
    const file = await encodeJSON({ secret: marker });
    expect(dec(file).includes(marker)).toBe(false);
    // header present, body is not valid UTF-8 JSON
    expect(file.length).toBeGreaterThan(38);
  });

  it("passphrase mode requires the correct passphrase", async () => {
    const file = await encode(enc("sensitive design data"), {
      keyMode: "passphrase",
      passphrase: "open-sesame",
      iterations: 1000, // small for test speed
    });
    expect(dec(await decode(file, { passphrase: "open-sesame" }))).toBe("sensitive design data");
    await expect(decode(file, { passphrase: "wrong" })).rejects.toThrow();
    await expect(decode(file)).rejects.toThrow(/passphrase/i);
  });

  it("detects tampering via the GCM auth tag", async () => {
    const file = await encodeJSON({ a: 1, b: 2 });
    const tampered = file.slice();
    const i = tampered.length - 1;
    tampered[i] = ((tampered[i] ?? 0) ^ 0xff) & 0xff;
    await expect(decode(tampered)).rejects.toThrow();
  });

  it("rejects non-rhfc input", async () => {
    expect(isRhfc(enc("hello world"))).toBe(false);
    await expect(decode(enc("hello world"))).rejects.toThrow(/magic/i);
  });
});
