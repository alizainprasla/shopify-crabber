import { useState, useEffect, useCallback } from 'react';
import type { FieldDefinition, SelectorMap } from '../../utils/storage/selectorStore';
import { DEFAULT_FIELDS } from '../../utils/storage/selectorStore';

interface Props {
  hostname: string;
  selectorMap: SelectorMap | null;
  onSave: (map: SelectorMap) => void;
  onClose: () => void;
}

type PickerState = 'idle' | 'waiting' | 'done';

export function FieldPicker({ hostname, selectorMap, onSave, onClose }: Props) {
  const [fields, setFields] = useState<FieldDefinition[]>(() => {
    if (selectorMap?.fields.length) return selectorMap.fields;
    return DEFAULT_FIELDS.map(f => ({ ...f, selector: '' }));
  });
  const [pickerState, setPickerState] = useState<PickerState>('idle');
  const [activeField, setActiveField] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Listen for picker result from content script (relayed via background)
  useEffect(() => {
    const handler = (msg: { type: string; payload?: { field: string; selector: string } }) => {
      if (msg.type === 'PICKER_SELECTED' && msg.payload) {
        setFields(prev => prev.map(f =>
          f.name === msg.payload!.field
            ? { ...f, selector: msg.payload!.selector }
            : f
        ));
        setPickerState('idle');
        setActiveField(null);
      }
      if (msg.type === 'PICKER_CANCELLED') {
        setPickerState('idle');
        setActiveField(null);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const startPick = useCallback(async (fieldName: string) => {
    setPickerState('waiting');
    setActiveField(fieldName);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'START_PICKER',
        payload: { field: fieldName },
      });
    }
  }, []);

  const cancelPick = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      await chrome.tabs.sendMessage(tab.id, { type: 'STOP_PICKER' }).catch(() => {});
    }
    setPickerState('idle');
    setActiveField(null);
  }, []);

  const clearField = useCallback((fieldName: string) => {
    setFields(prev => prev.map(f =>
      f.name === fieldName ? { ...f, selector: '' } : f
    ));
  }, []);

  const handleSelectorEdit = useCallback((fieldName: string, value: string) => {
    setFields(prev => prev.map(f =>
      f.name === fieldName ? { ...f, selector: value } : f
    ));
  }, []);

  const handleSave = useCallback(async () => {
    const now = new Date().toISOString();
    const map: SelectorMap = {
      hostname,
      fields: fields.filter(f => f.selector),
      createdAt: selectorMap?.createdAt || now,
      updatedAt: now,
    };
    // Persist
    const result = await chrome.storage.local.get('selectorMaps');
    const maps = result.selectorMaps || {};
    maps[hostname] = map;
    await chrome.storage.local.set({ selectorMaps: maps });
    onSave(map);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [fields, hostname, selectorMap, onSave]);

  const handleClearAll = useCallback(async () => {
    setFields(DEFAULT_FIELDS.map(f => ({ ...f, selector: '' })));
    const result = await chrome.storage.local.get('selectorMaps');
    const maps = result.selectorMaps || {};
    delete maps[hostname];
    await chrome.storage.local.set({ selectorMaps: maps });
  }, [hostname]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Custom Selectors</h2>
          <p className="text-xs text-gray-500 mt-0.5">{hostname}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      </div>

      {pickerState === 'waiting' ? (
        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded p-2">
          <div className="flex items-center gap-2 text-xs text-emerald-700">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              Picking <strong>{fields.find(f => f.name === activeField)?.label}</strong> —
              click any element on the page
            </span>
          </div>
          <button
            onClick={cancelPick}
            className="text-xs text-emerald-600 hover:text-emerald-800 font-medium ml-2 flex-shrink-0"
          >
            Cancel
          </button>
        </div>
      ) : (
        <p className="text-xs text-gray-500 bg-gray-50 rounded p-2">
          Click <strong>Pick</strong> next to any field, then click an element on the page.
          You can also type a CSS selector directly.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {fields.map(field => (
          <div key={field.name} className="rounded border border-gray-200 p-2 bg-white">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-700">{field.label}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => startPick(field.name)}
                  className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${
                    activeField === field.name && pickerState === 'waiting'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  {activeField === field.name && pickerState === 'waiting' ? 'Picking…' : 'Pick'}
                </button>
                {field.selector && (
                  <button
                    onClick={() => clearField(field.name)}
                    className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <input
              type="text"
              value={field.selector}
              onChange={e => handleSelectorEdit(field.name, e.target.value)}
              placeholder={`CSS selector for ${field.label.toLowerCase()}…`}
              className="w-full text-xs font-mono border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-emerald-400 bg-gray-50"
            />
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          className="flex-1 btn btn-primary text-sm"
        >
          {saved ? '✓ Saved' : 'Save Selectors'}
        </button>
        <button
          onClick={handleClearAll}
          className="btn btn-secondary text-sm px-3"
          title="Clear all custom selectors for this site"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
