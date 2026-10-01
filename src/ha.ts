import { useSyncExternalStore } from 'react';
import type { HassEntity } from './types';

export type HassStatus = 'connecting' | 'connected' | 'demo';

interface Snapshot {
  entities: Record<string, HassEntity>;
  status: HassStatus;
  /** why we are in demo mode */
  reason?: string;
}

const now = () => new Date().toISOString();
const ent = (entity_id: string, state: string, attributes: Record<string, any> = {}): HassEntity => ({
  entity_id, state, attributes, last_changed: now(), last_updated: now(),
});

const DEMO: HassEntity[] = [
  ent('light.living_room', 'on', { friendly_name: 'Living room light', brightness: 200 }),
  ent('light.kitchen', 'off', { friendly_name: 'Kitchen light', brightness: 0 }),
  ent('light.bedroom_lamp', 'on', { friendly_name: 'Bedroom lamp', brightness: 120, rgb_color: [255, 190, 110] }),
  ent('sensor.living_room_temperature', '21.4', { friendly_name: 'Living room temperature', unit_of_measurement: '°C', device_class: 'temperature' }),
  ent('sensor.bedroom_temperature', '18.2', { friendly_name: 'Bedroom temperature', unit_of_measurement: '°C', device_class: 'temperature' }),
  ent('sensor.living_room_humidity', '48', { friendly_name: 'Living room humidity', unit_of_measurement: '%', device_class: 'humidity' }),
  ent('binary_sensor.hall_motion', 'off', { friendly_name: 'Hall motion', device_class: 'motion' }),
  ent('binary_sensor.front_door', 'off', { friendly_name: 'Front door', device_class: 'door' }),
  ent('cover.garage_door', 'closed', { friendly_name: 'Garage door', device_class: 'garage' }),
  ent('switch.tv_plug', 'on', { friendly_name: 'TV plug' }),
  ent('media_player.tv', 'playing', { friendly_name: 'Living room TV' }),
  ent('sensor.solar_power', '1250', { friendly_name: 'Solar power', unit_of_measurement: 'W', device_class: 'power' }),
  ent('sensor.car_battery', '40', { friendly_name: 'Car battery', unit_of_measurement: '%', device_class: 'battery' }),
  ent('climate.living_room', 'heat', { friendly_name: 'Living room thermostat', current_temperature: 21.4, temperature: 22 }),
  ent('lock.front_door', 'locked', { friendly_name: 'Front door lock' }),
  ent('script.good_night', 'off', { friendly_name: 'Good night' }),
];

class HassStore {
  private snap: Snapshot = { entities: {}, status: 'connecting' };
  private listeners = new Set<() => void>();
  private ws?: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private retry = 0;
  private flushQueued = false;
  private queue: Record<string, HassEntity> = {};

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = () => this.snap;

  private set(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  connect() {
    const url = new URL('api/ws', location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data));
    ws.onclose = () => {
      if (this.snap.status === 'demo') return;
      this.set({ status: 'connecting' });
      setTimeout(() => this.connect(), Math.min(15000, 1500 * ++this.retry));
    };
  }

  private onMessage(msg: any) {
    switch (msg.type) {
      case 'auth_ok':
        this.retry = 0;
        this.request({ type: 'get_states' }).then((states: HassEntity[]) => {
          const entities: Record<string, HassEntity> = {};
          for (const s of states) entities[s.entity_id] = s;
          this.set({ entities, status: 'connected', reason: undefined });
        });
        this.request({ type: 'subscribe_events', event_type: 'state_changed' });
        break;
      case 'auth_invalid':
        this.startDemo(msg.message);
        break;
      case 'event': {
        const d = msg.event?.data;
        if (!d) break;
        if (d.new_state) this.queue[d.entity_id] = d.new_state;
        else this.queue[d.entity_id] = undefined as any;
        this.scheduleFlush();
        break;
      }
      case 'result': {
        const p = this.pending.get(msg.id);
        if (!p) break;
        this.pending.delete(msg.id);
        msg.success ? p.resolve(msg.result) : p.reject(new Error(msg.error?.message || 'Request failed'));
        break;
      }
    }
  }

  private scheduleFlush() {
    if (this.flushQueued) return;
    this.flushQueued = true;
    requestAnimationFrame(() => {
      this.flushQueued = false;
      const entities = { ...this.snap.entities };
      for (const [id, s] of Object.entries(this.queue)) {
        if (s) entities[id] = s;
        else delete entities[id];
      }
      this.queue = {};
      this.set({ entities });
    });
  }

  private request(payload: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.ws?.send(JSON.stringify({ ...payload, id }));
    });
  }

  private startDemo(reason?: string) {
    const entities: Record<string, HassEntity> = {};
    for (const e of DEMO) entities[e.entity_id] = e;
    this.set({ entities, status: 'demo', reason });
    this.ws?.close();
  }

  async callService(domain: string, service: string, data: Record<string, any> = {}) {
    if (this.snap.status === 'demo') return this.demoCall(domain, service, data);
    await this.request({ type: 'call_service', domain, service, service_data: data });
  }

  /** Minimal simulation so the UI is explorable without a Home Assistant. */
  private demoCall(domain: string, service: string, data: Record<string, any>) {
    const ids: string[] = [].concat(data.entity_id ?? []);
    const entities = { ...this.snap.entities };
    for (const id of ids) {
      const e = entities[id];
      if (!e) continue;
      let state = e.state;
      const attributes = { ...e.attributes };
      if (service === 'toggle') state = ['on', 'open', 'unlocked', 'playing'].includes(state) ? offOf(id) : onOf(id);
      else if (service === 'turn_on') state = 'on';
      else if (service === 'turn_off') state = 'off';
      else if (service === 'open_cover') state = 'open';
      else if (service === 'close_cover') state = 'closed';
      else if (service === 'lock') state = 'locked';
      else if (service === 'unlock') state = 'unlocked';
      if (data.brightness != null) attributes.brightness = data.brightness;
      entities[id] = { ...e, state, attributes, last_changed: now(), last_updated: now() };
    }
    this.set({ entities });
    return Promise.resolve();
  }
}

const domainOf = (id: string) => id.split('.')[0];
const onOf = (id: string) => ({ cover: 'open', lock: 'unlocked', media_player: 'playing' } as Record<string, string>)[domainOf(id)] ?? 'on';
const offOf = (id: string) => ({ cover: 'closed', lock: 'locked', media_player: 'paused' } as Record<string, string>)[domainOf(id)] ?? 'off';

export const hass = new HassStore();

export function useHass() {
  return useSyncExternalStore(hass.subscribe, hass.getSnapshot);
}

export const domain = domainOf;
