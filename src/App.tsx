import { useEffect } from "react";
import { useRoute, setRoute, openProject, leaveEditor } from "./app/actions";
import { Workbench } from "./views/Workbench";
import { TemplateCenter } from "./views/TemplateCenter";
import { Editor } from "./editor/Editor";
import { Toaster } from "./ui/toast";
import { getState, hasState } from "./editor/store";
import { session } from "./storage/session";
import { getMeta } from "./storage/db";
import { collectGarbage } from "./storage/projects";
import { BrandMark } from "./views/Shell";

let booted = false;
async function boot() {
  if (booted) return;
  booted = true;
  const m = /^#\/edit\/([\w-]+)/.exec(location.hash);
  if (m && (await openProject(m[1]))) return;
  if (location.hash === "#/templates") return setRoute({ view: "templates" });
  if (location.hash === "#/" || location.hash === "#") return setRoute({ view: "workbench" });
  // reopening the site restores the last edited work
  const last = await getMeta<string>("lastProjectId").catch(() => undefined);
  if (last && (await openProject(last))) return;
  setRoute({ view: "workbench" });
}

/** Follow manual hash edits and browser back/forward. */
async function onHashChange() {
  const m = /^#\/edit\/([\w-]+)/.exec(location.hash);
  if (m) return void (await openProject(m[1]));
  const view = location.hash === "#/templates" ? "templates" : "workbench";
  if (hasState()) await leaveEditor({ view });
  else setRoute({ view });
}

export default function App() {
  const route = useRoute();

  useEffect(() => {
    void boot().then(() => {
      const idle = (window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 3000));
      idle(() => collectGarbage().catch(() => undefined));
    });
    // leave warning: when current changes have not been downloaded as a project file
    const beforeUnload = (e: BeforeUnloadEvent) => {
      void session.flush();
      if (hasState() && getState().doc !== getState().fileSavedDoc) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const hide = () => document.visibilityState === "hidden" && void session.flush();
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", () => void session.flush());
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);

  return (
    <>
      {route.view === "loading" && (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-[13px] text-mute">
          <BrandMark size={40} />
          正在打开本机作品库…
        </div>
      )}
      {route.view === "workbench" && <Workbench />}
      {route.view === "templates" && <TemplateCenter />}
      {route.view === "editor" && hasState() && <Editor />}
      <Toaster />
    </>
  );
}
