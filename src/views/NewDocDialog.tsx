import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button, Label, Modal, NumberField, Segmented, cx } from "../ui/kit";
import { SIZE_PRESETS, sizeLabel } from "../model/sizes";
import { createDoc } from "../model/defaults";
import type { DocKind } from "../model/types";
import { createAndOpen } from "../app/actions";

export function NewDocDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("未命名作品");
  const [kind, setKind] = useState<DocKind>("newspaper");
  const [preset, setPreset] = useState("np-sikai");
  const [w, setW] = useState(270);
  const [h, setH] = useState(390);
  const [pages, setPages] = useState(4);
  const [m, setM] = useState({ top: 15, right: 15, bottom: 15, left: 15 });
  const [busy, setBusy] = useState(false);
  const landscape = w > h;

  const pick = (id: string) => {
    const p = SIZE_PRESETS.find((x) => x.id === id)!;
    setPreset(id);
    if (landscape) {
      setW(p.height);
      setH(p.width);
    } else {
      setW(p.width);
      setH(p.height);
    }
  };
  const setOrientation = (o: "portrait" | "landscape") => {
    if ((o === "landscape") !== landscape && w !== h) {
      setW(h);
      setH(w);
    }
  };
  const current = SIZE_PRESETS.find((x) => x.id === preset);
  const modified =
    current &&
    !(
      (current.width === w && current.height === h) ||
      (current.width === h && current.height === w)
    );
  const groups = ["报纸", "常用", "画册与手册"] as const;

  const create = async () => {
    setBusy(true);
    const doc = createDoc({
      name: name.trim() || "未命名作品",
      width: w,
      height: h,
      pages,
      margins: m,
      kind,
      sizeLabel: modified ? "自定义" : current?.name,
    });
    const ok = await createAndOpen(doc);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新建空白作品"
      width={720}
      footer={
        <>
          <div className="mr-auto text-[12px] text-mute">
            单页尺寸：<span className="font-medium text-ink">{sizeLabel(w, h)}</span>
          </div>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={create} disabled={busy}>
            {busy ? "正在创建…" : "创建并开始排版"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[1fr_250px] gap-6">
        <div>
          <Label>作品名称</Label>
          <input
            className="mb-4 h-9 w-full rounded-md border border-line px-3 text-[14px] outline-none focus:border-accent"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onFocus={(e) => e.target.select()}
          />
          <Label>作品类型</Label>
          <Segmented
            className="mb-4"
            value={kind}
            onChange={setKind}
            options={[
              { value: "newspaper", label: "报纸" },
              { value: "magazine", label: "校刊" },
              { value: "album", label: "画册" },
              { value: "manual", label: "手册" },
              { value: "blank", label: "其他" },
            ]}
          />
          <Label>尺寸预设（单页 宽 × 高，毫米）</Label>
          <div className="bx-scroll max-h-[300px] space-y-3 overflow-auto pr-1">
            {groups.map((g) => (
              <div key={g}>
                <div className="mb-1 text-[11px] font-medium text-ink-2">{g}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {SIZE_PRESETS.filter((p) => p.group === g).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => pick(p.id)}
                      className={cx(
                        "rounded-md border px-2.5 py-1.5 text-left transition-colors",
                        preset === p.id
                          ? "border-accent bg-accent-soft"
                          : "border-line hover:border-line-2 hover:bg-shell",
                      )}
                    >
                      <div className="text-[13px] font-medium">{p.name}</div>
                      <div className="text-[11px] text-mute tabular-nums">
                        宽 {p.width} × 高 {p.height} mm{p.note ? ` · ${p.note}` : ""}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="flex h-40 items-center justify-center rounded-lg bg-shell">
            <div
              className="border border-line-2 bg-white shadow-sm"
              style={{ width: (w / Math.max(w, h)) * 120, height: (h / Math.max(w, h)) * 120 }}
            >
              <div
                className="h-full w-full border border-dashed border-accent/40"
                style={{
                  transform: `scale(${1 - (m.left + m.right) / w}, ${1 - (m.top + m.bottom) / h})`,
                }}
              />
            </div>
          </div>
          <div>
            <Label>
              实际尺寸（可修改）{modified && <span className="ml-1 text-accent">已自定义</span>}
            </Label>
            <div className="flex items-center gap-1.5">
              <NumberField value={w} onChange={setW} min={30} max={2000} prefix="宽" suffix="mm" />
              <button
                className="text-mute hover:text-ink"
                title="交换宽高"
                onClick={() => setOrientation(landscape ? "portrait" : "landscape")}
              >
                <ArrowLeftRight size={14} />
              </button>
              <NumberField value={h} onChange={setH} min={30} max={2000} prefix="高" suffix="mm" />
            </div>
          </div>
          <div>
            <Label>方向</Label>
            <Segmented
              value={landscape ? "landscape" : "portrait"}
              onChange={setOrientation}
              options={[
                { value: "portrait", label: "竖版" },
                { value: "landscape", label: "横版" },
              ]}
            />
          </div>
          <div>
            <Label>初始页数</Label>
            <NumberField
              value={pages}
              onChange={(v) => setPages(Math.round(v))}
              min={1}
              max={200}
              precision={0}
              suffix="页"
            />
          </div>
          <div>
            <Label>页边距（毫米）</Label>
            <div className="grid grid-cols-2 gap-1.5">
              <NumberField
                value={m.top}
                onChange={(v) => setM({ ...m, top: v })}
                min={0}
                max={200}
                prefix="上"
              />
              <NumberField
                value={m.bottom}
                onChange={(v) => setM({ ...m, bottom: v })}
                min={0}
                max={200}
                prefix="下"
              />
              <NumberField
                value={m.left}
                onChange={(v) => setM({ ...m, left: v })}
                min={0}
                max={200}
                prefix="左"
              />
              <NumberField
                value={m.right}
                onChange={(v) => setM({ ...m, right: v })}
                min={0}
                max={200}
                prefix="右"
              />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
