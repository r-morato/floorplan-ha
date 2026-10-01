import { useEffect, useRef, useState } from 'react';
import type { PlanItem, PlanView } from '../types';
import type { HassEntity } from '../types';
import { mediaUrl } from '../api';
import { entityColor, formatState, friendlyName, iconPath, isActive } from '../icons';
import { Icon } from './Icon';

interface Props {
  view: PlanView;
  entities: Record<string, HassEntity>;
  editing: boolean;
  active: boolean;
  selectedId?: string;
  onActivateView: () => void;
  onSelect: (id?: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onAction: (item: PlanItem, kind: 'tap' | 'hold') => void;
}

const HOLD_MS = 500;
const clamp = (v: number) => Math.min(100, Math.max(0, v));

export function Plan({ view, entities, editing, active, selectedId, onActivateView, onSelect, onMove, onAction }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [unit, setUnit] = useState(1);

  // Everything inside the plan scales with its width (1000px wide = 1 unit).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setUnit(Math.max(el.clientWidth / 1000, 0.6)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <section className={`card ${view.kind} ${editing && active ? 'active' : ''}`} onPointerDown={() => editing && onActivateView()}>
      {view.showTitle && <h2 className="card-title">{view.name}</h2>}
      <div
        ref={ref}
        className="plan"
        style={{ ['--u' as string]: `${unit}px` }}
        onPointerDown={(e) => e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'IMG' ? onSelect(undefined) : undefined}
      >
        {view.image ? (
          <img src={mediaUrl(view.image)} alt={view.name} draggable={false} />
        ) : (
          <div className="plan-empty">No image yet. Open the Views tab to upload one.</div>
        )}
        {view.items.map((item) => (
          <Marker
            key={item.id}
            item={item}
            entity={entities[item.entity_id]}
            editing={editing}
            selected={item.id === selectedId}
            planRef={ref}
            onSelect={() => onSelect(item.id)}
            onMove={(x, y) => onMove(item.id, x, y)}
            onAction={(kind) => onAction(item, kind)}
          />
        ))}
      </div>
    </section>
  );
}

interface MarkerProps {
  item: PlanItem;
  entity?: HassEntity;
  editing: boolean;
  selected: boolean;
  planRef: React.RefObject<HTMLDivElement>;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onAction: (kind: 'tap' | 'hold') => void;
}

function Marker({ item, entity, editing, selected, planRef, onSelect, onMove, onAction }: MarkerProps) {
  const hold = useRef<{ timer?: number; fired: boolean }>({ fired: false });
  const drag = useRef<{ moved: boolean } | null>(null);

  const on = isActive(entity);
  const accent = item.color || entityColor(entity) || (item.entity_id.startsWith('light.') ? '#ffb347' : '#4fc3f7');
  const missing = !entity;
  const path = iconPath(item.icon, entity, item.entity_id);
  const label = item.name || friendlyName(entity, item.entity_id);
  const value = formatState(entity);

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (editing) {
      onSelect();
      drag.current = { moved: false };
      return;
    }
    hold.current.fired = false;
    hold.current.timer = window.setTimeout(() => {
      hold.current.fired = true;
      navigator.vibrate?.(15);
      onAction('hold');
    }, HOLD_MS);
  };
  const moveEv = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editing || !drag.current || !(e.buttons & 1)) return;
    const rect = planRef.current!.getBoundingClientRect();
    drag.current.moved = true;
    onMove(clamp(((e.clientX - rect.left) / rect.width) * 100), clamp(((e.clientY - rect.top) / rect.height) * 100));
  };
  const up = () => {
    if (editing) {
      drag.current = null;
      return;
    }
    clearTimeout(hold.current.timer);
    if (!hold.current.fired) onAction('tap');
  };
  const cancel = () => {
    clearTimeout(hold.current.timer);
    hold.current.fired = true; // swallow the following up event
  };

  return (
    <div
      className={`marker ${item.display} ${on ? 'on' : 'off'} ${selected ? 'selected' : ''} ${editing ? 'editing' : ''} ${missing ? 'missing' : ''}`}
      style={{
        left: `${item.x}%`,
        top: `${item.y}%`,
        ['--accent' as string]: accent,
        ['--s' as string]: item.size,
      }}
      title={`${label} (${item.entity_id})`}
      onPointerDown={down}
      onPointerMove={moveEv}
      onPointerUp={up}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      {item.display === 'text' ? (
        <span className="value">{value}</span>
      ) : item.display === 'badge' ? (
        <>
          <Icon path={path} size="1.4em" />
          <span className="value">{item.showName ? label : value}</span>
        </>
      ) : (
        <span className="disc">
          <Icon path={path} size="100%" />
        </span>
      )}
      {item.showName && item.display !== 'badge' && <span className="name">{label}</span>}
    </div>
  );
}
