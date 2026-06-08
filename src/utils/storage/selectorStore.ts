import type { FieldType } from '../selector/cssGenerator';

export interface FieldDefinition {
  name: string;          // e.g. "title", "price", "image", "description"
  label: string;         // human-readable label shown in UI
  selector: string;      // CSS selector
  type: FieldType;       // how to extract the value
  multiple?: boolean;    // collect all matching elements (for images)
}

export interface SelectorMap {
  hostname: string;
  fields: FieldDefinition[];
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'selectorMaps';

export async function loadSelectorMap(hostname: string): Promise<SelectorMap | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const maps: Record<string, SelectorMap> = result[STORAGE_KEY] || {};
  return maps[hostname] || null;
}

export async function saveSelectorMap(map: SelectorMap): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const maps: Record<string, SelectorMap> = result[STORAGE_KEY] || {};
  maps[map.hostname] = { ...map, updatedAt: new Date().toISOString() };
  await chrome.storage.local.set({ [STORAGE_KEY]: maps });
}

export async function upsertField(hostname: string, field: FieldDefinition): Promise<SelectorMap> {
  const existing = await loadSelectorMap(hostname);
  const now = new Date().toISOString();

  const map: SelectorMap = existing || {
    hostname,
    fields: [],
    createdAt: now,
    updatedAt: now,
  };

  const idx = map.fields.findIndex(f => f.name === field.name);
  if (idx >= 0) {
    map.fields[idx] = field;
  } else {
    map.fields.push(field);
  }

  await saveSelectorMap(map);
  return map;
}

export async function deleteField(hostname: string, fieldName: string): Promise<void> {
  const map = await loadSelectorMap(hostname);
  if (!map) return;
  map.fields = map.fields.filter(f => f.name !== fieldName);
  await saveSelectorMap(map);
}

export async function clearSelectorMap(hostname: string): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const maps: Record<string, SelectorMap> = result[STORAGE_KEY] || {};
  delete maps[hostname];
  await chrome.storage.local.set({ [STORAGE_KEY]: maps });
}

// Default fields shown before any customisation
export const DEFAULT_FIELDS: Omit<FieldDefinition, 'selector'>[] = [
  { name: 'title',       label: 'Title',       type: 'text',  multiple: false },
  { name: 'price',       label: 'Price',        type: 'text',  multiple: false },
  { name: 'description', label: 'Description',  type: 'html',  multiple: false },
  { name: 'image',       label: 'Images',       type: 'image', multiple: true  },
  { name: 'vendor',      label: 'Vendor/Brand', type: 'text',  multiple: false },
];
