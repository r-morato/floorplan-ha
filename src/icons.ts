import {
  mdiLightbulb, mdiLightbulbOutline, mdiCeilingLight, mdiLamp, mdiFloorLamp, mdiThermometer, mdiWaterPercent,
  mdiMotionSensor, mdiWalk, mdiDoorClosed, mdiDoorOpen, mdiWindowClosed, mdiWindowOpen, mdiGarage, mdiGarageOpen,
  mdiBlinds, mdiBlindsOpen, mdiLock, mdiLockOpen, mdiTelevision, mdiSpeaker, mdiMusic, mdiFan, mdiRadiator,
  mdiAirConditioner, mdiPowerPlug, mdiToggleSwitch, mdiFlash, mdiSolarPower, mdiBattery, mdiCar, mdiCarElectric,
  mdiWashingMachine, mdiRobotVacuum, mdiShieldHome, mdiCamera, mdiSmokeDetector, mdiWaterAlert, mdiBell, mdiHome,
  mdiFridge, mdiStove, mdiGauge, mdiBed, mdiSofa, mdiPlay, mdiScriptText, mdiGestureTap, mdiHelpCircleOutline,
  mdiTransmissionTower, mdiWeatherSunny, mdiThermostat, mdiPalette, mdiShower, mdiToilet, mdiDesk, mdiSilverware,
  mdiAccount, mdiWifi, mdiFire, mdiSprinkler, mdiPool, mdiTreeOutline, mdiVolumeHigh, mdiLightningBolt,
} from '@mdi/js';
import type { HassEntity } from './types';

/** Curated icon set (the full MDI set would add several MB to the bundle). */
export const ICONS: Record<string, string> = {
  lightbulb: mdiLightbulb, 'lightbulb-outline': mdiLightbulbOutline, 'ceiling-light': mdiCeilingLight, lamp: mdiLamp,
  'floor-lamp': mdiFloorLamp, thermometer: mdiThermometer, 'water-percent': mdiWaterPercent,
  'motion-sensor': mdiMotionSensor, walk: mdiWalk, 'door-closed': mdiDoorClosed, 'door-open': mdiDoorOpen,
  'window-closed': mdiWindowClosed, 'window-open': mdiWindowOpen, garage: mdiGarage, 'garage-open': mdiGarageOpen,
  blinds: mdiBlinds, 'blinds-open': mdiBlindsOpen, lock: mdiLock, 'lock-open': mdiLockOpen, television: mdiTelevision,
  speaker: mdiSpeaker, music: mdiMusic, fan: mdiFan, radiator: mdiRadiator, 'air-conditioner': mdiAirConditioner,
  'power-plug': mdiPowerPlug, 'toggle-switch': mdiToggleSwitch, flash: mdiFlash, 'solar-power': mdiSolarPower,
  battery: mdiBattery, car: mdiCar, 'car-electric': mdiCarElectric, 'washing-machine': mdiWashingMachine,
  'robot-vacuum': mdiRobotVacuum, 'shield-home': mdiShieldHome, camera: mdiCamera, 'smoke-detector': mdiSmokeDetector,
  'water-alert': mdiWaterAlert, bell: mdiBell, home: mdiHome, fridge: mdiFridge, stove: mdiStove, gauge: mdiGauge,
  bed: mdiBed, sofa: mdiSofa, play: mdiPlay, 'script-text': mdiScriptText, 'gesture-tap': mdiGestureTap,
  'transmission-tower': mdiTransmissionTower, 'weather-sunny': mdiWeatherSunny, thermostat: mdiThermostat,
  palette: mdiPalette, shower: mdiShower, toilet: mdiToilet, desk: mdiDesk, silverware: mdiSilverware,
  account: mdiAccount, wifi: mdiWifi, fire: mdiFire, sprinkler: mdiSprinkler, pool: mdiPool, tree: mdiTreeOutline,
  'volume-high': mdiVolumeHigh, 'lightning-bolt': mdiLightningBolt,
};
const FALLBACK = mdiHelpCircleOutline;

const OFF_STATES = new Set(['off', 'closed', 'locked', 'unavailable', 'unknown', 'idle', 'standby', 'not_home', 'paused', 'disarmed', 'none', '']);
export const isActive = (e?: HassEntity) => !!e && !OFF_STATES.has(e.state);

const BY_CLASS: Record<string, [string, string?]> = {
  temperature: ['thermometer'], humidity: ['water-percent'], motion: ['motion-sensor', 'walk'], occupancy: ['motion-sensor', 'walk'],
  presence: ['account'], door: ['door-closed', 'door-open'], window: ['window-closed', 'window-open'],
  garage: ['garage', 'garage-open'], garage_door: ['garage', 'garage-open'], power: ['flash'], energy: ['flash'],
  battery: ['battery'], smoke: ['smoke-detector'], moisture: ['water-alert'], blind: ['blinds', 'blinds-open'],
  shutter: ['blinds', 'blinds-open'], illuminance: ['weather-sunny'], speaker: ['speaker'], tv: ['television'],
  outlet: ['power-plug'],
};
const BY_DOMAIN: Record<string, [string, string?]> = {
  light: ['lightbulb-outline', 'lightbulb'], switch: ['toggle-switch'], fan: ['fan'], lock: ['lock', 'lock-open'],
  cover: ['blinds', 'blinds-open'], media_player: ['speaker'], climate: ['thermostat'], camera: ['camera'],
  vacuum: ['robot-vacuum'], script: ['script-text'], scene: ['palette'], button: ['gesture-tap'],
  input_button: ['gesture-tap'], person: ['account'], device_tracker: ['wifi'], alarm_control_panel: ['shield-home'],
  binary_sensor: ['motion-sensor'], sensor: ['gauge'], water_heater: ['fire'], sun: ['weather-sunny'],
};

/** Resolve the SVG path for an item: explicit choice > entity icon attribute > device class > domain. */
export function iconPath(explicit: string | undefined, e: HassEntity | undefined, entityId: string): string {
  if (explicit && ICONS[explicit]) return ICONS[explicit];
  const attr = e?.attributes.icon as string | undefined;
  if (attr?.startsWith('mdi:') && ICONS[attr.slice(4)]) return ICONS[attr.slice(4)];
  const pair = (e && BY_CLASS[e.attributes.device_class]) || BY_DOMAIN[entityId.split('.')[0]];
  if (!pair) return FALLBACK;
  const key = isActive(e) && pair[1] ? pair[1] : pair[0];
  return ICONS[key] ?? FALLBACK;
}

/** Light colour from the entity when it has one. */
export function entityColor(e?: HassEntity): string | undefined {
  const rgb = e?.attributes.rgb_color as number[] | undefined;
  return rgb ? `rgb(${rgb.join(',')})` : undefined;
}

export function formatState(e?: HassEntity): string {
  if (!e) return '–';
  const unit = e.attributes.unit_of_measurement as string | undefined;
  const n = Number(e.state);
  const v = e.state !== '' && Number.isFinite(n) ? String(Math.round(n * 10) / 10) : e.state;
  if (['unavailable', 'unknown'].includes(v)) return '–';
  return unit ? `${v}${unit === '°C' || unit === '°F' || unit === '%' ? '' : ' '}${unit}` : v;
}

export const friendlyName = (e: HassEntity | undefined, id: string) => (e?.attributes.friendly_name as string) || id;
export const TOGGLEABLE = new Set(['light', 'switch', 'fan', 'input_boolean', 'cover', 'lock', 'media_player', 'climate', 'humidifier', 'siren']);

/** Domains where on/off (toggle) does something; sensors, binary sensors etc. are read-only. */
export const CONTROLLABLE = new Set([...TOGGLEABLE, 'script', 'scene', 'button', 'input_button', 'vacuum', 'valve', 'lawn_mower']);
export const canToggle = (entityId: string) => CONTROLLABLE.has(entityId.split('.')[0]);
