import type { ReactNode } from "react";
import { cx } from "../ui/kit";
import { setRoute, useRoute } from "../app/actions";

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-[6px] bg-seal font-bold text-white shadow-sm"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.56,
        fontFamily: '"BX Noto Serif SC", "Songti SC", SimSun, "BX UI Sans", serif',
      }}
    >
      版
    </div>
  );
}

export function AppHeader({ right }: { right?: ReactNode }) {
  const route = useRoute();
  const tab = (view: "workbench" | "templates", label: string) => (
    <button
      onClick={() => setRoute({ view })}
      className={cx(
        "relative h-14 px-1 text-[14px] transition-colors",
        route.view === view ? "font-semibold text-ink" : "text-ink-2 hover:text-ink",
      )}
    >
      {label}
      {route.view === view && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded bg-ink" />}
    </button>
  );
  return (
    <header className="flex h-14 shrink-0 items-center gap-8 border-b border-line bg-white px-6">
      <div className="flex items-center gap-2.5">
        <BrandMark />
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-wide">版心</div>
          <div className="text-[10.5px] text-mute">本地优先的报刊画册排版</div>
        </div>
      </div>
      <nav className="flex gap-6">
        {tab("workbench", "本机工作台")}
        {tab("templates", "模板中心")}
      </nav>
      <div className="ml-auto flex items-center gap-2">{right}</div>
    </header>
  );
}
