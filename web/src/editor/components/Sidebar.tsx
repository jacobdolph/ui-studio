import { CATEGORIES, FRAMES, frameKey } from "../../editmode/frames";
import type { Layout } from "../../editmode/layoutString";
import type { Action } from "../store";

interface Props {
  layout: Layout;
  visible: Record<string, boolean>;
  selected: string | null;
  dispatch: (a: Action) => void;
}

export function Sidebar({ layout, visible, selected, dispatch }: Props) {
  const present = new Set(layout.systems.map((s) => frameKey(s.system, s.systemIndex)));
  const moved = new Map(layout.systems.map((s) => [frameKey(s.system, s.systemIndex), !s.isInDefaultPosition]));
  const gamepad = layout.interfaceStyle === 1;

  return (
    <aside className="sidebar">
      <div className="side-head">
        <span>Frames</span>
        <span className="side-actions">
          <button className="link" onClick={() => dispatch({ type: "setAllVisible", visible: true })}>show all</button>
          <button className="link" onClick={() => dispatch({ type: "setAllVisible", visible: false })}>hide all</button>
        </span>
      </div>
      <p className="side-hint">Click a name to select it on the canvas. Use the switch to show or hide it on the canvas (hidden frames still export). A blue dot marks a frame you have moved.</p>
      {CATEGORIES.map((cat) => {
        const items = FRAMES.filter((f) => f.category === cat && present.has(f.key) && (gamepad || f.system !== 30));
        if (items.length === 0) return null;
        return (
          <section key={cat} className="side-group">
            <h3>{cat}</h3>
            <ul>
              {items.map((f) => {
                const on = visible[f.key] ?? f.defaultVisible;
                return (
                  <li key={f.key} className={`${selected === f.key ? "selected" : ""} ${on ? "" : "off"}`}>
                    <button className="name" title="Select on the canvas" onClick={() => dispatch({ type: "select", key: f.key })}>
                      {f.label}
                      {moved.get(f.key) && <span className="dot" title="Moved from default position" />}
                    </button>
                    <button
                      className="switch"
                      role="switch"
                      aria-checked={on}
                      title={on ? "Shown on canvas. Click to hide" : "Hidden on canvas. Click to show"}
                      aria-label={`${on ? "Hide" : "Show"} ${f.label} on the canvas`}
                      onClick={() => dispatch({ type: "toggleVisible", key: f.key })}
                    >
                      <span className="knob" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </aside>
  );
}
