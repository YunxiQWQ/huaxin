import { useState } from "react";
import { FONT_FAMILIES, fontName, getFamily, getLocalFamilies } from "../../fonts/registry";
import { enableLocalFonts, localFontsSupported } from "../../fonts/local";
import { ensureFontsForDoc } from "../../fonts/loader";
import { getState } from "../store";
import { Button } from "../../ui/kit";
import { useFontEpoch } from "../../render/PageView";

export function FontPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  useFontEpoch();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const local = getLocalFamilies();
  const supported = localFontsSupported();
  return (
    <div className="mb-2">
      <select
        aria-label="字体系列"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mb-1.5 h-7 w-full rounded-md border border-line bg-white px-1.5 text-[12px] outline-none focus:border-accent"
      >
        <optgroup label="网站字体">
          {FONT_FAMILIES.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}（{f.category}）
            </option>
          ))}
        </optgroup>
        <hr />
        <optgroup label="本机字体">
          {!getFamily(value) && <option value={value}>{fontName(value)}（不可用）</option>}
          {local.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
          {local.length === 0 && (
            <option disabled value="">
              {supported ? "点击下方按钮启用" : "当前浏览器不支持"}
            </option>
          )}
        </optgroup>
      </select>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="subtle"
          disabled={busy || !supported}
          onClick={async () => {
            setBusy(true);
            setMessage("");
            try {
              const count = await enableLocalFonts();
              await ensureFontsForDoc(getState().doc, true);
              setMessage(count ? "" : "未找到可用的常规字体。");
            } catch (err) {
              setMessage((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "正在读取…" : local.length ? "刷新本机字体" : "使用本机字体"}
        </Button>
        {local.length > 0 && <span className="text-[11px] text-mute">{local.length} 款</span>}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-mute">
        {supported
          ? "本机字体仅在此设备读取，不会上传；工程仅记录名称。"
          : "本机字体需使用桌面版 Chrome / Edge，并通过 HTTPS 或 localhost 打开。"}
      </p>
      {message && (
        <p role="status" className="mt-1 text-[11px] text-warn">
          {message}
        </p>
      )}
    </div>
  );
}
