import { ANCHOR_POINTS, type AnchorPoint, type LayoutSystem } from "../../editmode/layoutString";
import { Systems, type SettingSchema } from "../../editmode/schema.generated";
import { FRAMES, displayNumber, frameDef, frameKey, rawFromDisplay } from "../../editmode/frames";
import { type Placed, type Screen, reanchorRect } from "../geometry";
import type { Action } from "../store";

interface Props {
  sys: LayoutSystem | null;
  placed: Placed | undefined;
  rects: Map<string, Placed>;
  screen: Screen;
  dispatch: (a: Action) => void;
}

const POINT_LABEL: Record<AnchorPoint, string> = {
  TOPLEFT: "Top left", TOP: "Top", TOPRIGHT: "Top right",
  LEFT: "Left", CENTER: "Center", RIGHT: "Right",
  BOTTOMLEFT: "Bottom left", BOTTOM: "Bottom", BOTTOMRIGHT: "Bottom right",
};

export function Inspector({ sys, placed, rects, screen, dispatch }: Props) {
  if (!sys) {
    return (
      <aside className="inspector">
        <div className="side-head"><span>Inspector</span></div>
        <p className="hint">
          Click a frame on the canvas to select it, then drag to move. Arrow keys nudge by 1, Shift+arrows by 10.
        </p>
        <p className="hint">
          Frames in their default position follow the game's own stacking rules, exactly like a fresh preset. Once you
          move one, it is anchored to the screen where you dropped it.
        </p>
      </aside>
    );
  }

  const key = frameKey(sys.system, sys.systemIndex);
  const def = frameDef(sys.system, sys.systemIndex);
  const schema = Systems[String(sys.system)];
  const settings: SettingSchema[] = schema ? Object.values(schema.settings).filter((s) => s.type && !s.name.startsWith("Deprecated") && !s.name.startsWith("DisplayOnly")) : [];
  const anchorTargets = FRAMES.filter((f) => f.frameName && f.key !== key && rects.has(f.key)).map((f) => f.frameName as string);

  const setAnchorKeepPlace = (patch: { point?: AnchorPoint; relativeTo?: string; relativePoint?: AnchorPoint }) => {
    if (!placed) return;
    const a = reanchorRect(placed.rect, patch.point ?? sys.anchor.point, patch.relativeTo ?? sys.anchor.relativeTo, patch.relativePoint ?? sys.anchor.relativePoint, rects, screen);
    dispatch({ type: "setAnchor", key, anchor: a });
  };

  return (
    <aside className="inspector">
      <div className="side-head">
        <span>{def?.label ?? `System ${key}`}</span>
        {sys.isInDefaultPosition ? <span className="tag muted">default position</span> : <span className="tag">moved</span>}
      </div>

      <section className="group">
        <h3>Position</h3>
        <div className="field-row">
          <label>Anchor
            <select value={sys.anchor.point} onChange={(e) => setAnchorKeepPlace({ point: e.target.value as AnchorPoint })}>
              {ANCHOR_POINTS.map((p) => <option key={p} value={p}>{POINT_LABEL[p]}</option>)}
            </select>
          </label>
          <label>To
            <select value={sys.anchor.relativeTo} onChange={(e) => setAnchorKeepPlace({ relativeTo: e.target.value })}>
              <option value="UIParent">Screen</option>
              {!anchorTargets.includes(sys.anchor.relativeTo) && sys.anchor.relativeTo !== "UIParent" && <option value={sys.anchor.relativeTo}>{sys.anchor.relativeTo}</option>}
              {anchorTargets.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <div className="field-row">
          <label>Target point
            <select value={sys.anchor.relativePoint} onChange={(e) => setAnchorKeepPlace({ relativePoint: e.target.value as AnchorPoint })}>
              {ANCHOR_POINTS.map((p) => <option key={p} value={p}>{POINT_LABEL[p]}</option>)}
            </select>
          </label>
        </div>
        <div className="field-row">
          <label>X
            <input type="number" step={0.1} value={sys.anchor.offsetX}
              onChange={(e) => dispatch({ type: "setAnchor", key, anchor: { offsetX: parseFloat(e.target.value) || 0 } })} />
          </label>
          <label>Y
            <input type="number" step={0.1} value={sys.anchor.offsetY}
              onChange={(e) => dispatch({ type: "setAnchor", key, anchor: { offsetY: parseFloat(e.target.value) || 0 } })} />
          </label>
        </div>
        {placed && (
          <div className="hint small">
            On screen: {Math.round(placed.rect.left)}, {Math.round(placed.rect.bottom)} · {Math.round(placed.rect.width)} × {Math.round(placed.rect.height)}
            {placed.mode !== "anchor" && <> · placed by the game's {placed.mode === "bottomStack" ? "action bar stack" : placed.mode === "rightStack" ? "right bar column" : "frame manager"}</>}
          </div>
        )}
        {!sys.isInDefaultPosition && (
          <button className="wide" onClick={() => dispatch({ type: "resetPosition", key })}>Reset to default position</button>
        )}
      </section>

      {settings.length > 0 && (
        <section className="group">
          <h3>Settings</h3>
          {settings.map((s) => (
            <SettingControl key={s.id} system={sys.system} schema={s} raw={sys.settings.find((p) => p.id === s.id)?.value}
              onChange={(raw) => dispatch({ type: "setSetting", key, settingId: s.id, raw })} />
          ))}
        </section>
      )}
    </aside>
  );
}

function SettingControl({ system, schema, raw, onChange }: { system: number; schema: SettingSchema; raw: number | undefined; onChange: (raw: number) => void }) {
  const label = schema.label ?? schema.name;
  if (schema.type === "checkbox") {
    return (
      <label className="check">
        <input type="checkbox" checked={raw === 1} onChange={(e) => onChange(e.target.checked ? 1 : 0)} />
        {label}
      </label>
    );
  }
  if (schema.type === "dropdown" && schema.options) {
    return (
      <label className="setting">
        <span>{label}</span>
        <select value={raw ?? schema.options[0]?.value ?? 0} onChange={(e) => onChange(Number(e.target.value))}>
          {schema.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    );
  }
  if (schema.type === "slider") {
    const min = schema.min ?? 0, max = schema.max ?? 100, step = schema.convert === "scaled" ? schema.step ?? 1 : 1;
    const display = raw === undefined ? min : displayNumber(system, schema.id, raw);
    return (
      <label className="setting slider">
        <span>{label}<b>{display}{schema.percent ? "%" : ""}</b></span>
        <input type="range" min={min} max={max} step={step} value={display}
          onChange={(e) => onChange(rawFromDisplay(system, schema.id, Number(e.target.value)))} />
      </label>
    );
  }
  return null;
}
