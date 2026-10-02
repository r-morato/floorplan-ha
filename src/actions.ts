import { hass } from './ha';
import type { ActionConfig, PlanItem } from './types';
import { canToggle } from './icons';

export interface ActionContext {
  openMoreInfo: (entityId: string) => void;
  toast: (msg: string) => void;
}

export async function runAction(action: ActionConfig, item: PlanItem, ctx: ActionContext) {
  try {
    switch (action.action) {
      case 'none':
        return;
      case 'more-info':
        return ctx.openMoreInfo(item.entity_id);
      case 'toggle': {
        if (!canToggle(item.entity_id)) return ctx.openMoreInfo(item.entity_id); // read-only entity: just show info
        const dom = item.entity_id.split('.')[0];
        // script/scene/button have no on/off: "toggle" means run it.
        if (dom === 'script' || dom === 'scene') return hass.callService(dom, 'turn_on', { entity_id: item.entity_id });
        if (dom === 'button' || dom === 'input_button') return hass.callService(dom, 'press', { entity_id: item.entity_id });
        return hass.callService('homeassistant', 'toggle', { entity_id: item.entity_id });
      }
      case 'call-service': {
        const [d, s] = (action.service || '').split('.');
        if (!d || !s) return ctx.toast('Action has no service set');
        const data = action.data?.trim() ? JSON.parse(action.data) : {};
        if (!data.entity_id && !data.device_id && !data.area_id) data.entity_id = item.entity_id;
        return hass.callService(d, s, data);
      }
      case 'navigate':
        return navigate(action.path || '/');
    }
  } catch (e) {
    ctx.toast(e instanceof Error ? e.message : String(e));
  }
}

/** Navigate the Home Assistant frontend that hosts us in an iframe (same origin under ingress). */
function navigate(path: string) {
  try {
    if (window.parent !== window) {
      window.parent.history.pushState(null, '', path);
      window.parent.dispatchEvent(new CustomEvent('location-changed'));
      return;
    }
  } catch { /* cross-origin parent: fall through */ }
  window.open(path, '_top');
}
