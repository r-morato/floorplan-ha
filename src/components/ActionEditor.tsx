import type { ActionConfig, ActionKind } from '../types';

const LABELS: Record<ActionKind, string> = {
  none: 'None',
  toggle: 'Toggle',
  'more-info': 'More info',
  'call-service': 'Call service',
  navigate: 'Navigate',
};

export function ActionEditor({ label, value, onChange }: { label: string; value: ActionConfig; onChange: (a: ActionConfig) => void }) {
  const set = (patch: Partial<ActionConfig>) => onChange({ ...value, ...patch });
  return (
    <fieldset>
      <legend>{label}</legend>
      <select value={value.action} onChange={(e) => set({ action: e.target.value as ActionKind })}>
        {(Object.keys(LABELS) as ActionKind[]).map((k) => (
          <option key={k} value={k}>{LABELS[k]}</option>
        ))}
      </select>
      {value.action === 'call-service' && (
        <>
          <input placeholder="domain.service, e.g. light.turn_on" value={value.service ?? ''} onChange={(e) => set({ service: e.target.value })} />
          <textarea
            rows={3}
            placeholder={'Service data (JSON), e.g. {"brightness_pct": 40}\nThe entity is added automatically.'}
            value={value.data ?? ''}
            onChange={(e) => set({ data: e.target.value })}
            spellCheck={false}
          />
          {value.data?.trim() && !validJson(value.data) && <small className="error">Invalid JSON</small>}
        </>
      )}
      {value.action === 'navigate' && (
        <input placeholder="/lovelace/cameras" value={value.path ?? ''} onChange={(e) => set({ path: e.target.value })} />
      )}
    </fieldset>
  );
}

function validJson(s: string) {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}
