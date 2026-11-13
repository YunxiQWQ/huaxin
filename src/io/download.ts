/**
 * Save a blob as a local file. Uses the File System Access save dialog when available so we
 * know the write finished; otherwise falls back to a regular browser download.
 * Returns false when the user cancelled.
 */
export async function saveBlob(
  blob: Blob,
  filename: string,
  opts: { description: string; accept: Record<string, string[]> } | null = null,
): Promise<boolean> {
  const w = window as any;
  if (opts && typeof w.showSaveFilePicker === "function" && window.self === window.top) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: opts.description, accept: opts.accept }],
      });
      const stream = await handle.createWritable();
      await stream.write(blob);
      await stream.close();
      return true;
    } catch (e: any) {
      if (e?.name === "AbortError") return false;
      // SecurityError etc: fall back to a plain download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

export function safeFileName(name: string) {
  return (name || "未命名").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 80);
}

export function yieldToUI() {
  return new Promise<void>((r) => setTimeout(r, 0));
}

export function parsePageRange(input: string, count: number): number[] | null {
  const out = new Set<number>();
  const parts = input
    .replace(/，/g, ",")
    .replace(/[—–～~]/g, "-")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  for (const p of parts) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(p);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b < 1 || a > count || b > count) return null;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i - 1);
  }
  return [...out].sort((x, y) => x - y);
}
