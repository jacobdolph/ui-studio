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
          <button className="link" onClick={() => dispatch({ type: "setAllVisible", visible: true })}>all</button>
          <button className="link" onClick={() => dispatch({ type: "setAllVisible", visible: false })}>none</button>
        </span>
      </div>
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
                    <button
                      className="eye"
                      title={on ? "Hide on canvas" : "Show on canvas"}
                      aria-label={on ? `Hide ${f.label}` : `Show ${f.label}`}
                      onClick={() => dispatch({ type: "toggleVisible", key: f.key })}
                    >
                      {on ? "●" : "○"}
                    </button>
                    <button className="name" onClick={() => dispatch({ type: "select", key: f.key })}>
                      {f.label}
                      {moved.get(f.key) && <span className="dot" title="Moved from default position" />}
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
