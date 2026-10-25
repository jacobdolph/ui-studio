import { useEffect, useMemo, useState } from "react";
import { decodeLayoutString } from "../../editmode/layoutString";
import { summarize, systemLabel } from "../../editmode/describe";
import { previewRetailRemaps } from "../../editmode/compat";
import type { Screen } from "../geometry";
import { SCREEN_PRESETS, defaultUiScale, inferScreenId, uiParentSize } from "../store";

interface ImportProps {
  open: boolean;
  onClose: () => void;
  onImport: (text: string) => void;
  /** The editor's current UIParent size, to tell the user when the layout was made for another screen. */
  screen: Screen;
}

export function ImportDialog({ open, onClose, onImport, screen }: ImportProps) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => {
    const t = text.trim();
    if (!t) return null;
    try {
      const layout = decodeLayoutString(t);
      return { layout, summary: summarize(layout), error: null as string | null };
    } catch (e) {
      return { layout: null, summary: null, error: (e as Error).message };
    }
  }, [text]);

  if (!open) return null;
  const s = parsed?.summary;
  const remaps = parsed?.layout ? previewRetailRemaps(parsed.layout) : [];
  const inferred = parsed?.layout ? inferScreenId(parsed.layout, screen) : null;
  const inferredPreset = inferred ? SCREEN_PRESETS.find((p) => p.id === inferred) : null;
  const remappedKeys = new Set(remaps.map((r) => `${r.from}/-1`));
  const unknown = s ? s.unknownSystems.filter((k) => !remappedKeys.has(k)) : [];
  return (
    <Modal title="Import a layout string" onClose={onClose}>
      <p className="hint">
        In game: Esc → Edit Mode → Layout dropdown → <b>Export</b> copies the active layout. Paste it here. Strings from wago.io work too.
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="5 0 59 0 0 1 8 6 MicroMenuContainer -4.5 -4.0 -1 …" rows={6} spellCheck={false} />
      {parsed?.error && <div className="error">{parsed.error}</div>}
      {s && parsed?.layout && (
        <div className="import-summary">
          <div><span className="k">Format version</span><span className="v">{s.version}{s.version >= 3 ? " (WoW Forever)" : s.version === 2 ? " (retail / Classic)" : " (Dragonflight)"}</span></div>
          <div><span className="k">Systems</span><span className="v">{s.systems}</span></div>
          <div><span className="k">Moved frames</span><span className="v">{parsed.layout.systems.filter((x) => !x.isInDefaultPosition).length}</span></div>
          {inferredPreset && (
            <div className="note">
              The frames only fit a {uiParentSize(inferredPreset, defaultUiScale(inferredPreset.pixelHeight)).width} × {uiParentSize(inferredPreset, defaultUiScale(inferredPreset.pixelHeight)).height} UI,
              so the screen will switch to {inferredPreset.label} at the default UI scale ({defaultUiScale(inferredPreset.pixelHeight).toFixed(2)}). Change it in the toolbar if your monitor differs.
            </div>
          )}
          {s.version <= 2 && (
            <div className="note">
              Retail / Classic string. Retail and Forever share every frame and setting id except Loss of Control
              {remaps.length > 0 ? ", which will be moved from retail id 26 to Forever id 28 on import." : "."}
              {" "}Frames Forever adds (end caps, totem bar, swing timers) will use the game's defaults.
            </div>
          )}
          {unknown.length > 0 && (
            <div className="warnings">
              {`${unknown.length} system(s) are not known to this Forever build and will be kept as-is: ${unknown.map((k) => { const [a, b] = k.split("/").map(Number); return systemLabel({ system: a, systemIndex: b === -1 ? null : b }); }).join(", ")}.`}
            </div>
          )}
          {s.warnings.map((w, i) => <div key={i} className="warnings">{w}</div>)}
        </div>
      )}
      <div className="row end">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={!parsed?.layout} onClick={() => { onImport(text.trim()); onClose(); }}>Import</button>
      </div>
    </Modal>
  );
}

interface ExportProps {
  open: boolean;
  onClose: () => void;
  text: string;
  name: string;
  movedCount: number;
}

export function ExportDialog({ open, onClose, text, name, movedCount }: ExportProps) {
  const [copied, setCopied] = useState(false);
  if (!open) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      const ta = document.getElementById("export-text") as HTMLTextAreaElement | null;
      ta?.select();
      setCopied(false);
    }
  };
  const shareLink = `${location.origin}${location.pathname}?layout=${encodeURIComponent(text)}`;
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareLink); setCopied(true); } catch { setCopied(false); }
  };
  return (
    <Modal title={`Export “${name}”`} onClose={onClose}>
      <ol className="steps">
        <li>Copy the string below.</li>
        <li>In WoW Forever press <b>Esc → Edit Mode</b>, open the layout dropdown and choose <b>Import</b>.</li>
        <li>Paste, name the layout <b>{name}</b>, and click Import. Frames you didn't move stay where the game puts them.</li>
      </ol>
      <textarea id="export-text" readOnly value={text} rows={6} onFocus={(e) => e.currentTarget.select()} spellCheck={false} />
      <div className="hint small">{text.length.toLocaleString()} characters · {movedCount} frame{movedCount === 1 ? "" : "s"} moved · WoW Forever format (version 5)</div>
      <div className="row end">
        <button onClick={onClose}>Close</button>
        <button onClick={copyLink} title="A link that opens this layout in UI Studio">Copy share link</button>
        <button className="primary" onClick={copy}>{copied ? "Copied ✓" : "Copy to clipboard"}</button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button className="x" onClick={onClose} aria-label="Close">×</button></div>
        {children}
      </div>
    </div>
  );
}
