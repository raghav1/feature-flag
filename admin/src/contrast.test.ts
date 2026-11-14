import { describe, expect, it } from "vitest";
// The tokens live in design/tokens.css, shared with the demo storefront, so this covers both apps.
import css from "../../design/tokens.css?raw";

/** The --tokens declared in a block, e.g. `:root {` or `[data-theme="dark"] {`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no ${selector} block in tokens.css`);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]!.trim()]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** [text token, background token]: every pairing the UI actually uses for text. */
const TEXT_PAIRS: [string, string][] = [
  ["fg-default", "canvas-default"],
  ["fg-default", "canvas-subtle"],
  ["fg-default", "neutral-subtle"],
  ["fg-default", "success-subtle"],
  ["fg-default", "attention-subtle"],
  ["fg-default", "accent-subtle"],
  ["fg-default", "highlight"],
  ["fg-muted", "canvas-default"],
  ["fg-muted", "canvas-subtle"],
  ["fg-muted", "neutral-subtle"],
  ["fg-muted", "success-subtle"],
  ["fg-muted", "attention-subtle"],
  ["accent-fg", "canvas-default"],
  ["accent-fg", "canvas-subtle"],
  ["accent-fg", "accent-subtle"],
  ["success-fg", "success-subtle"],
  ["attention-fg", "attention-subtle"],
  ["danger-fg", "canvas-default"],
  ["danger-fg", "canvas-subtle"],
  ["done-fg", "canvas-default"],
  ["fg-on-emphasis", "success-emphasis"],
  ["fg-on-emphasis", "danger-emphasis"],
  ["fg-on-emphasis", "accent-emphasis"],
  // Demo storefront: hero copy on the tinted hero box, prices, debug footer.
  ["fg-muted", "accent-subtle"],
  ["success-fg", "canvas-default"],
  ["danger-fg", "danger-subtle"],
];

/** Icons on tinted backgrounds: WCAG asks 3:1 for graphics. */
const ICON_PAIRS: [string, string][] = [
  ["sponsors-fg", "sponsors-subtle"],
  ["done-fg", "done-subtle"],
  ["danger-fg", "danger-subtle"],
  ["success-fg", "success-subtle"],
  ["attention-fg", "attention-subtle"],
  ["success-fg", "canvas-subtle"],
];

describe.each([
  ["light", ":root"],
  ["dark", '[data-theme="dark"]'],
])("%s theme", (_name, selector) => {
  const t = tokens(selector);

  it.each(TEXT_PAIRS)("text %s on %s is at least 4.5:1", (fg, bg) => {
    expect(t[fg], fg).toMatch(/^#[0-9a-f]{6}$/i);
    expect(t[bg], bg).toMatch(/^#[0-9a-f]{6}$/i);
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ICON_PAIRS)("icon %s on %s is at least 3:1", (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(3);
  });
});

describe("spacing", () => {
  it("every --space token is on the 4px grid", () => {
    for (const [name, value] of Object.entries(tokens(":root")).filter(([n]) => n.startsWith("space-"))) {
      expect(parseInt(value, 10) % 4, name).toBe(0);
    }
  });
});
