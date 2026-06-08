/**
 * Element Picker — injected into the page when the user clicks "Pick" in the popup.
 *
 * Activates a hover-highlight overlay. On click, sends the generated CSS selector
 * back to the popup via chrome.runtime.sendMessage.
 */

import { generateSelector, elementLabel } from '../utils/selector/cssGenerator';

let active = false;
let tooltip: HTMLElement | null = null;
let overlay: HTMLElement | null = null;
let pendingField: string | null = null;

const OVERLAY_ID = '__crabber_picker_overlay__';
const TOOLTIP_ID = '__crabber_picker_tooltip__';

// ---- Public API (called by content/index.ts message handler) ----

export function startPicker(fieldName: string): void {
  if (active) stopPicker();
  pendingField = fieldName;
  active = true;
  injectStyles();
  createOverlay();
  createTooltip();
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
}

export function stopPicker(): void {
  active = false;
  pendingField = null;
  document.removeEventListener('mousemove', onMouseMove, true);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKeyDown, true);
  overlay?.remove();
  tooltip?.remove();
  overlay = null;
  tooltip = null;
  removeHighlight();
}

// ---- Overlay & tooltip ----

function createOverlay(): void {
  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483646;
    cursor: crosshair; background: transparent;
    pointer-events: none;
  `;
  document.body.appendChild(overlay);
}

function createTooltip(): void {
  tooltip = document.createElement('div');
  tooltip.id = TOOLTIP_ID;
  tooltip.style.cssText = `
    position: fixed; z-index: 2147483647;
    background: #1a1a2e; color: #fff;
    font: 12px/1.4 monospace; padding: 6px 10px;
    border-radius: 6px; pointer-events: none;
    max-width: 320px; word-break: break-all;
    box-shadow: 0 2px 8px rgba(0,0,0,.4);
    display: none;
  `;
  document.body.appendChild(tooltip);
}

// ---- Highlight ----

let highlighted: Element | null = null;
const HIGHLIGHT_ATTR = 'data-crabber-highlight';

function highlight(el: Element): void {
  if (highlighted === el) return;
  removeHighlight();
  highlighted = el;
  (el as HTMLElement).setAttribute(HIGHLIGHT_ATTR, '1');
}

function removeHighlight(): void {
  if (highlighted) {
    (highlighted as HTMLElement).removeAttribute(HIGHLIGHT_ATTR);
    highlighted = null;
  }
}

// ---- Event handlers ----

function onMouseMove(e: MouseEvent): void {
  const el = realTarget(e);
  if (!el) return;

  highlight(el);

  if (tooltip) {
    const label = elementLabel(el);
    const selector = generateSelector(el);
    tooltip.textContent = `${label}\n${selector}`;
    tooltip.style.display = 'block';

    const x = Math.min(e.clientX + 14, window.innerWidth - 340);
    const y = Math.min(e.clientY + 14, window.innerHeight - 80);
    tooltip.style.left = x + 'px';
    tooltip.style.top  = y + 'px';
  }
}

function onClick(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();

  const el = realTarget(e);
  if (!el) return;

  const selector = generateSelector(el);
  const field = pendingField;

  stopPicker();

  // Report back to popup
  chrome.runtime.sendMessage({
    type: 'PICKER_SELECTED',
    payload: { field, selector },
  });
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    stopPicker();
    chrome.runtime.sendMessage({ type: 'PICKER_CANCELLED' });
  }
}

// ---- Helpers ----

function realTarget(e: MouseEvent): Element | null {
  // Walk through composed path to skip our own overlay elements
  for (const el of e.composedPath()) {
    const element = el as Element;
    if (!element.id) return element;
    if (element.id !== OVERLAY_ID && element.id !== TOOLTIP_ID) return element;
  }
  return e.target as Element;
}

function injectStyles(): void {
  const id = '__crabber_picker_styles__';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    [data-crabber-highlight] {
      outline: 2px solid #10b981 !important;
      outline-offset: 2px !important;
      background: rgba(16,185,129,.08) !important;
    }
    #${OVERLAY_ID} { pointer-events: none !important; }
  `;
  document.head.appendChild(style);
}
