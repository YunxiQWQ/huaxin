import { Button, Modal } from "../../ui/kit";
import { session, useSaveStatus } from "../../storage/session";
import { downloadProjectFile, setRoute } from "../../app/actions";
import { toast } from "../../ui/toast";

export function StatusDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const st = useSaveStatus();
  return (
    <Modal open={open} onClose={onClose} title="本机保存" width={480}>
      {st.state === "error" ? (
        <div className="space-y-3 text-[13px] leading-relaxed text-ink-2">
          <p className="font-medium text-danger">保存到本机失败：{st.error}</p>
          <p>
            当前编辑内容仍保留在页面中。为防止丢失，请立即下载工程文件。
            {st.quota && "也可以回到工作台删除不需要的作品以释放空间。"}
          </p>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => void downloadProjectFile()}>
              下载工程文件
            </Button>
            <Button onClick={() => void session.save()}>重试保存</Button>
          </div>
        </div>
      ) : st.state === "conflict" ? (
        <ConflictBody onClose={onClose} />
      ) : (
        <div className="space-y-2 text-[13px] leading-relaxed text-ink-2">
          <p>
            编辑后会自动保存到本浏览器（合并连续修改，只写入变化的页面）。下次打开本网站时会恢复上次编辑的作品。
          </p>
          <p className="text-[12px] text-mute">
            自动备份属于当前浏览器和当前网站地址。清除浏览器数据会删除它们；需要换电脑或长期保存时，请下载工程文件。
          </p>
        </div>
      )}
    </Modal>
  );
}

export function ConflictBody({ onClose }: { onClose: () => void }) {
  const st = useSaveStatus();
  return (
    <div className="space-y-3 text-[13px] leading-relaxed text-ink-2">
      <p className="font-medium text-warn">{st.conflictReason}</p>
      <p>请选择如何处理本页尚未保存的内容：</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={async () => {
            const id = await session.resolveSaveAsCopy();
            setRoute({ view: "editor", projectId: id });
            toast("ok", "已将本页内容另存为新作品");
            onClose();
          }}
        >
          另存为新作品
        </Button>
        <Button
          onClick={async () => {
            await session.resolveReload();
            toast("info", "已载入最新内容，本页之前的内容已保留在历史版本中");
            onClose();
          }}
        >
          载入其他页面的最新内容
        </Button>
        <Button variant="ghost" onClick={() => void downloadProjectFile()}>
          下载本页内容为工程文件
        </Button>
      </div>
    </div>
  );
}
