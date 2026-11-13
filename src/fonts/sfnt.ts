/** Extract one SFNT face from a TTC, whose table offsets are relative to the whole collection.
 * FontData.blob() on Windows can return a complete TTC even for an individual FontData entry.
 */
export function extractCollectionFace(collection: ArrayBuffer, index: number): ArrayBuffer {
  const source = new DataView(collection);
  if (collection.byteLength < 12 || source.getUint32(0) !== 0x74746366)
    throw new Error("字体合集格式无效");
  const fonts = source.getUint32(8);
  if (index < 0 || index >= fonts || 12 + fonts * 4 > collection.byteLength)
    throw new Error("字体合集中找不到所选字面");
  const start = source.getUint32(12 + index * 4);
  if (start + 12 > collection.byteLength) throw new Error("字体目录不完整");
  const count = source.getUint16(start + 4);
  const tables: { tag: number; offset: number; length: number }[] = [];
  for (let i = 0; i < count; i++) {
    const at = start + 12 + i * 16;
    if (at + 16 > collection.byteLength) throw new Error("字体目录不完整");
    const tag = source.getUint32(at);
    const offset = source.getUint32(at + 8);
    const length = source.getUint32(at + 12);
    if (offset + length > collection.byteLength) throw new Error("字体数据不完整");
    if (tag !== 0x44534947) tables.push({ tag, offset, length }); // discard invalidated DSIG
  }
  if (!tables.length) throw new Error("字体数据为空");
  const align = (n: number) => Math.ceil(n / 4) * 4;
  const size = tables.reduce((n, t) => n + align(t.length), 12 + tables.length * 16);
  const bytes = new ArrayBuffer(size);
  const out = new DataView(bytes);
  const data = new Uint8Array(bytes);
  const power = Math.floor(Math.log2(tables.length));
  out.setUint32(0, source.getUint32(start));
  out.setUint16(4, tables.length);
  out.setUint16(6, 2 ** power * 16);
  out.setUint16(8, power);
  out.setUint16(10, tables.length * 16 - 2 ** power * 16);
  let offset = 12 + tables.length * 16;
  let head = -1;
  const checksum = (at: number, length: number) => {
    let sum = 0;
    for (let n = 0; n < align(length); n += 4) sum = (sum + out.getUint32(at + n)) >>> 0;
    return sum;
  };
  tables.forEach((table, i) => {
    data.set(new Uint8Array(collection, table.offset, table.length), offset);
    if (table.tag === 0x68656164 && table.length >= 12) {
      head = offset;
      out.setUint32(head + 8, 0);
    }
    const record = 12 + i * 16;
    out.setUint32(record, table.tag);
    out.setUint32(record + 4, checksum(offset, table.length));
    out.setUint32(record + 8, offset);
    out.setUint32(record + 12, table.length);
    offset += align(table.length);
  });
  if (head >= 0) out.setUint32(head + 8, (0xb1b0afba - checksum(0, size)) >>> 0);
  return bytes;
}
