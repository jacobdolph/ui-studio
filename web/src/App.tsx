import { useMemo, useState } from "react";
import "./App.css";
import {
  decodeLayoutString, encodeLayoutString, tokenize, LayoutParseError, type Layout, type LayoutSystem,
} from "./editmode/layoutString";
import { describeSettings, summarize, systemLabel } from "./editmode/describe";
import { Enum } from "./editmode/schema.generated";

const SAMPLE =
  "5 0 3 0 0 1 8 6 MicroMenuContainer -4.5 -4.0 -1 ##$$%/&('%)#+$,$ 2 -1 1 2 2 UIParent 0.0 0.0 -1 ##$#%(&( 3 3 1 0 2 CompactRaidFrameManager 0.0 12.0 -1 '$($)#-k.G/#1#3#7-7$8(";

const STYLE_NAMES: Record<number, string> = { 0: "Keyboard & mouse", 1: "Gamepad" };

function SystemRow({ sys }: { sys: LayoutSystem }) {
  const [open, setOpen] = useState(false);
  const settings = describeSettings(sys);
  const a = sys.anchor;
  return (
    <li className={`sys ${open ? "open" : ""}`}>
      <button className="sys-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="sys-name">{systemLabel(sys)}</span>
        <span className="sys-anchor">
          {a.point} → {a.relativeTo}.{a.relativePoint} ({a.offsetX}, {a.offsetY})
          {sys.anchor2 ? " + 2nd anchor" : ""}
        </span>
        <span className="sys-meta">
          {sys.isInDefaultPosition ? <span className="tag">default pos</span> : null}
          <span className="tag muted">{settings.length} settings</span>
        </span>
      </button>
      {open && (
        <table className="settings">
          <tbody>
            {settings.map((s) => (
              <tr key={s.id} className={s.known ? "" : "unknown"}>
                <td className="mono">{s.id}</td>
                <td>{s.label}</td>
                <td className="mono">{s.raw}</td>
                <td>{s.display}</td>
              </tr>
            ))}
            {settings.length === 0 && <tr><td colSpan={4} className="muted">no settings</td></tr>}
          </tbody>
        </table>
      )}
    </li>
  );
}

export default function App() {
  const [text, setText] = useState(SAMPLE);
  const result = useMemo(() => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    try {
      const layout: Layout = decodeLayoutString(trimmed);
      const reencoded = encodeLayoutString(layout);
      const exact = reencoded === tokenize(trimmed).join(" ");
      return { layout, reencoded, exact, summary: summarize(layout), error: null as string | null };
    } catch (e) {
      return { layout: null, reencoded: "", exact: false, summary: null, error: e instanceof LayoutParseError ? e.message : String(e) };
    }
  }, [text]);

  const systemName = (id: number) => Object.entries(Enum.EditModeSystem).find(([, v]) => v === id)?.[0] ?? `#${id}`;

  return (
    <main className="app">
      <header>
        <h1>UI Studio <span className="sub">· Edit Mode string inspector</span></h1>
        <p className="lede">
          Paste a layout string from <em>Edit Mode → Share → Export</em>. This spike page decodes it, shows every frame and
          setting with WoW Forever names, and re-encodes it to prove the round trip is lossless.
        </p>
      </header>

      <section className="io">
        <label htmlFor="in">Layout string</label>
        <textarea id="in" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} rows={5} />
        <div className="row">
          <button onClick={() => setText(SAMPLE)}>Load sample</button>
          <button onClick={() => setText("")}>Clear</button>
          {result?.layout && (
            <button onClick={() => navigator.clipboard?.writeText(result.reencoded)}>Copy re-encoded</button>
          )}
        </div>
      </section>

      {result?.error && <p className="error">Not a layout string: {result.error}</p>}

      {result?.layout && result.summary && (
        <>
          <section className="summary">
            <div><span className="k">Version</span><span className="v mono">{result.layout.version}</span></div>
            <div><span className="k">Header</span><span className="v">{result.layout.headerKind}{result.layout.interfaceStyle !== null ? ` · ${STYLE_NAMES[result.layout.interfaceStyle] ?? result.layout.interfaceStyle}` : ""}</span></div>
            <div><span className="k">Systems</span><span className="v mono">{result.layout.systems.length}</span></div>
            <div><span className="k">Round trip</span><span className={`v ${result.exact ? "ok" : "bad"}`}>{result.exact ? "byte-exact ✓" : "differs ✗"}</span></div>
            <div><span className="k">Forever-compatible</span><span className={`v ${result.summary.unknownSystems.length || result.summary.unknownSettings.length ? "warn" : "ok"}`}>
              {result.summary.unknownSystems.length || result.summary.unknownSettings.length
                ? `${result.summary.unknownSystems.length} unknown systems, ${result.summary.unknownSettings.length} unknown settings`
                : result.layout.version >= 3 ? "yes" : "ids may differ (pre-Forever string)"}
            </span></div>
          </section>
          {result.layout.warnings.length > 0 && (
            <ul className="warnings">{result.layout.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          )}
          <ul className="systems">
            {result.layout.systems.map((s, i) => <SystemRow key={`${systemName(s.system)}-${s.systemIndex}-${i}`} sys={s} />)}
          </ul>
          <section className="io">
            <label htmlFor="out">Re-encoded</label>
            <textarea id="out" value={result.reencoded} readOnly rows={4} spellCheck={false} />
          </section>
        </>
      )}
    </main>
  );
}
