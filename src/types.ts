export type ActionKind = 'none' | 'toggle' | 'more-info' | 'call-service' | 'navigate';

export interface ActionConfig {
  action: ActionKind;
  /** call-service: "domain.service", e.g. light.turn_on */
  service?: string;
  /** call-service: JSON service data (entity_id of the item is added if missing) */
  data?: string;
  /** navigate: Home Assistant path, e.g. /lovelace/cameras */
  path?: string;
}

export type DisplayType = 'icon' | 'text' | 'glow' | 'badge';

export interface PlanItem {
  id: string;
  entity_id: string;
  /** position as a percentage of the image */
  x: number;
  y: number;
  display: DisplayType;
  /** key of the curated icon list; empty = automatic */
  icon?: string;
  /** size multiplier, 1 = default */
  size: number;
  name?: string;
  showName?: boolean;
  /** CSS colour used when the entity is active; empty = automatic */
  color?: string;
  tap: ActionConfig;
  hold: ActionConfig;
}

export interface PlanView {
  id: string;
  name: string;
  kind: 'hero' | 'floor';
  /** file name returned by the upload API, served from media/<image> */
  image?: string;
  showTitle: boolean;
  items: PlanItem[];
}

export interface PlanConfig {
  version: 1;
  title: string;
  views: PlanView[];
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
}
