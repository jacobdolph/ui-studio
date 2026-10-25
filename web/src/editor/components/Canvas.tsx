import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Placed, Rect, Screen } from "../geometry";
import type { Action } from "../store";

interface Props {
  screen: Screen;
  rects: Map<string, Placed>;
  visible: Record<string, boolean>;
  selected: string | null;
  showGrid: boolean;
  gridSize: number;
  snap: boolean;
  dispatch: (a: Action) => void;
}

interface DragState {
  key: string;
  startX: number;
  startY: number;
  origin: Rect;
  current: Rect;
  moved: boolean;
}

const CATEGORY_CLASS: Record<string, string> = {
  "Action Bars": "c-bars",
  "Unit Frames": "c-units",
  HUD: "c-hud",
  "Auras & Cooldowns": "c-auras",
  "Chat & Info": "c-chat",
  Encounter: "c-encounter",
  Misc: "c-misc",
};

export function Canvas({ screen, rects, visible, selected, showGrid, gridSize, snap, dispatch }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.5);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  // Fit the UIParent into the available space.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const pad = 24;
      const z = Math.min((el.clientWidth - pad) / screen.width, (el.clientHeight - pad) / screen.height);
      setZoom(Math.max(0.05, z));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [screen.width, screen.height]);

  const toScreenRect = (r: Rect) => ({
    left: r.left * zoom,
    top: (screen.height - r.bottom - r.height) * zoom,
    width: r.width * zoom,
    height: r.height * zoom,
  });

  const onPointerDown = (e: ReactPointerEvent, p: Placed) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dispatch({ type: "select", key: p.key });
    setDrag({ key: p.key, startX: e.clientX, startY: e.clientY, origin: p.rect, current: p.rect, moved: false });
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / zoom;
    const dy = -(e.clientY - drag.startY) / zoom;
    let left = drag.origin.left + dx;
    let bottom = drag.origin.bottom + dy;
    if (snap && !e.altKey) {
      left = Math.round(left / gridSize) * gridSize;
      bottom = Math.round(bottom / gridSize) * gridSize;
    }
    // Keep the frame on screen (the game clamps too).
    left = Math.min(Math.max(left, -drag.origin.width / 2), screen.width - drag.origin.width / 2);
    bottom = Math.min(Math.max(bottom, -drag.origin.height / 2), screen.height - drag.origin.height / 2);
    setDrag({ ...drag, current: { ...drag.origin, left, bottom }, moved: drag.moved || Math.abs(dx) + Math.abs(dy) > 0.5 });
  };

  const onPointerUp = () => {
    if (!drag) return;
    if (drag.moved) dispatch({ type: "move", key: drag.key, rect: drag.current, screen });
    setDrag(null);
  };

  const onBackgroundClick = useCallback(() => dispatch({ type: "select", key: null }), [dispatch]);

  // Keyboard nudging for the selected frame.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      const step = e.shiftKey ? 10 : 1;
      const map: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      const d = map[e.key];
      if (!d) return;
      e.preventDefault();
      dispatch({ type: "nudge", key: selected, dx: d[0], dy: d[1], screen });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, dispatch, screen]);

  const items = [...rects.values()].filter((p) => visible[p.key] ?? p.def.defaultVisible);
  // Draw larger frames first so small ones stay clickable on top.
  items.sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height);

  const selectedPlaced = selected ? rects.get(selected) : undefined;
  const liveRect = drag ? drag.current : selectedPlaced?.rect;

  return (
    <div className="canvas-wrap" ref={wrapRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <div
        className={`screen ${showGrid ? "grid" : ""}`}
        style={{
          width: screen.width * zoom,
          height: screen.height * zoom,
          backgroundSize: showGrid ? `${gridSize * zoom}px ${gridSize * zoom}px` : undefined,
        }}
        onPointerDown={onBackgroundClick}
      >
        <div className="thirds" aria-hidden />
        {items.map((p) => {
          const r = drag && drag.key === p.key ? drag.current : p.rect;
          const s = toScreenRect(r);
          const isSel = selected === p.key;
          return (
            <div
              key={p.key}
              className={`frame ${CATEGORY_CLASS[p.def.category] ?? ""} ${isSel ? "selected" : ""} ${hover === p.key ? "hover" : ""} ${p.sys.isInDefaultPosition ? "default" : "moved"} ${r.height > r.width * 2 ? "vertical" : ""}`}
              style={{ left: s.left, top: s.top, width: Math.max(s.width, 6), height: Math.max(s.height, 6) }}
              title={`${p.def.label}\n${p.sys.anchor.point} → ${p.sys.anchor.relativeTo} ${p.sys.anchor.relativePoint} (${p.sys.anchor.offsetX}, ${p.sys.anchor.offsetY})`}
              onPointerDown={(e) => onPointerDown(e, p)}
              onPointerEnter={() => setHover(p.key)}
              onPointerLeave={() => setHover((h) => (h === p.key ? null : h))}
            >
              <FrameArt placed={p} zoom={zoom} />
              <span className="frame-label" style={{ fontSize: Math.max(9, Math.min(13, 11 * zoom * 2)) }}>{p.def.short}</span>
            </div>
          );
        })}
        {liveRect && (
          <div className="coords" style={{ left: 8, bottom: 8 }}>
            {Math.round(liveRect.left)}, {Math.round(liveRect.bottom)} · {Math.round(liveRect.width)} × {Math.round(liveRect.height)}
          </div>
        )}
      </div>
    </div>
  );
}

/** Lightweight in-frame sketch so the preview reads as a WoW HUD, not a wireframe. */
function FrameArt({ placed, zoom }: { placed: Placed; zoom: number }) {
  const { def, footprint } = placed;
  const w = placed.rect.width * zoom;
  const h = placed.rect.height * zoom;
  if (def.system === 0 || (def.system === 20 && def.systemIndex !== 4) || def.system === 6) {
    // Button grid: approximate cells from footprint.
    const cell = (def.system === 0 ? (def.systemIndex === 11 || def.systemIndex === 12 || def.systemIndex === 13 ? 30 : 45) : def.system === 6 ? 30 : def.systemIndex === 1 ? 50 : def.systemIndex === 2 ? 30 : 40) * footprint.scale * zoom;
    if (cell < 5) return null;
    const cols = footprint.grid?.cols ?? Math.max(1, Math.round(w / (cell + 2 * zoom)));
    const rows = footprint.grid?.rows ?? Math.max(1, Math.round(h / (cell + 2 * zoom)));
    if (cols * rows > 128 || w / cols < 4 || h / rows < 4) return null;
    return (
      <div className="cells" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols * rows }, (_, i) => <i key={i} />)}
      </div>
    );
  }
  if (def.system === 2) return <div className="minimap-art" />;
  if (def.system === 3 && (def.systemIndex === 1 || def.systemIndex === 2 || def.systemIndex === 3)) return <div className="unit-art"><i /><b /></div>;
  if (def.system === 1 || def.system === 15 || def.system === 29) return <div className="bar-art" />;
  if (def.system === 8) return <div className="chat-art"><i /><i /><i /></div>;
  return null;
}
