import { Presets } from "../../editmode/schema.generated";
import { SCREEN_PRESETS, defaultUiScale, type EditorState, type Action } from "../store";
import type { Screen } from "../geometry";

interface Props {
  state: EditorState;
  screen: Screen;
  dispatch: (a: Action) => void;
  onImport: () => void;
  onExport: () => void;
}

export function Toolbar({ state, screen, dispatch, onImport, onExport }: Props) {
  const preset = SCREEN_PRESETS.find((s) => s.id === state.screenId) ?? SCREEN_PRESETS[0];
  const autoScale = defaultUiScale(preset.pixelHeight);
  const scale = state.uiScale ?? autoScale;
  return (
    <header className="toolbar">
      <div className="brand">
        <span className="logo">UI Studio</span>
        <span className="sub">WoW Forever Edit Mode</span>
      </div>

      <label className="tb-field">
        <span>Layout</span>
        <input className="name-input" value={state.name} onChange={(e) => dispatch({ type: "setName", name: e.target.value })} placeholder="Layout name" />
      </label>

      <label className="tb-field">
        <span>Start from</span>
        <select
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            if (state.dirty && !window.confirm(`Replace the current layout with the ${e.target.value} preset?`)) return;
            dispatch({ type: "loadPreset", preset: e.target.value });
          }}
        >
          <option value="">Preset…</option>
          {Object.keys(Presets).map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>

      <label className="tb-field">
        <span>Screen</span>
        <select value={state.screenId} onChange={(e) => dispatch({ type: "setScreen", screenId: e.target.value })}>
          {SCREEN_PRESETS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>

      <label className="tb-field">
        <span>UI scale <b>{scale.toFixed(2)}</b>{state.uiScale === null && <em> auto</em>}</span>
        <span className="scale-row">
          <input type="range" min={0.5} max={1} step={0.01} value={scale} onChange={(e) => dispatch({ type: "setUiScale", uiScale: Number(e.target.value) })} />
          {state.uiScale !== null && <button className="link" onClick={() => dispatch({ type: "setUiScale", uiScale: null })}>auto</button>}
        </span>
      </label>

      <span className="tb-info" title="UIParent size in UI units at this resolution and scale">{Math.round(screen.width)} × {Math.round(screen.height)} units</span>

      <span className="spacer" />

      <button onClick={() => dispatch({ type: "toggleGrid" })} className={state.showGrid ? "on" : ""} title="Show grid">Grid</button>
      <button onClick={() => dispatch({ type: "toggleSnap" })} className={state.snap ? "on" : ""} title="Snap dragged frames to the grid (hold Alt to bypass)">Snap</button>
      <select value={state.gridSize} onChange={(e) => dispatch({ type: "setGridSize", size: Number(e.target.value) })} title="Grid size">
        {[5, 10, 20, 25, 50].map((g) => <option key={g} value={g}>{g}</option>)}
      </select>
      <button onClick={() => dispatch({ type: "undo" })} disabled={state.past.length === 0} title="Undo (Ctrl+Z)">Undo</button>
      <button onClick={() => dispatch({ type: "redo" })} disabled={state.future.length === 0} title="Redo (Ctrl+Shift+Z)">Redo</button>
      <button onClick={onImport}>Import</button>
      <button className="primary" onClick={onExport}>Export</button>
    </header>
  );
}
