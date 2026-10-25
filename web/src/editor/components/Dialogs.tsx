import { useEffect, useMemo, useState } from "react";
import { decodeLayoutString } from "../../editmode/layoutString";
import { summarize } from "../../editmode/describe";
import { systemLabel } from "../../editmode/describe";

interface ImportProps {
  open: boolean;
  onClose: () => void;
  onImport: (text: string) => void;
}

export function ImportDialog({ open, onClose, onImport }: ImportProps) {
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
  const liveRetail = s && s.version <= 2 && s.unknownSystems.length > 0;
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
          {s.unknownSystems.length > 0 && (
            <div className="warnings">
              {liveRetail
                ? `This looks like a live-retail string. Retail and Forever disagree on system ids from 26 up, so ${s.unknownSystems.length} frame(s) will be dropped or mislabeled: ${s.unknownSystems.map((k) => { const [a, b] = k.split("/").map(Number); return systemLabel({ system: a, systemIndex: b === -1 ? null : b }); }).join(", ")}.`
                : `${s.unknownSystems.length} system(s) are not known to this Forever build and will be kept as-is.`}
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
