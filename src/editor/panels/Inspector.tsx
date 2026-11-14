import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalSpaceAround,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalSpaceAround,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  ChevronDown,
  ChevronUp,
  Crop,
  Eye,
  EyeOff,
  Group,
  ImageUp,
  Italic,
  Lock,
  TriangleAlert,
  Ungroup,
  Underline,
  Unlock,
  Maximize,
  Minimize,
  RotateCcw,
  FoldVertical,
} from "lucide-react";
import { currentPage, getState, setUI, useEditor } from "../store";
import type {
  Align,
  FontWeight,
  ImageElement,
  PageElement,
  ShapeElement,
  Stroke,
  TextElement,
  TextStyle,
} from "../../model/types";
import {
  ColorField,
  IconBtn,
  Label,
  NumberField,
  Section,
  Segmented,
  Select,
  Toggle,
  Button,
  cx,
} from "../../ui/kit";
import {
  alignSelection,
  applyPreset,
  distributeSelection,
  groupSelection,
  redefinePreset,
  reorder,
  toggleHidden,
  toggleLock,
  ungroupSelection,
  updateDoc,
  updateElement,
  updateElements,
  updatePage,
  updateTextStyle,
  addPreset,
} from "../commands";
import { fontName, getFamily, isLocalFont, resolveFace } from "../../fonts/registry";
import { FontPicker } from "./FontPicker";
import { ensureFace, faceStatus } from "../../fonts/loader";
import { fitHeight, layoutOf, normalizeText, tidyManuscript } from "../../layout/textLayout";
import { containCrop, coverCrop, elementTypeName, shapeName } from "../../model/defaults";
import { IMAGE_ACCEPT, addImagesFromFiles, pickFiles } from "../create";
import { SIZE_PRESETS, sizeLabel } from "../../model/sizes";
import { useFontEpoch } from "../../render/PageView";

const Row = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cx("grid grid-cols-2 gap-1.5", className)}>{children}</div>
);

export function Inspector() {
  const s = useEditor((x) => x);
  useFontEpoch();
  const page = currentPage(s);
  const sel = page.elements.filter((e) => s.selection.includes(e.id));
  let body: ReactNode;
  if (sel.length === 0) body = <PageInspector />;
  else if (sel.length > 1) body = <MultiInspector els={sel} />;
  else {
    const el = sel[0];
    body = (
      <>
        <GeometrySection el={el} />
        {el.type === "text" && <TextInspector el={el} />}
        {el.type === "image" && <ImageInspector el={el} />}
        {el.type === "shape" && <ShapeInspector el={el} />}
        <ArrangeSection els={sel} />
      </>
    );
  }
  return (
    <aside className="bx-scroll flex w-[284px] shrink-0 flex-col overflow-y-auto border-l border-line bg-white">
      <div className="flex h-10 shrink-0 items-center border-b border-line px-3.5 text-[12.5px] font-semibold">
        {sel.length === 0
          ? "页面与文档"
          : sel.length > 1
            ? `已选中 ${sel.length} 个对象`
            : sel[0].type === "shape"
              ? shapeName[(sel[0] as ShapeElement).shape]
              : elementTypeName[sel[0].type]}
      </div>
      {body}
    </aside>
  );
}

function GeometrySection({ el }: { el: PageElement }) {
  const set = (p: Partial<PageElement>, m: string) => updateElement(el.id, p, m);
  const ratio = el.w / el.h;
  const keep = el.type === "image" && el.keepRatio;
  return (
    <Section title="位置与尺寸" right={<span className="text-[11px] text-mute">毫米</span>}>
      <Row>
        <NumberField
          prefix="X"
          value={el.x}
          onChange={(v) => set({ x: v }, "geo-x")}
          disabled={el.locked}
        />
        <NumberField
          prefix="Y"
          value={el.y}
          onChange={(v) => set({ y: v }, "geo-y")}
          disabled={el.locked}
        />
        <NumberField
          prefix="宽"
          value={el.w}
          min={1}
          onChange={(v) =>
            updateElement(el.id, (e) => resizeEl(e, v, keep ? v / ratio : e.h), "geo-w")
          }
          disabled={el.locked}
        />
        <NumberField
          prefix="高"
          value={el.h}
          min={1}
          onChange={(v) =>
            updateElement(el.id, (e) => resizeEl(e, keep ? v * ratio : e.w, v), "geo-h")
          }
          disabled={el.locked}
        />
        <NumberField
          prefix="旋转"
          suffix="°"
          value={el.rotation}
          min={-360}
          max={360}
          onChange={(v) => set({ rotation: v }, "geo-r")}
          disabled={el.locked}
        />
        <NumberField
          prefix="不透明"
          suffix="%"
          value={Math.round(el.opacity * 100)}
          min={0}
          max={100}
          precision={0}
          onChange={(v) => set({ opacity: v / 100 }, "geo-o")}
        />
      </Row>
    </Section>
  );
}

function resizeEl(e: PageElement, w: number, h: number): Partial<PageElement> {
  if (e.type !== "image") return { w, h };
  const sx = w / e.w;
  const sy = h / e.h;
  const f = Math.max(sx, sy);
  const c = e.crop;
  return {
    w,
    h,
    crop: {
      x: c.x * f + (w - e.w * f) / 2,
      y: c.y * f + (h - e.h * f) / 2,
      w: c.w * f,
      h: c.h * f,
    },
  } as Partial<ImageElement>;
}

function ArrangeSection({ els }: { els: PageElement[] }) {
  const locked = els.every((e) => e.locked);
  const hidden = els.every((e) => e.hidden);
  const ids = els.map((e) => e.id);
  return (
    <Section title="排列">
      <div className="mb-2 flex flex-wrap gap-1">
        <IconBtn label="置于顶层" onClick={() => reorder("front", ids)}>
          <ArrowUpToLine size={15} />
        </IconBtn>
        <IconBtn label="上移一层" onClick={() => reorder("forward", ids)}>
          <ChevronUp size={15} />
        </IconBtn>
        <IconBtn label="下移一层" onClick={() => reorder("backward", ids)}>
          <ChevronDown size={15} />
        </IconBtn>
        <IconBtn label="置于底层" onClick={() => reorder("back", ids)}>
          <ArrowDownToLine size={15} />
        </IconBtn>
        <span className="mx-1 w-px bg-line" />
        <IconBtn label={locked ? "解锁" : "锁定"} active={locked} onClick={() => toggleLock(ids)}>
          {locked ? <Lock size={15} /> : <Unlock size={15} />}
        </IconBtn>
        <IconBtn label={hidden ? "显示" : "隐藏"} active={hidden} onClick={() => toggleHidden(ids)}>
          {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
        </IconBtn>
      </div>
      <Label>对齐到页面</Label>
      <AlignButtons toPage />
    </Section>
  );
}

function AlignButtons({ toPage }: { toPage?: boolean }) {
  const b = (op: Parameters<typeof alignSelection>[0], label: string, icon: ReactNode) => (
    <IconBtn label={label} onClick={() => alignSelection(op, toPage)}>
      {icon}
    </IconBtn>
  );
  return (
    <div className="flex flex-wrap gap-1">
      {b("left", "左对齐", <AlignHorizontalJustifyStart size={15} />)}
      {b("hcenter", "水平居中", <AlignHorizontalJustifyCenter size={15} />)}
      {b("right", "右对齐", <AlignHorizontalJustifyEnd size={15} />)}
      {b("top", "顶对齐", <AlignVerticalJustifyStart size={15} />)}
      {b("vcenter", "垂直居中", <AlignVerticalJustifyCenter size={15} />)}
      {b("bottom", "底对齐", <AlignVerticalJustifyEnd size={15} />)}
    </div>
  );
}

function MultiInspector({ els }: { els: PageElement[] }) {
  const grouped = els.every((e) => e.groupId && e.groupId === els[0].groupId);
  return (
    <>
      <Section title="对齐（相对所选对象）">
        <AlignButtons />
        <div className="mt-2 flex gap-1">
          <Button
            size="sm"
            variant="subtle"
            onClick={() => distributeSelection("h")}
            disabled={els.length < 3}
            title="至少选择 3 个对象"
          >
            <AlignHorizontalSpaceAround size={14} /> 水平等距
          </Button>
          <Button
            size="sm"
            variant="subtle"
            onClick={() => distributeSelection("v")}
            disabled={els.length < 3}
            title="至少选择 3 个对象"
          >
            <AlignVerticalSpaceAround size={14} /> 垂直等距
          </Button>
        </div>
      </Section>
      <Section title="组合">
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant={grouped ? "subtle" : "default"}
            onClick={groupSelection}
            disabled={grouped}
          >
            <Group size={14} /> 组合
          </Button>
          <Button
            size="sm"
            variant="subtle"
            onClick={ungroupSelection}
            disabled={!els.some((e) => e.groupId)}
          >
            <Ungroup size={14} /> 取消组合
          </Button>
        </div>
        <div className="mt-2 text-[11px] text-mute">
          {grouped
            ? "这是一个组合，点击其中任一对象会选中整组。"
            : "Ctrl+G 组合，Ctrl+Shift+G 取消组合"}
        </div>
      </Section>
      <Section title="不透明度">
        <NumberField
          suffix="%"
          value={Math.round(els[0].opacity * 100)}
          min={0}
          max={100}
          precision={0}
          onChange={(v) =>
            updateElements(
              els.map((e) => e.id),
              () => ({ opacity: v / 100 }),
              "multi-o",
            )
          }
        />
      </Section>
      <ArrangeSection els={els} />
    </>
  );
}

// ---------------- text ----------------
function TextInspector({ el }: { el: TextElement }) {
  const st = el.style;
  const presets = useEditor((s) => s.doc.textStyles);
  const set = (p: Partial<TextStyle>, m: string) => updateTextStyle([el.id], p, m);
  const layout = layoutOf(el);
  const fam = getFamily(st.fontFamily);
  const { face, synthBold } = resolveFace(st.fontFamily, st.fontWeight);
  const status = faceStatus(face.file);
  const overflowChars = layout.overflow
    ? [...el.text.slice(layout.overflowAt).replace(/\s/g, "")].length
    : 0;
  const contentRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    void ensureFace(face.file);
  }, [face.file]);
  useEffect(() => {
    const h = () => contentRef.current?.focus();
    window.addEventListener("bx:focus-text", h);
    return () => window.removeEventListener("bx:focus-text", h);
  }, []);
  const weights = (fam?.faces.map((f) => f.weight) ?? [400]).concat(
    fam && !fam.faces.some((f) => f.weight >= 600) ? [700] : [],
  );

  return (
    <>
      <Section title="文字样式">
        <div className="flex gap-1.5">
          <Select
            className="min-w-0 flex-1"
            value={el.styleId ?? ""}
            onChange={(v) => v && applyPreset([el.id], v)}
            options={[
              { value: "", label: el.styleId ? "—" : "（未关联样式）" },
              ...presets.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          <Button
            size="sm"
            variant="subtle"
            title={
              el.styleId
                ? "用当前格式更新此样式，并同步所有使用此样式的文本框"
                : "将当前格式保存为新样式"
            }
            onClick={() => {
              if (el.styleId) redefinePreset(el.styleId, st);
              else {
                const name = window.prompt("新样式名称", "自定义样式");
                if (name) {
                  const id = addPreset(name, st);
                  updateElement(el.id, { styleId: id } as Partial<TextElement>);
                }
              }
            }}
          >
            {el.styleId ? "更新样式" : "存为样式"}
          </Button>
        </div>
      </Section>
      <Section
        title="稿件内容"
        right={
          overflowChars ? (
            <span className="flex items-center gap-1 rounded bg-danger/10 px-1.5 py-0.5 text-[11px] font-medium text-danger">
              <TriangleAlert size={12} /> 溢出约 {overflowChars} 字
            </span>
          ) : (
            <span className="text-[11px] text-mute">{[...el.text].length} 字 · 已全部排入</span>
          )
        }
      >
        <ContentEditor el={el} innerRef={contentRef} />
        <div className="mt-1.5 flex gap-1.5">
          <Button size="sm" variant="subtle" onClick={() => setUI({ editingId: el.id })}>
            原位编辑
          </Button>
          <Button
            size="sm"
            variant="subtle"
            title="去掉空行、行首手工缩进与行尾空白（段落缩进由“首行缩进”控制）"
            onClick={() =>
              updateElement(el.id, { text: tidyManuscript(el.text) } as Partial<TextElement>)
            }
          >
            整理稿件
          </Button>
          <Button
            size="sm"
            variant="subtle"
            title={el.columns > 1 ? "按文字量调整高度并平衡各栏" : "按文字内容调整文本框高度"}
            onClick={() => updateElement(el.id, { h: fitHeight(el) })}
          >
            <FoldVertical size={13} /> {el.columns > 1 ? "平衡分栏" : "适应高度"}
          </Button>
        </div>
      </Section>
      <Section title="字体">
        {!fam && (
          <div className="mb-2 rounded-md bg-warn/10 p-2 text-[11.5px] text-warn">
            字体“{fontName(st.fontFamily)}”当前不可用，暂以思源宋体显示。
            {isLocalFont(st.fontFamily) && "请在下方启用本机字体；换设备后需安装同名字体。"}
            <button
              className="ml-1 font-medium underline"
              onClick={() => set({ fontFamily: "serif" }, "font")}
            >
              替换为思源宋体
            </button>
          </div>
        )}
        {status === "error" && (
          <div className="mb-2 rounded-md bg-danger/10 p-2 text-[11.5px] text-danger">
            {isLocalFont(face.file)
              ? "本机字体读取失败，请刷新本机字体或选择其他字体。"
              : "字体文件加载失败，请检查网络后刷新。离线时仅能使用已缓存的字体。"}
          </div>
        )}
        <FontPicker
          value={st.fontFamily}
          onChange={(v) => {
            set({ fontFamily: v }, "font");
            void ensureFace(resolveFace(v, st.fontWeight).face.file, true);
          }}
        />
        <Row className="mb-1.5">
          <NumberField
            value={st.fontSize}
            min={3}
            max={500}
            step={0.5}
            suffix="pt"
            onChange={(v) => set({ fontSize: v }, "fs")}
            title="字号（磅）"
          />
          <Select
            value={String(st.fontWeight) as "400" | "700" | "900"}
            onChange={(v) => {
              set({ fontWeight: Number(v) as FontWeight }, "fw");
              void ensureFace(resolveFace(st.fontFamily, Number(v)).face.file, true);
            }}
            options={[...new Set(weights)].map((w) => ({
              value: String(w) as "400" | "700" | "900",
              label: w === 400 ? "常规" : w === 700 ? "粗体" : "特粗",
            }))}
          />
        </Row>
        <div className="flex items-center gap-1">
          <IconBtn
            label="粗体 Ctrl+B"
            active={st.fontWeight >= 700}
            onClick={() => set({ fontWeight: st.fontWeight >= 700 ? 400 : 700 }, "fw")}
          >
            <Bold size={15} />
          </IconBtn>
          <IconBtn
            label="斜体 Ctrl+I"
            active={st.italic}
            onClick={() => set({ italic: !st.italic }, "it")}
          >
            <Italic size={15} />
          </IconBtn>
          <IconBtn
            label="下划线 Ctrl+U"
            active={st.underline}
            onClick={() => set({ underline: !st.underline }, "ul")}
          >
            <Underline size={15} />
          </IconBtn>
          <ColorField
            className="ml-1 flex-1"
            value={st.color}
            onChange={(v) => v && set({ color: v }, "color")}
          />
        </div>
        {synthBold && (
          <div className="mt-1.5 text-[11px] text-mute">
            此字体无粗体字重，将以模拟加粗显示与导出。
          </div>
        )}
      </Section>
      <Section title="段落">
        <Segmented
          className="mb-2"
          value={st.align}
          onChange={(v: Align) => set({ align: v }, "align")}
          options={[
            { value: "left", label: <AlignLeft size={14} />, title: "左对齐" },
            { value: "center", label: <AlignCenter size={14} />, title: "居中" },
            { value: "right", label: <AlignRight size={14} />, title: "右对齐" },
            { value: "justify", label: <AlignJustify size={14} />, title: "两端对齐" },
          ]}
        />
        <Row>
          <NumberField
            prefix="行距"
            value={st.lineHeight}
            min={0.6}
            max={5}
            step={0.05}
            precision={2}
            suffix="倍"
            onChange={(v) => set({ lineHeight: v }, "lh")}
          />
          <NumberField
            prefix="字距"
            value={st.letterSpacing * 1000}
            min={-500}
            max={3000}
            step={10}
            precision={0}
            suffix="‰"
            onChange={(v) => set({ letterSpacing: v / 1000 }, "ls")}
            title="字间距（千分之一字宽）"
          />
          <NumberField
            prefix="段前"
            value={st.spaceBefore}
            min={0}
            max={200}
            step={1}
            suffix="pt"
            onChange={(v) => set({ spaceBefore: v }, "sb")}
          />
          <NumberField
            prefix="段后"
            value={st.spaceAfter}
            min={0}
            max={200}
            step={1}
            suffix="pt"
            onChange={(v) => set({ spaceAfter: v }, "sa")}
          />
          <NumberField
            prefix="首行缩进"
            value={st.indent}
            min={0}
            max={20}
            step={0.5}
            suffix="字"
            onChange={(v) => set({ indent: v }, "ind")}
          />
        </Row>
      </Section>
      <Section title="分栏与文本框">
        <Row>
          <NumberField
            prefix="栏数"
            value={el.columns}
            min={1}
            max={12}
            precision={0}
            onChange={(v) =>
              updateElement(el.id, { columns: Math.round(v) } as Partial<TextElement>, "cols")
            }
          />
          <NumberField
            prefix="栏距"
            value={el.columnGap}
            min={0}
            max={100}
            step={0.5}
            suffix="mm"
            onChange={(v) => updateElement(el.id, { columnGap: v } as Partial<TextElement>, "gap")}
            disabled={el.columns < 2}
          />
          <NumberField
            prefix="内边距"
            value={el.padding}
            min={0}
            max={100}
            step={0.5}
            suffix="mm"
            onChange={(v) => updateElement(el.id, { padding: v } as Partial<TextElement>, "pad")}
          />
          <Select
            value={el.verticalAlign}
            onChange={(v) => updateElement(el.id, { verticalAlign: v } as Partial<TextElement>)}
            options={[
              { value: "top", label: "顶部对齐" },
              { value: "middle", label: "垂直居中" },
              { value: "bottom", label: "底部对齐" },
            ]}
          />
        </Row>
        <div className="mt-2">
          <Toggle
            checked={!!el.columnRule}
            onChange={(v) => updateElement(el.id, { columnRule: v } as Partial<TextElement>)}
            label="栏间分隔线"
          />
        </div>
        <div className="mt-1.5 text-[11px] leading-relaxed text-mute">
          正文在框内按栏顺序连续流动。标题、导语、图片可用独立对象横跨多栏放置。
        </div>
      </Section>
      <Section title="底色与边框">
        <Label>底色</Label>
        <ColorField
          className="mb-2"
          allowNone
          value={el.fill}
          onChange={(v) => updateElement(el.id, { fill: v } as Partial<TextElement>, "tfill")}
        />
        <StrokeEditor
          value={el.stroke}
          onChange={(v) => updateElement(el.id, { stroke: v } as Partial<TextElement>, "tstroke")}
        />
      </Section>
    </>
  );
}

/** Manuscript editor: supports pasting whole articles; IME composition is committed on end. */
function ContentEditor({
  el,
  innerRef,
}: {
  el: TextElement;
  innerRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [draft, setDraft] = useState(el.text);
  const composing = useRef(false);
  const idRef = useRef(el.id);
  useEffect(() => {
    if (
      idRef.current !== el.id ||
      (!composing.current && document.activeElement !== innerRef.current)
    )
      setDraft(el.text);
    idRef.current = el.id;
  }, [el.id, el.text]);
  const push = (v: string) =>
    getState() &&
    v !== el.text &&
    updateElement(el.id, { text: v } as Partial<TextElement>, `type:${el.id}`);
  return (
    <textarea
      ref={innerRef}
      className="h-40 w-full resize-y rounded-md border border-line p-2 text-[12.5px] leading-relaxed outline-none focus:border-accent"
      value={draft}
      placeholder="直接输入，或粘贴整篇稿件（段落以换行分隔）"
      spellCheck={false}
      onChange={(e) => {
        const v = normalizeText(e.target.value);
        setDraft(v);
        if (!composing.current && !(e.nativeEvent as InputEvent).isComposing) push(v);
      }}
      onCompositionStart={() => (composing.current = true)}
      onCompositionEnd={(e) => {
        composing.current = false;
        const v = normalizeText((e.target as HTMLTextAreaElement).value);
        setDraft(v);
        push(v);
      }}
      onPaste={(e) => {
        // normalise pasted manuscripts: unify line breaks, drop trailing whitespace on lines
        const t = e.clipboardData.getData("text/plain");
        if (!t) return;
        e.preventDefault();
        const clean = normalizeText(t)
          .split("\n")
          .map((l) => l.replace(/[ \u3000]+$/g, ""))
          .join("\n")
          .replace(/\n{3,}/g, "\n\n");
        const ta = e.currentTarget;
        const v = ta.value.slice(0, ta.selectionStart) + clean + ta.value.slice(ta.selectionEnd);
        setDraft(v);
        push(v);
      }}
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
}

function StrokeEditor({
  value,
  onChange,
}: {
  value: Stroke | null;
  onChange: (v: Stroke | null) => void;
}) {
  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <Label className="mb-0">边框</Label>
        <Toggle
          checked={!!value}
          onChange={(v) => onChange(v ? { color: "#1f1f1f", width: 0.5, dash: "solid" } : null)}
        />
      </div>
      {value && (
        <div className="space-y-1.5">
          <ColorField value={value.color} onChange={(c) => c && onChange({ ...value, color: c })} />
          <Row>
            <NumberField
              prefix="粗细"
              value={value.width}
              min={0.05}
              max={50}
              step={0.1}
              precision={2}
              suffix="mm"
              onChange={(w) => onChange({ ...value, width: w })}
            />
            <Select
              value={value.dash}
              onChange={(d) => onChange({ ...value, dash: d })}
              options={[
                { value: "solid", label: "实线" },
                { value: "dashed", label: "虚线" },
                { value: "dotted", label: "点线" },
                { value: "double", label: "双线" },
              ]}
            />
          </Row>
        </div>
      )}
    </>
  );
}

// ---------------- image ----------------
function ImageInspector({ el }: { el: ImageElement }) {
  const cropping = useEditor((s) => s.cropId === el.id);
  const meta = useEditor((s) => (el.assetId ? s.doc.assets[el.assetId] : undefined));
  const iw = meta?.width ?? el.crop.w;
  const ih = meta?.height ?? el.crop.h;
  const base = coverCrop(el.w, el.h, iw, ih);
  const zoom = el.crop.w / base.w;
  const setZoom = (z: number) => {
    const c = el.crop;
    const cx = (el.w / 2 - c.x) / c.w;
    const cy = (el.h / 2 - c.y) / c.h;
    const w = base.w * z;
    const h = base.h * z;
    let x = el.w / 2 - cx * w;
    let y = el.h / 2 - cy * h;
    x = Math.min(0, Math.max(el.w - w, x));
    y = Math.min(0, Math.max(el.h - h, y));
    updateElement(el.id, { crop: { x, y, w, h } } as Partial<ImageElement>, "crop-zoom");
  };
  const effDpi = meta ? Math.round((meta.width / el.crop.w) * 25.4) : null;
  return (
    <>
      <Section title="图片">
        <div className="mb-2 flex gap-1.5">
          <Button
            size="sm"
            variant="default"
            onClick={async () => {
              const files = await pickFiles(IMAGE_ACCEPT, false);
              if (files.length) await addImagesFromFiles(files, undefined, el.id);
            }}
          >
            <ImageUp size={14} /> {el.assetId ? "替换图片" : "选择图片"}
          </Button>
          <Button
            size="sm"
            variant={cropping ? "primary" : "subtle"}
            disabled={!el.assetId}
            onClick={() => setUI({ cropId: cropping ? null : el.id })}
          >
            <Crop size={14} /> {cropping ? "完成裁切" : "裁切"}
          </Button>
        </div>
        {meta && (
          <div className="mb-2 text-[11px] leading-relaxed text-mute">
            {meta.name} · {meta.width} × {meta.height} 像素
            {effDpi !== null && (
              <span className={effDpi < 150 ? "text-warn" : ""}>
                {" "}
                · 输出约 {effDpi} dpi{effDpi < 150 ? "（偏低，印刷可能模糊）" : ""}
              </span>
            )}
          </div>
        )}
        <Label>画面缩放</Label>
        <div className="mb-2 flex items-center gap-2">
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={Math.max(1, zoom)}
            disabled={!el.assetId}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-[#2b59c3]"
          />
          <span className="w-10 text-right text-[11px] text-mute tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="subtle"
            disabled={!el.assetId}
            onClick={() =>
              updateElement(el.id, { crop: coverCrop(el.w, el.h, iw, ih) } as Partial<ImageElement>)
            }
            title="画面铺满图框"
          >
            <Maximize size={13} /> 填满
          </Button>
          <Button
            size="sm"
            variant="subtle"
            disabled={!el.assetId}
            onClick={() =>
              updateElement(el.id, {
                crop: containCrop(el.w, el.h, iw, ih),
              } as Partial<ImageElement>)
            }
            title="完整显示画面"
          >
            <Minimize size={13} /> 完整显示
          </Button>
          <Button
            size="sm"
            variant="subtle"
            disabled={!el.assetId}
            title="图框按图片原始比例调整"
            onClick={() => {
              const h = (el.w * ih) / iw;
              updateElement(el.id, {
                h,
                crop: { x: 0, y: 0, w: el.w, h },
              } as Partial<ImageElement>);
            }}
          >
            <RotateCcw size={13} /> 还原比例
          </Button>
        </div>
        <div className="mt-2.5">
          <Toggle
            checked={el.keepRatio}
            onChange={(v) => updateElement(el.id, { keepRatio: v } as Partial<ImageElement>)}
            label="缩放时保持比例（Shift 临时切换）"
          />
        </div>
      </Section>
      <Section title="圆角与边框">
        <NumberField
          className="mb-2"
          prefix="圆角"
          value={el.radius}
          min={0}
          max={500}
          step={0.5}
          suffix="mm"
          onChange={(v) => updateElement(el.id, { radius: v } as Partial<ImageElement>, "irad")}
        />
        <StrokeEditor
          value={el.stroke}
          onChange={(v) => updateElement(el.id, { stroke: v } as Partial<ImageElement>, "istroke")}
        />
      </Section>
    </>
  );
}

// ---------------- shape ----------------
function ShapeInspector({ el }: { el: ShapeElement }) {
  return (
    <Section title="外观">
      {el.shape !== "line" && (
        <>
          <Label>填充</Label>
          <ColorField
            className="mb-2"
            allowNone
            value={el.fill}
            onChange={(v) => updateElement(el.id, { fill: v } as Partial<ShapeElement>, "sfill")}
          />
        </>
      )}
      <StrokeEditor
        value={el.stroke}
        onChange={(v) => updateElement(el.id, { stroke: v } as Partial<ShapeElement>, "sstroke")}
      />
      {el.shape === "rect" && (
        <NumberField
          className="mt-2"
          prefix="圆角"
          value={el.radius}
          min={0}
          max={500}
          step={0.5}
          suffix="mm"
          onChange={(v) => updateElement(el.id, { radius: v } as Partial<ShapeElement>, "srad")}
        />
      )}
    </Section>
  );
}

// ---------------- page / document ----------------
function PageInspector() {
  const s = useEditor((x) => x);
  const page = currentPage(s);
  const d = s.doc;
  const idx = d.pages.findIndex((p) => p.id === page.id);
  const [w, setW] = useState(d.pageSize.width);
  const [h, setH] = useState(d.pageSize.height);
  useEffect(() => {
    setW(d.pageSize.width);
    setH(d.pageSize.height);
  }, [d.pageSize.width, d.pageSize.height]);
  const changed = w !== d.pageSize.width || h !== d.pageSize.height;
  return (
    <>
      <Section title={`第 ${idx + 1} 页`}>
        <Label>页面底色</Label>
        <ColorField
          className="mb-2.5"
          value={page.background}
          onChange={(v) => v && updatePage(page.id, { background: v }, "pbg")}
        />
        <Label>参考线</Label>
        <div className="mb-1 text-[11px] leading-relaxed text-mute">
          从标尺拖出参考线；拖回标尺可删除。
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="subtle"
            onClick={() =>
              updatePage(page.id, {
                guides: { x: [...page.guides.x, d.pageSize.width / 2], y: page.guides.y },
              })
            }
          >
            添加垂直中线
          </Button>
          <Button
            size="sm"
            variant="subtle"
            onClick={() =>
              updatePage(page.id, {
                guides: { x: page.guides.x, y: [...page.guides.y, d.pageSize.height / 2] },
              })
            }
          >
            添加水平中线
          </Button>
          <Button
            size="sm"
            variant="subtle"
            disabled={!page.guides.x.length && !page.guides.y.length}
            onClick={() => updatePage(page.id, { guides: { x: [], y: [] } })}
          >
            清除本页参考线
          </Button>
        </div>
      </Section>
      <Section title="作品设置">
        <Label>作品名称</Label>
        <input
          className="mb-2.5 h-7 w-full rounded-md border border-line px-2 text-[12px] outline-none focus:border-accent"
          value={d.name}
          onChange={(e) => updateDoc({ name: e.target.value }, "docname")}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <Label>单页尺寸（宽 × 高，毫米）</Label>
        <Select
          className="mb-1.5 w-full"
          value=""
          onChange={(id) => {
            const p = SIZE_PRESETS.find((x) => x.id === id);
            if (!p) return;
            const land = w > h;
            setW(land ? p.height : p.width);
            setH(land ? p.width : p.height);
          }}
          options={[
            { value: "", label: "选择预设尺寸…" },
            ...SIZE_PRESETS.map((p) => ({
              value: p.id,
              label: `${p.name}　${p.width} × ${p.height}`,
            })),
          ]}
        />
        <Row className="mb-1.5">
          <NumberField prefix="宽" value={w} min={30} max={2000} onChange={setW} suffix="mm" />
          <NumberField prefix="高" value={h} min={30} max={2000} onChange={setH} suffix="mm" />
        </Row>
        <div className="mb-2.5 flex items-center gap-1.5">
          <Button
            size="sm"
            variant={changed ? "primary" : "subtle"}
            disabled={!changed}
            onClick={() => updateDoc({ pageSize: { width: w, height: h }, sizeLabel: "自定义" })}
          >
            应用尺寸
          </Button>
          <Button size="sm" variant="ghost" onClick={() => (setW(h), setH(w))}>
            横竖互换
          </Button>
        </div>
        <div className="mb-2.5 text-[11px] text-mute">
          当前：{sizeLabel(d.pageSize.width, d.pageSize.height)}。修改尺寸不会缩放已有内容。
        </div>
        <Label>页边距（毫米）</Label>
        <Row>
          {(["top", "bottom", "left", "right"] as const).map((k) => (
            <NumberField
              key={k}
              prefix={{ top: "上", bottom: "下", left: "左", right: "右" }[k]}
              value={d.margins[k]}
              min={0}
              max={500}
              onChange={(v) => updateDoc({ margins: { ...d.margins, [k]: v } }, `m-${k}`)}
            />
          ))}
        </Row>
      </Section>
      <Section title="视图">
        <div className="flex flex-col gap-2">
          <Toggle checked={s.showRulers} onChange={(v) => setUI({ showRulers: v })} label="标尺" />
          <Toggle
            checked={s.showGuides}
            onChange={(v) => setUI({ showGuides: v })}
            label="参考线"
          />
          <Toggle
            checked={s.showMargins}
            onChange={(v) => setUI({ showMargins: v })}
            label="页边距线"
          />
          <Toggle
            checked={s.snap}
            onChange={(v) => setUI({ snap: v })}
            label="吸附（拖动时按住 Alt 临时关闭）"
          />
        </div>
      </Section>
    </>
  );
}
