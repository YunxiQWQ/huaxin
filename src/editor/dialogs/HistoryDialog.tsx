import { useEffect, useState } from "react";
import { History, RotateCcw, Save } from "lucide-react";
import { Button, Modal, formatTime } from "../../ui/kit";
import { listVersions, MAX_VERSIONS } from "../../storage/projects";
import type { VersionRecord } from "../../storage/db";
import { session, VERSION_INTERVAL } from "../../storage/session";
import { getState } from "../store";
import { toast } from "../../ui/toast";

const KIND: Record<string, string> = {
  auto: "自动备份",
  manual: "手动保存",
  "restore-backup": "恢复前保留",
  "conflict-backup": "冲突时保留",
};

export function HistoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [list, setList] = useState<Omit<VersionRecord, "doc">[] | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = async () => setList(await listVersions(getState().doc.id));
  useEffect(() => {
    if (open) void refresh();
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="历史版本" width={560}>
      <p className="mb-3 text-[12.5px] leading-relaxed text-ink-2">
        编辑期间约每 {VERSION_INTERVAL / 60000} 分钟自动保存一个历史版本，每个作品保留最近{" "}
        {MAX_VERSIONS}{" "}
        个版本。版本只保存在本机浏览器中，相同图片不会重复占用空间。恢复前会自动保留当前内容，恢复操作也可以撤销。
      </p>
      <div className="mb-4 flex gap-2">
        <input
          className="h-8 flex-1 rounded-md border border-line px-2.5 text-[13px] outline-none focus:border-accent"
          placeholder="版本说明（可选），如：定稿前"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await session.createVersion("manual", label.trim() || "手动保存");
            setBusy(false);
            if (ok) {
              setLabel("");
              toast("ok", "已保存历史版本");
              void refresh();
            }
          }}
        >
          <Save size={14} /> 保存当前版本
        </Button>
      </div>
      <div className="divide-y divide-line rounded-lg border border-line">
        {list === null && <div className="p-4 text-[12px] text-mute">读取中…</div>}
        {list?.length === 0 && (
          <div className="flex items-center gap-2 p-4 text-[12px] text-mute">
            <History size={14} /> 还没有历史版本
          </div>
        )}
        {list?.map((v) => (
          <div key={v.id} className="flex items-center gap-3 px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">{formatTime(v.createdAt)}</div>
              <div className="text-[11.5px] text-mute">
                {KIND[v.kind] ?? v.kind}
                {v.label && v.label !== KIND[v.kind] ? ` · ${v.label}` : ""} · {v.pageCount} 页
              </div>
            </div>
            <Button
              size="sm"
              disabled={busy}
              onClick={async () => {
                if (
                  !window.confirm(
                    `恢复到 ${formatTime(v.createdAt)} 的版本？\n当前内容会先自动保留为一个历史版本，恢复后也可以撤销。`,
                  )
                )
                  return;
                setBusy(true);
                try {
                  await session.restoreVersion(v.id);
                  toast("ok", "已恢复历史版本（当前内容已保留，可撤销）");
                  onClose();
                } catch (e: any) {
                  toast("error", `恢复失败：${e?.message ?? e}`);
                }
                setBusy(false);
              }}
            >
              <RotateCcw size={13} /> 恢复
            </Button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
