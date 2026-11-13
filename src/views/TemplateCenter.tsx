import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { AppHeader } from "./Shell";
import { Button, Modal, Segmented, Select, cx } from "../ui/kit";
import { CATEGORY_NAMES, TEMPLATES, templateDoc, type TemplateDef } from "../templates";
import { ScaledPage } from "../render/PageView";
import { ensureFontsForDoc } from "../fonts/loader";
import { orientationOf, sizeLabel } from "../model/sizes";
import { NewDocDialog } from "./NewDocDialog";
import { createFromTemplate } from "../templates/instantiate";
import { createAndOpen } from "../app/actions";
import { toast } from "../ui/toast";

export function useTemplateFonts(ids: string[]) {
  useEffect(() => {
    for (const id of ids) void ensureFontsForDoc(templateDoc(id));
  }, [ids.join(",")]);
}

export async function applyTemplate(t: TemplateDef): Promise<boolean> {
  try {
    const doc = await createFromTemplate(t.id);
    return await createAndOpen(doc);
  } catch (e: any) {
    toast("error", `使用模板失败：${e?.message ?? e}`);
    return false;
  }
}

export function TemplateCenter() {
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [size, setSize] = useState("all");
  const [orient, setOrient] = useState<"all" | "portrait" | "landscape">("all");
  const [preview, setPreview] = useState<TemplateDef | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const sizes = useMemo(
    () => [...new Map(TEMPLATES.map((t) => [`${t.width}x${t.height}`, t])).values()],
    [],
  );
  const list = TEMPLATES.filter(
    (t) =>
      (cat === "all" || t.category === cat) &&
      (!q.trim() || t.name.includes(q.trim()) || t.description.includes(q.trim())) &&
      (size === "all" || `${t.width}x${t.height}` === size) &&
      (orient === "all" || orientationOf(t.width, t.height) === orient),
  );
  useTemplateFonts(list.map((t) => t.id));

  return (
    <div className="flex h-full flex-col">
      <AppHeader
        right={
          <Button variant="primary" onClick={() => setNewOpen(true)}>
            <Plus size={15} /> 空白新建
          </Button>
        }
      />
      <main className="bx-scroll min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[1240px] px-8 py-8">
          <h1 className="text-[26px] font-semibold tracking-tight">模板中心</h1>
          <p className="mt-1.5 text-[13px] text-ink-2">
            使用模板会创建一个独立的新作品，模板内的文字、图片和图形都可以自由编辑。
          </p>
          <div className="mt-6 mb-6 flex flex-wrap items-center gap-3">
            <div className="flex gap-1.5">
              {[["all", "全部"], ...Object.entries(CATEGORY_NAMES)].map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => setCat(k)}
                  className={cx(
                    "h-8 rounded-full px-4 text-[13px] transition-colors",
                    cat === k
                      ? "bg-ink text-white"
                      : "bg-white text-ink-2 ring-1 ring-line hover:text-ink",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <label className="flex h-8 w-56 items-center gap-2 rounded-md border border-line bg-white px-2.5 focus-within:border-accent">
                <Search size={14} className="text-mute" />
                <input
                  className="w-full bg-transparent text-[13px] outline-none"
                  placeholder="按名称搜索模板"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
              <Select
                className="h-8"
                value={size}
                onChange={setSize}
                options={[
                  { value: "all", label: "全部尺寸" },
                  ...sizes.map((t) => ({
                    value: `${t.width}x${t.height}`,
                    label: `${t.sizeName}（${t.width} × ${t.height} mm）`,
                  })),
                ]}
              />
              <Segmented
                className="h-8 w-52"
                value={orient}
                onChange={setOrient}
                options={[
                  { value: "all", label: "全部方向" },
                  { value: "portrait", label: "竖版" },
                  { value: "landscape", label: "横版" },
                ]}
              />
            </div>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-6">
            {list.map((t) => (
              <TemplateCard key={t.id} t={t} onOpen={() => setPreview(t)} />
            ))}
          </div>
          {!list.length && (
            <div className="py-16 text-center text-[13px] text-mute">没有符合条件的模板</div>
          )}
        </div>
      </main>
      <TemplatePreview t={preview} onClose={() => setPreview(null)} />
      <NewDocDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

function TemplateCard({ t, onOpen }: { t: TemplateDef; onOpen: () => void }) {
  const doc = templateDoc(t.id);
  const box = 230;
  const scale = Math.min(box / t.width, box / t.height) * 0.92;
  return (
    <button onClick={onOpen} className="group text-left">
      <div
        className="flex items-center justify-center overflow-hidden rounded-xl border border-line bg-desk/70 transition-shadow group-hover:shadow-lg"
        style={{ height: box + 20 }}
      >
        <ScaledPage page={doc.pages[0]} width={t.width} height={t.height} scale={scale} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="rounded bg-shell px-1.5 py-0.5 text-[11px] text-ink-2 ring-1 ring-line">
          {CATEGORY_NAMES[t.category]}
        </span>
        <span className="truncate text-[14px] font-medium">{t.name}</span>
      </div>
      <div className="mt-1 text-[11.5px] text-mute tabular-nums">
        {t.sizeName} · {sizeLabel(t.width, t.height)} · {doc.pages.length} 页
      </div>
    </button>
  );
}

export function TemplatePreview({
  t,
  onClose,
  actions,
}: {
  t: TemplateDef | null;
  onClose: () => void;
  actions?: (t: TemplateDef, close: () => void) => ReactNode;
}) {
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => setIdx(0), [t]);
  if (!t) return null;
  const doc = templateDoc(t.id);
  const H = 520;
  const scale = Math.min(H / t.height, 560 / t.width);
  return (
    <Modal
      open
      onClose={onClose}
      title={t.name}
      width={940}
      footer={
        actions ? (
          actions(t, onClose)
        ) : (
          <>
            <div className="mr-auto text-[12px] text-mute">
              将创建独立的新作品，当前作品会先自动保存。
            </div>
            <Button onClick={onClose}>取消</Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const ok = await applyTemplate(t);
                setBusy(false);
                if (ok) onClose();
              }}
            >
              {busy ? "正在创建…" : "使用此模板创建"}
            </Button>
          </>
        )
      }
    >
      <div className="grid grid-cols-[1fr_250px] gap-5">
        <div
          className="relative flex items-center justify-center rounded-lg bg-desk/70 py-4"
          style={{ height: H + 32 }}
        >
          <ScaledPage page={doc.pages[idx]} width={t.width} height={t.height} scale={scale} />
          <button
            disabled={idx === 0}
            onClick={() => setIdx(idx - 1)}
            className="absolute left-2 rounded-full bg-white/90 p-1.5 shadow disabled:opacity-30"
            aria-label="上一页"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            disabled={idx === doc.pages.length - 1}
            onClick={() => setIdx(idx + 1)}
            className="absolute right-2 rounded-full bg-white/90 p-1.5 shadow disabled:opacity-30"
            aria-label="下一页"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex min-h-0 flex-col">
          <p className="text-[13px] leading-relaxed text-ink-2">{t.description}</p>
          <div className="mt-2 text-[12px] text-mute tabular-nums">
            {t.sizeName} · {sizeLabel(t.width, t.height)} · {doc.pages.length} 页
          </div>
          <div className="bx-scroll mt-4 grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-auto pr-1">
            {doc.pages.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setIdx(i)}
                className={cx(
                  "flex flex-col items-center gap-1 rounded-md p-1.5",
                  i === idx ? "bg-accent-soft ring-1 ring-accent" : "hover:bg-shell",
                )}
              >
                <ScaledPage
                  page={p}
                  width={t.width}
                  height={t.height}
                  scale={Math.min(100 / t.width, 120 / t.height)}
                />
                <span className="text-[11px] text-mute">
                  {i === 0
                    ? "封面"
                    : i === doc.pages.length - 1 && t.category !== "newspaper"
                      ? "封底"
                      : `第 ${i + 1} 页`}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
