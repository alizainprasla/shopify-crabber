/**
 * Generates the shortest unique CSS selector for a DOM element.
 * Prefers id > unique class combo > tag+nth-child, walking up the tree
 * only as far as needed to be unique within the document.
 */
export function generateSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  return buildSelector(el);
}

function buildSelector(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current.nodeType === Node.ELEMENT_NODE && current.tagName !== 'BODY') {
    const part = getUniquePart(current);
    parts.unshift(part);

    // Stop as soon as the accumulated selector is unique
    const selector = parts.join(' > ');
    if (document.querySelectorAll(selector).length === 1) return selector;

    current = current.parentElement;
  }

  return parts.join(' > ');
}

function getUniquePart(el: Element): string {
  const tag = el.tagName.toLowerCase();

  // id is always unique
  if (el.id) return `#${CSS.escape(el.id)}`;

  // Try meaningful class combinations (skip layout/utility classes)
  const classes = Array.from(el.classList)
    .filter(c => !isLayoutClass(c))
    .map(c => `.${CSS.escape(c)}`);

  if (classes.length > 0) {
    // Try each class individually first
    for (const cls of classes) {
      const sel = `${tag}${cls}`;
      if (document.querySelectorAll(sel).length === 1) return sel;
    }
    // Try first two combined
    if (classes.length >= 2) {
      const sel = `${tag}${classes[0]}${classes[1]}`;
      if (document.querySelectorAll(sel).length === 1) return sel;
    }
    // Return tag + first class with nth-child as tiebreaker
    return `${tag}${classes[0]}:nth-child(${nthChild(el)})`;
  }

  // Fall back to tag + nth-child
  return `${tag}:nth-child(${nthChild(el)})`;
}

function nthChild(el: Element): number {
  let n = 1;
  let sib = el.previousElementSibling;
  while (sib) {
    if (sib.tagName === el.tagName) n++;
    sib = sib.previousElementSibling;
  }
  return n;
}

// Classes that are too generic to help identify an element
const LAYOUT_CLASSES = new Set([
  'container', 'wrapper', 'inner', 'outer', 'row', 'col', 'grid',
  'flex', 'block', 'inline', 'active', 'selected', 'open', 'closed',
  'show', 'hide', 'visible', 'hidden', 'disabled', 'enabled',
]);

function isLayoutClass(cls: string): boolean {
  if (LAYOUT_CLASSES.has(cls.toLowerCase())) return true;
  // Skip classes that look like Tailwind utilities (e.g. "px-4", "text-sm")
  if (/^[a-z]+-\d/.test(cls)) return true;
  return false;
}

/**
 * Returns a short human-readable label for an element (for the picker tooltip).
 */
export function elementLabel(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const cls = el.classList.length > 0 ? `.${el.classList[0]}` : '';
  const text = el.textContent?.trim().slice(0, 30) || '';
  return `<${tag}${id || cls}>${text ? ` "${text}"` : ''}`;
}

/**
 * Given a CSS selector and a field type, extract the value from the current page.
 */
export function extractValue(selector: string, type: FieldType): string | string[] {
  const els = Array.from(document.querySelectorAll(selector));
  if (els.length === 0) return type === 'image' ? [] : '';

  switch (type) {
    case 'text':
      return els[0].textContent?.trim() || '';
    case 'html':
      return (els[0] as HTMLElement).innerHTML?.trim() || '';
    case 'href':
      return (els[0] as HTMLAnchorElement).href || els[0].getAttribute('href') || '';
    case 'image':
      return els.map(el => {
        const img = el.tagName === 'IMG' ? el as HTMLImageElement : el.querySelector('img');
        return img?.getAttribute('data-src') || img?.getAttribute('src') || img?.src || '';
      }).filter(Boolean);
    case 'attr':
      return els[0].getAttribute('content') || els[0].getAttribute('value') || els[0].textContent?.trim() || '';
    default:
      return els[0].textContent?.trim() || '';
  }
}

export type FieldType = 'text' | 'html' | 'href' | 'image' | 'attr';
