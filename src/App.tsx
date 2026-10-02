import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlanConfig, PlanItem } from './types';
import { loadConfig, saveConfig, uid } from './api';
import { hass, useHass } from './ha';
import { runAction } from './actions';
import { TOGGLEABLE } from './icons';
import { Plan } from './components/Plan';
import { Editor } from './components/Editor';
import { MoreInfo } from './components/MoreInfo';

type Tab = 'entities' | 'item' | 'views';
type Save = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export default function App() {
  const { entities, status, reason } = useHass();
  const [config, setConfig] = useState<PlanConfig>();
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>('entities');
  const [activeViewId, setActiveViewId] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const [moreInfo, setMoreInfo] = useState<string>();
  const [toastMsg, setToastMsg] = useState<string>();
  const [save, setSave] = useState<Save>('idle');
  const loaded = useRef(false);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    setTimeout(() => setToastMsg(undefined), 4000);
  }, []);

  useEffect(() => {
    hass.connect();
    loadConfig()
      .then((c) => {
        setConfig(c);
        setActiveViewId(c.views[0]?.id);
        if (c.views.length === 0) setEditing(true); // first run: go straight to setup
        if (c.views.length === 0) setTab('views');
        loaded.current = true;
      })
      .catch((e) => toast(String(e.message ?? e)));
  }, [toast]);

  // Debounced autosave.
  const timer = useRef<number>();
  const update = useCallback((next: PlanConfig) => {
    setConfig(next);
    setSave('dirty');
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setSave('saving');
      saveConfig(next).then(() => setSave('saved'), () => setSave('error'));
    }, 600);
  }, []);

  useEffect(() => {
    document.title = config?.title || 'Floor plan';
  }, [config?.title]);

  const selected = useMemo(() => config?.views.flatMap((v) => v.items).find((i) => i.id === selectedId), [config, selectedId]);

  const mutateItem = (id: string, patch: Partial<PlanItem>) =>
    config && update({ ...config, views: config.views.map((v) => ({ ...v, items: v.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })) });

  const addEntity = (entityId: string) => {
    if (!config) return;
    const view = config.views.find((v) => v.id === activeViewId);
    if (!view) return toast('Select a view first');
    const dom = entityId.split('.')[0];
    const isSensor = dom === 'sensor' && !!entities[entityId]?.attributes.unit_of_measurement;
    const item: PlanItem = {
      id: uid(),
      entity_id: entityId,
      x: 50, y: 50,
      display: isSensor ? 'text' : dom === 'light' ? 'glow' : 'icon',
      size: 1,
      tap: { action: TOGGLEABLE.has(dom) || ['script', 'scene', 'button', 'input_button'].includes(dom) ? 'toggle' : 'more-info' },
      hold: { action: 'more-info' },
    };
    update({ ...config, views: config.views.map((v) => (v.id === view.id ? { ...v, items: [...v.items, item] } : v)) });
    setSelectedId(item.id);
    setTab('item');
  };

  const deleteItem = () => {
    if (!config || !selectedId) return;
    update({ ...config, views: config.views.map((v) => ({ ...v, items: v.items.filter((i) => i.id !== selectedId) })) });
    setSelectedId(undefined);
    setTab('entities');
  };

  // Keyboard: arrows nudge the selected item, Delete removes it.
  useEffect(() => {
    if (!editing || !selected) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      const step = e.shiftKey ? 2 : 0.25;
      const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (d[e.key]) {
        e.preventDefault();
        mutateItem(selected.id, { x: Math.min(100, Math.max(0, selected.x + d[e.key][0])), y: Math.min(100, Math.max(0, selected.y + d[e.key][1])) });
      } else if (e.key === 'Delete' || e.key === 'Backspace') deleteItem();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!config) return <div className="boot">{toastMsg ?? 'Loading…'}</div>;

  const ctx = { openMoreInfo: setMoreInfo, toast };

  return (
    <div className={`app ${editing ? 'editing' : ''}`}>
      {status === 'demo' && (
        <div className="banner">
          Demo mode: showing sample entities. {reason}
        </div>
      )}
      <header className="topbar">
        <h1>{config.title}</h1>
        <div className="top-actions">
          {editing && <span className={`save ${save}`}>{{ idle: '', dirty: 'Unsaved…', saving: 'Saving…', saved: 'Saved', error: 'Save failed!' }[save]}</span>}
          <button className={`pill ${editing ? 'on' : ''}`} onClick={() => { setEditing(!editing); setSelectedId(undefined); }}>
            {editing ? 'Done' : 'Edit'}
          </button>
        </div>
      </header>

      <main className="stack">
        {config.views.length === 0 && (
          <div className="welcome">
            <h2>Welcome</h2>
            <p>Upload a picture of each floor (isometric renders work great), then add entities and drag them into place.</p>
            {!editing && <button className="pill on" onClick={() => setEditing(true)}>Start setup</button>}
          </div>
        )}
        {config.views.map((v) => (
          <Plan
            key={v.id}
            view={v}
            entities={entities}
            editing={editing}
            active={v.id === activeViewId}
            selectedId={selectedId}
            onActivateView={() => setActiveViewId(v.id)}
            onSelect={(id) => {
              setSelectedId(id);
              if (id) setTab('item');
            }}
            onMove={(id, x, y) => mutateItem(id, { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 })}
            onAction={(item, kind) => runAction(kind === 'tap' ? item.tap : item.hold, item, ctx)}
          />
        ))}
      </main>

      {editing && (
        <Editor
          config={config}
          entities={entities}
          activeViewId={activeViewId}
          selected={selected}
          tab={tab}
          setTab={setTab}
          onConfig={update}
          onActiveView={setActiveViewId}
          onSelect={setSelectedId}
          onAddEntity={addEntity}
          onUpdateItem={(p) => selected && mutateItem(selected.id, p)}
          onDeleteItem={deleteItem}
          onError={toast}
          onReload={() => loadConfig().then((c) => { setConfig(c); setActiveViewId(c.views[0]?.id); setSelectedId(undefined); setSave('idle'); toast('Backup imported'); }, (e) => toast(String(e.message ?? e)))}
        />
      )}
      {moreInfo && <MoreInfo entityId={moreInfo} entity={entities[moreInfo]} onClose={() => setMoreInfo(undefined)} />}
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  );
}
