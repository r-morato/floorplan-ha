import { useMemo, useRef, useState } from 'react';
import type { DisplayType, HassEntity, PlanConfig, PlanItem, PlanView } from '../types';
import { ICONS, friendlyName, iconPath } from '../icons';
import { deleteImage, mediaUrl, uid, uploadImage } from '../api';
import { ActionEditor } from './ActionEditor';
import { Icon } from './Icon';

type Tab = 'entities' | 'item' | 'views';

interface Props {
  config: PlanConfig;
  entities: Record<string, HassEntity>;
  activeViewId?: string;
  selected?: PlanItem;
  tab: Tab;
  setTab: (t: Tab) => void;
  onConfig: (c: PlanConfig) => void;
  onActiveView: (id: string) => void;
  onSelect: (id?: string) => void;
  onAddEntity: (entityId: string) => void;
  onUpdateItem: (patch: Partial<PlanItem>) => void;
  onDeleteItem: () => void;
  onError: (msg: string) => void;
}

export function Editor(p: Props) {
  return (
    <aside className="sidebar">
      <nav className="tabs">
        {(['entities', 'item', 'views'] as Tab[]).map((t) => (
          <button key={t} className={p.tab === t ? 'on' : ''} onClick={() => p.setTab(t)}>
            {t === 'entities' ? 'Entities' : t === 'item' ? 'Selected' : 'Views'}
          </button>
        ))}
      </nav>
      <div className="sidebar-body">
        {p.tab === 'entities' && <EntityBrowser {...p} />}
        {p.tab === 'item' && <ItemInspector {...p} />}
        {p.tab === 'views' && <ViewManager {...p} />}
      </div>
    </aside>
  );
}

// --- Entity browser ---------------------------------------------------------
function EntityBrowser({ entities, config, activeViewId, onAddEntity }: Props) {
  const [q, setQ] = useState('');
  const [dom, setDom] = useState('all');
  const placed = useMemo(() => {
    const m = new Map<string, number>();
    config.views.forEach((v) => v.items.forEach((i) => m.set(i.entity_id, (m.get(i.entity_id) ?? 0) + 1)));
    return m;
  }, [config]);
  const all = useMemo(() => Object.values(entities).sort((a, b) => a.entity_id.localeCompare(b.entity_id)), [entities]);
  const domains = useMemo(() => ['all', ...Array.from(new Set(all.map((e) => e.entity_id.split('.')[0]))).sort()], [all]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((e) => dom === 'all' || e.entity_id.startsWith(dom + '.'))
      .filter((e) => !needle || e.entity_id.toLowerCase().includes(needle) || friendlyName(e, '').toLowerCase().includes(needle))
      .slice(0, 300);
  }, [all, q, dom]);
  const view = config.views.find((v) => v.id === activeViewId);

  return (
    <>
      <p className="hint">
        {view ? <>Click an entity to add it to <b>{view.name}</b>, then drag it into place.</> : 'Add a view first (Views tab).'}
      </p>
      <input className="search" placeholder="Search entities…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <select value={dom} onChange={(e) => setDom(e.target.value)}>
        {domains.map((d) => <option key={d} value={d}>{d === 'all' ? 'All domains' : d}</option>)}
      </select>
      <ul className="entity-list">
        {list.map((e) => (
          <li key={e.entity_id}>
            <button disabled={!view} onClick={() => onAddEntity(e.entity_id)}>
              <span className="e-icon"><Icon path={iconPath(undefined, e, e.entity_id)} size={20} /></span>
              <span className="e-text">
                <span>{friendlyName(e, e.entity_id)}</span>
                <small>{e.entity_id}</small>
              </span>
              <span className="e-state">{e.state}</span>
              {placed.has(e.entity_id) && <span className="chip">placed{placed.get(e.entity_id)! > 1 ? ` ×${placed.get(e.entity_id)}` : ''}</span>}
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="muted">No entities match.</li>}
      </ul>
    </>
  );
}

// --- Item inspector -----------------------------------------------------------
const DISPLAYS: { id: DisplayType; label: string; hint: string }[] = [
  { id: 'icon', label: 'Icon', hint: 'State-coloured icon' },
  { id: 'glow', label: 'Glow', hint: 'Glowing disc when on (lights)' },
  { id: 'text', label: 'Text', hint: 'Value only, e.g. 18°C' },
  { id: 'badge', label: 'Badge', hint: 'Pill with icon and value' },
];

function ItemInspector({ selected, entities, onUpdateItem, onDeleteItem, setTab }: Props) {
  if (!selected) return <p className="hint">Click an item on the plan to edit it, or add one from the Entities tab.</p>;
  const e = entities[selected.entity_id];
  return (
    <div className="form">
      <div className="item-head">
        <b>{friendlyName(e, selected.entity_id)}</b>
        <code>{selected.entity_id}</code>
        {!e && <small className="error">Entity not found in Home Assistant</small>}
      </div>

      <fieldset>
        <legend>Display</legend>
        <div className="seg">
          {DISPLAYS.map((d) => (
            <button key={d.id} title={d.hint} className={selected.display === d.id ? 'on' : ''} onClick={() => onUpdateItem({ display: d.id })}>
              {d.label}
            </button>
          ))}
        </div>
        {selected.display !== 'text' && (
          <div className="icon-grid">
            <button className={!selected.icon ? 'on' : ''} title="Automatic" onClick={() => onUpdateItem({ icon: '' })}>auto</button>
            {Object.entries(ICONS).map(([k, path]) => (
              <button key={k} title={k} className={selected.icon === k ? 'on' : ''} onClick={() => onUpdateItem({ icon: k })}>
                <Icon path={path} size={20} />
              </button>
            ))}
          </div>
        )}
        <label className="row">Size
          <input type="range" min={0.5} max={3} step={0.1} value={selected.size} onChange={(ev) => onUpdateItem({ size: Number(ev.target.value) })} />
          <span>{selected.size.toFixed(1)}×</span>
        </label>
        <label className="row">Active colour
          <input type="color" value={toHex(selected.color)} onChange={(ev) => onUpdateItem({ color: ev.target.value })} />
          {selected.color && <button className="link" onClick={() => onUpdateItem({ color: '' })}>auto</button>}
        </label>
        <label className="row">
          <input type="checkbox" checked={!!selected.showName} onChange={(ev) => onUpdateItem({ showName: ev.target.checked })} />
          Show name
        </label>
        <input placeholder="Custom name (optional)" value={selected.name ?? ''} onChange={(ev) => onUpdateItem({ name: ev.target.value })} />
      </fieldset>

      <ActionEditor label="Tap action" value={selected.tap} onChange={(tap) => onUpdateItem({ tap })} />
      <ActionEditor label="Hold action" value={selected.hold} onChange={(hold) => onUpdateItem({ hold })} />

      <div className="row">
        <button className="danger" onClick={onDeleteItem}>Remove from plan</button>
        <button onClick={() => setTab('entities')}>Add another</button>
      </div>
    </div>
  );
}

function toHex(c?: string) {
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c : '#ffb347';
}

// --- Views ------------------------------------------------------------------------
function ViewManager({ config, activeViewId, onConfig, onActiveView, onError }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ kind: PlanView['kind']; replaceId?: string }>({ kind: 'floor' });

  const choose = (kind: PlanView['kind'], replaceId?: string) => {
    pending.current = { kind, replaceId };
    fileRef.current?.click();
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const image = await uploadImage(file);
      const { kind, replaceId } = pending.current;
      if (replaceId) {
        const old = config.views.find((v) => v.id === replaceId)?.image;
        onConfig({ ...config, views: config.views.map((v) => (v.id === replaceId ? { ...v, image } : v)) });
        if (old) deleteImage(old);
      } else {
        const floors = config.views.filter((v) => v.kind === 'floor').length;
        const view: PlanView = {
          id: uid(),
          name: kind === 'hero' ? 'Hero' : `Floor ${floors + 1}`,
          kind,
          image,
          showTitle: kind !== 'hero',
          items: [],
        };
        onConfig({ ...config, views: kind === 'hero' ? [view, ...config.views] : [...config.views, view] });
        onActiveView(view.id);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const patch = (id: string, p: Partial<PlanView>) => onConfig({ ...config, views: config.views.map((v) => (v.id === id ? { ...v, ...p } : v)) });
  const move = (i: number, d: number) => {
    const views = [...config.views];
    [views[i], views[i + d]] = [views[i + d], views[i]];
    onConfig({ ...config, views });
  };
  const remove = (v: PlanView) => {
    if (!confirm(`Delete "${v.name}" and its ${v.items.length} placed item(s)?`)) return;
    onConfig({ ...config, views: config.views.filter((x) => x.id !== v.id) });
    if (v.image) deleteImage(v.image);
  };

  return (
    <div className="form">
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <label>Panel title
        <input value={config.title} onChange={(e) => onConfig({ ...config, title: e.target.value })} />
      </label>
      <div className="row">
        <button disabled={busy} onClick={() => choose('floor')}>＋ Add floor image</button>
        <button disabled={busy} onClick={() => choose('hero')}>＋ Add hero image</button>
      </div>
      {busy && <p className="hint">Uploading…</p>}
      <ul className="view-list">
        {config.views.map((v, i) => (
          <li key={v.id} className={v.id === activeViewId ? 'on' : ''} onClick={() => onActiveView(v.id)}>
            {v.image ? <img src={mediaUrl(v.image)} alt="" /> : <div className="thumb-empty" />}
            <div className="view-fields">
              <input value={v.name} onChange={(e) => patch(v.id, { name: e.target.value })} />
              <label className="row small">
                <input type="checkbox" checked={v.showTitle} onChange={(e) => patch(v.id, { showTitle: e.target.checked })} /> Show title
              </label>
              <div className="row small">
                <button disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button disabled={i === config.views.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button onClick={() => choose(v.kind, v.id)}>Replace image</button>
                <button className="danger" onClick={() => remove(v)}>Delete</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
