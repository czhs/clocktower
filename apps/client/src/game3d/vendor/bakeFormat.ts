// v3.3 perf (v33-bake). The town-bake binary format + the createTree call key, shared by the build (apps/client/build/
// townBake.ts, scripts/v3/bake-town.mjs) and the client (vendor/townBake.ts). No Node / DOM imports.
// ------------------------------------------------------------------------------------------------ the binary format
//   'CTB1' u32 jsonBytes, JSON (utf8), pad to 8, then the arrays (each 8-aligned). JSON:
//   { v: 1, vendorHash, generator, three, keys: { <key>: Entry } }
//   Entry = { trunk: Geo | null, core: Geo, leaves: { n, base: Ref(f64), n3: Ref(f32), v4: Ref(f32), rad: Ref(f32), occ: Ref(f32) },
//             sphere: [cx, cy, cz, r], tree: { kind, seed, crowns: [{ c: {x,y,z}, r }], leaves, height } }
//   Geo = { attrs: [[name, itemSize, normalized, Ref]], index: Ref | null };  Ref = [type, byteOffset, length]
export type ArrType = 'f32' | 'f64' | 'u16' | 'u32';
export type Ref = [ArrType, number, number];
export interface GeoRec {
  attrs: [string, number, boolean, Ref][];
  index: Ref | null;
}
export interface TreeRec {
  trunk: GeoRec | null;
  core: GeoRec;
  leaves: { n: number; base: Ref; n3: Ref; v4: Ref; rad: Ref; occ: Ref };
  sphere: [number, number, number, number];
  tree: unknown;
}
export interface BakeHeader {
  v: 1;
  vendorHash: string;
  generator: string;
  three: string;
  keys: Record<string, TreeRec>;
}
export const MAGIC = 0x31425443; // 'CTB1' little-endian

type TypedArray = Float32Array | Float64Array | Uint16Array | Uint32Array;
const CTOR = { f32: Float32Array, f64: Float64Array, u16: Uint16Array, u32: Uint32Array } as const;
export function arrType(a: TypedArray): ArrType {
  if (a instanceof Float32Array) return 'f32';
  if (a instanceof Float64Array) return 'f64';
  if (a instanceof Uint16Array) return 'u16';
  if (a instanceof Uint32Array) return 'u32';
  throw new Error(`town bake: unsupported array ${Object.prototype.toString.call(a)}`);
}

/** Collects typed arrays into one 8-aligned body. */
export class BodyWriter {
  private parts: Uint8Array[] = [];
  private size = 0;
  add(a: TypedArray): Ref {
    const pad = (8 - (this.size % 8)) % 8;
    if (pad) {
      this.parts.push(new Uint8Array(pad));
      this.size += pad;
    }
    const off = this.size;
    this.parts.push(new Uint8Array(a.buffer, a.byteOffset, a.byteLength).slice());
    this.size += a.byteLength;
    return [arrType(a), off, a.length];
  }
  bytes(): Uint8Array {
    const out = new Uint8Array(this.size);
    let o = 0;
    for (const p of this.parts) {
      out.set(p, o);
      o += p.byteLength;
    }
    return out;
  }
}

export function encodeBake(header: BakeHeader, body: Uint8Array): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(header));
  const head = 8 + json.byteLength;
  const start = head + ((8 - (head % 8)) % 8);
  const out = new Uint8Array(start + body.byteLength);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, json.byteLength, true);
  out.set(json, 8);
  out.set(body, start);
  return out;
}

export interface DecodedBake {
  header: BakeHeader;
  /** A typed-array VIEW on the body (callers copy before handing it to three). */
  view(r: Ref): TypedArray;
}

export function decodeBake(buf: ArrayBuffer): DecodedBake {
  const dv = new DataView(buf);
  if (buf.byteLength < 8 || dv.getUint32(0, true) !== MAGIC) throw new Error('town bake: bad magic');
  const n = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, n))) as BakeHeader;
  if (header.v !== 1) throw new Error(`town bake: version ${String(header.v)}`);
  const head = 8 + n;
  const start = head + ((8 - (head % 8)) % 8);
  return { header, view: (r) => new CTOR[r[0]](buf, start + r[1], r[2]) };
}

/** Stable JSON (sorted keys) of a createTree call's options without position / add, + the build texel size. */
export function treeKey(opts: Record<string, unknown>, texelWorld: number): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sort(o[k])]));
    }
    return v;
  };
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(opts).sort()) if (k !== 'position' && k !== 'add' && opts[k] !== undefined) o[k] = sort(opts[k]);
  return JSON.stringify([o, texelWorld]);
}
