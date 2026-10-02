import type { PlanConfig } from './types';

// All URLs are relative so the app works behind Home Assistant ingress.
export async function loadConfig(): Promise<PlanConfig> {
  const r = await fetch('api/config', { cache: 'no-store' });
  if (!r.ok) throw new Error(`Loading config failed (${r.status})`);
  return r.json();
}

export async function saveConfig(cfg: PlanConfig): Promise<void> {
  const r = await fetch('api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });
  if (!r.ok) throw new Error(`Saving failed (${r.status})`);
}

export async function uploadImage(file: File): Promise<string> {
  const r = await fetch('api/images', { method: 'POST', body: file });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Upload failed (${r.status})`);
  return body.file as string;
}

export async function deleteImage(file: string): Promise<void> {
  await fetch(`api/images/${encodeURIComponent(file)}`, { method: 'DELETE' });
}

export const mediaUrl = (file: string) => `media/${file}`;

export const uid = () => Math.random().toString(36).slice(2, 10);

export const exportUrl = 'api/export';

export async function importBackup(file: File): Promise<void> {
  const r = await fetch('api/import', { method: 'POST', body: file });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Import failed (${r.status})`);
}
