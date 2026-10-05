/**
 * Color normalization helpers for the dashboard export pipeline.
 *
 * html2canvas (used inside jsPDF) cannot parse `oklch(...)` color values,
 * which Tailwind v4 emits for its default palette. The result is a runtime
 * error like "Attempting to parse an unsupported color function 'oklch'"
 * and a broken PDF/PNG.
 *
 * The fix is: before snapshotting, walk the dashboard node and rewrite any
 * computed `oklch(...)` color values on inline styles to `rgb(...)` using
 * a hidden off-screen `<canvas>` 2D context as the converter (browsers
 * expose `oklch` support on the canvas color parser even when the CSS
 * parser rejects it). We then apply the rgb() result as an inline style
 * so it wins over the stylesheet.
 *
 * This is applied to a *clone* of the node so the on-screen styles are
 * untouched.
 */

const OKLCH_RE = /oklch\(\s*[^)]+\)/gi;

const PROPS_TO_NORMALIZE: string[] = [
  "color",
  "backgroundColor",
  "borderColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outlineColor",
  "fill",
  "stroke",
  "textDecorationColor",
  "caretColor",
];

let converterCanvas: HTMLCanvasElement | null = null;
function getConverterCanvas(): HTMLCanvasElement {
  if (!converterCanvas) {
    converterCanvas = document.createElement("canvas");
    converterCanvas.width = 1;
    converterCanvas.height = 1;
  }
  return converterCanvas;
}

/**
 * Convert a single CSS color string to an `rgb(...)`/`rgba(...)` equivalent
 * using a canvas's 2D context. Returns the original string if it isn't
 * oklch (no-op) or if conversion fails.
 */
function normalizeColorString(value: string): string {
  if (!value) return value;
  if (!OKLCH_RE.test(value)) {
    OKLCH_RE.lastIndex = 0;
    return value;
  }
  OKLCH_RE.lastIndex = 0;
  try {
    const ctx = getConverterCanvas().getContext("2d");
    if (!ctx) return value;
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillStyle = value;
    const out = ctx.fillStyle as string;
    // canvas returns rgb()/rgba() or a hex for solid colors
    if (typeof out === "string" && /^(rgb|#)/i.test(out)) return out;
    return value;
  } catch {
    return value;
  }
}

/**
 * Recursively walk an element tree and rewrite oklch colors on inline
 * styles to rgb. Also rewrites oklch tokens referenced via `style="..."`
 * attributes. Operates in place.
 */
export function inlineConvertOklch(root: HTMLElement): void {
  const stack: HTMLElement[] = [root];
  while (stack.length > 0) {
    const el = stack.pop()!;
    for (const prop of PROPS_TO_NORMALIZE) {
      const current = el.style.getPropertyValue(prop);
      if (current && OKLCH_RE.test(current)) {
        el.style.setProperty(prop, normalizeColorString(current));
      }
    }
    // Also process the `style` attribute as a whole: any oklch substring
    // that wasn't covered by a known property (e.g. inside a CSS variable)
    // will still get rewritten.
    const styleAttr = el.getAttribute("style");
    if (styleAttr && OKLCH_RE.test(styleAttr)) {
      el.setAttribute("style", styleAttr.replace(OKLCH_RE, (m) => normalizeColorString(m)));
    }
    for (let i = 0; i < el.children.length; i += 1) {
      const child = el.children[i];
      if (child instanceof HTMLElement) stack.push(child);
    }
  }
}

/**
 * Convenience helper used by the export pipeline: clone the source node,
 * attach the clone off-screen, and normalize oklch colors so html2canvas
 * can render it. Returns the clone. Caller is responsible for removing it
 * from the DOM after the snapshot.
 */
export function prepareNodeForExport(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  // Preserve the source's measured size so the clone is renderable.
  const rect = source.getBoundingClientRect();
  clone.style.width = `${rect.width}px`;
  clone.style.minHeight = `${rect.height}px`;
  // Inline-convert any oklch colors so html2canvas's parser is happy.
  inlineConvertOklch(clone);
  // Position off-screen but in the viewport so layout/font measurement works.
  clone.style.position = "fixed";
  clone.style.left = "-99999px";
  clone.style.top = "0";
  clone.style.zIndex = "-1";
  clone.style.pointerEvents = "none";
  return clone;
}
