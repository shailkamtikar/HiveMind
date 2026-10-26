import { describe, expect, it } from "vitest";

// Mirrors the tokens in src/app/globals.css. Update both together.
const light = { bg: "#faf7f2", surface: "#ffffff", fg: "#1c1915", muted: "#655e52", accentText: "#8a5a00", danger: "#b42318" };
const dark = { bg: "#0e0d0b", surface: "#171512", fg: "#f3efe8", muted: "#a39b8c", accentText: "#f2b441", danger: "#f97066" };
const button = { fg: "#1a1304", bg: "#f2b441" };

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("design token contrast (WCAG AA 4.5:1)", () => {
  for (const [name, t] of [["light", light], ["dark", dark]] as const) {
    it(`${name}: text pairs`, () => {
      expect(contrast(t.fg, t.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.muted, t.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.muted, t.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.accentText, t.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.danger, t.bg)).toBeGreaterThanOrEqual(4.5);
    });
  }
  it("primary button text on accent", () => {
    expect(contrast(button.fg, button.bg)).toBeGreaterThanOrEqual(4.5);
  });
});
