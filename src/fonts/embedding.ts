/** OpenType OS/2 fsType flags. Applies to local fonts; bundled fonts have OFL embedding rights. */
export function embeddingFlags(bytes: ArrayBuffer): number {
  const view = new DataView(bytes);
  if (bytes.byteLength < 12) throw new Error("字体数据不完整");
  const count = view.getUint16(4);
  for (let i = 0; i < count; i++) {
    const record = 12 + i * 16;
    if (record + 16 > bytes.byteLength) throw new Error("字体目录损坏");
    if (view.getUint32(record) !== 0x4f532f32) continue; // OS/2
    const offset = view.getUint32(record + 8);
    if (view.getUint32(record + 12) < 10 || offset + 10 > bytes.byteLength)
      throw new Error("字体度量表损坏");
    return view.getUint16(offset + 8);
  }
  return 0;
}
