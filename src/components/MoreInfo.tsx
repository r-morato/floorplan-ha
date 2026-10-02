import { useRef } from 'react';
import { hass } from '../ha';
import type { HassEntity } from '../types';
import { formatState, friendlyName } from '../icons';

/** Lights that can dim: any colour mode beyond plain on/off, or a brightness attribute. */
const dimmable = (e: HassEntity) => {
  const modes = e.attributes.supported_color_modes as string[] | undefined;
  return modes ? modes.some((m) => m !== 'onoff') : e.attributes.brightness != null;
};

const HIDDEN_ATTRS = new Set(['friendly_name', 'icon', 'entity_picture', 'supported_features', 'supported_color_modes', 'attribution']);

export function MoreInfo({ entityId, entity, onClose }: { entityId: string; entity?: HassEntity; onClose: () => void }) {
  const dom = entityId.split('.')[0];
  const call = (service: string, data: Record<string, any> = {}, d = dom) => hass.callService(d, service, { entity_id: entityId, ...data });
  const bright = entity?.attributes.brightness as number | undefined;
  const timer = useRef<number>();
  // Debounced so dragging the slider does not flood Home Assistant.
  const setBrightness = (pct: number) => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => call('turn_on', { brightness_pct: pct }), 150);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h3>{friendlyName(entity, entityId)}</h3>
            <code>{entityId}</code>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        {!entity ? (
          <p className="muted">This entity does not exist in Home Assistant.</p>
        ) : (
          <>
            <div className="big-state">{formatState(entity)}</div>
            <div className="controls">
              {['light', 'switch', 'fan', 'input_boolean', 'automation'].includes(dom) && (
                <>
                  <button onClick={() => call('turn_on')}>Turn on</button>
                  <button onClick={() => call('turn_off')}>Turn off</button>
                </>
              )}
              {dom === 'cover' && (
                <>
                  <button onClick={() => call('open_cover')}>Open</button>
                  <button onClick={() => call('stop_cover')}>Stop</button>
                  <button onClick={() => call('close_cover')}>Close</button>
                </>
              )}
              {dom === 'lock' && (
                <>
                  <button onClick={() => call('lock')}>Lock</button>
                  <button onClick={() => call('unlock')}>Unlock</button>
                </>
              )}
              {['script', 'scene'].includes(dom) && <button onClick={() => call('turn_on')}>Run</button>}
              {['button', 'input_button'].includes(dom) && <button onClick={() => call('press')}>Press</button>}
              {dom === 'media_player' && (
                <>
                  <button onClick={() => call('media_play_pause')}>Play / pause</button>
                  <button onClick={() => call('turn_off')}>Off</button>
                </>
              )}
            </div>
            {dom === 'light' && dimmable(entity) && (
              <label className="slider">
                Brightness {entity.state === 'on' && bright != null ? `${Math.round((bright / 255) * 100)}%` : '(off)'}
                <input
                  key={entity.state === 'on' ? bright : 'off'}
                  type="range"
                  min={1}
                  max={100}
                  defaultValue={entity.state === 'on' && bright != null ? Math.max(1, Math.round((bright / 255) * 100)) : 1}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                />
              </label>
            )}
            <table className="attrs">
              <tbody>
                <tr><th>state</th><td>{entity.state}</td></tr>
                {Object.entries(entity.attributes)
                  .filter(([k]) => !HIDDEN_ATTRS.has(k))
                  .map(([k, v]) => (
                    <tr key={k}><th>{k}</th><td>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td></tr>
                  ))}
                <tr><th>last changed</th><td>{new Date(entity.last_changed).toLocaleString()}</td></tr>
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
