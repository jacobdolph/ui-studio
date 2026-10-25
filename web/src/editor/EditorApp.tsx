import { useEffect, useMemo, useReducer, useState } from "react";
import { frameKey } from "../editmode/frames";
import { Canvas } from "./components/Canvas";
import { Sidebar } from "./components/Sidebar";
import { Inspector } from "./components/Inspector";
import { Toolbar } from "./components/Toolbar";
import { ExportDialog, ImportDialog } from "./components/Dialogs";
import { computeRects } from "./geometry";
import { currentScreen, exportString, loadState, reducer, saveState } from "./store";

/** Saved state, unless the page was opened from a share link (`?layout=<export string>`). */
function initialStateFromUrl() {
  const saved = loadState();
  try {
    const url = new URL(location.href);
    const text = url.searchParams.get("layout");
    if (!text) return saved;
    url.searchParams.delete("layout");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
    return reducer(saved, { type: "importString", text: text.trim(), name: url.searchParams.get("name") ?? "Shared layout" });
  } catch {
    return saved;
  }
}

export function EditorApp() {
  const [state, dispatch] = useReducer(reducer, undefined, initialStateFromUrl);
  const [dialog, setDialog] = useState<"import" | "export" | null>(null);

  const screen = useMemo(() => currentScreen(state), [state.screenId, state.uiScale]); // eslint-disable-line react-hooks/exhaustive-deps
  const rects = useMemo(
    () => computeRects(state.layout, screen, { isShown: (k) => state.visible[k] ?? true }),
    [state.layout, screen, state.visible],
  );

  useEffect(() => {
    const t = setTimeout(() => saveState(state), 250);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selectedSys = state.selected ? state.layout.systems.find((s) => frameKey(s.system, s.systemIndex) === state.selected) ?? null : null;
  const movedCount = state.layout.systems.filter((s) => !s.isInDefaultPosition).length;

  return (
    <div className="editor">
      <Toolbar state={state} screen={screen} dispatch={dispatch} onImport={() => setDialog("import")} onExport={() => setDialog("export")} />
      <div className="body">
        <Sidebar layout={state.layout} visible={state.visible} selected={state.selected} dispatch={dispatch} />
        <Canvas
          screen={screen}
          rects={rects}
          visible={state.visible}
          selected={state.selected}
          showGrid={state.showGrid}
          gridSize={state.gridSize}
          snap={state.snap}
          dispatch={dispatch}
        />
        <Inspector sys={selectedSys} placed={state.selected ? rects.get(state.selected) : undefined} rects={rects} screen={screen} dispatch={dispatch} />
      </div>
      {dialog === "import" && <ImportDialog screen={screen} open onClose={() => setDialog(null)} onImport={(text) => dispatch({ type: "importString", text })} />}
      {dialog === "export" && <ExportDialog open onClose={() => setDialog(null)} text={exportString(state)} name={state.name} movedCount={movedCount} />}
    </div>
  );
}
