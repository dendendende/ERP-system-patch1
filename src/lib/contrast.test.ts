import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// P6-T5: every text colour the app uses is readable (WCAG AA, 4.5:1) on every background it
// sits on — including the see-through ones (bg-in/10, text-attention-ink/80…), blended as the
// browser does. Colours come straight from the design tokens in globals.css.
const css = readFileSync("src/app/globals.css", "utf8");
const token = (name: string) => {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i"));
  if (!m) throw new Error(`no --color-${name}`);
  return m[1];
};

type RGB = [number, number, number];
const rgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
/** `top` at `alpha` over `bottom`. */
const over = (top: RGB, alpha: number, bottom: RGB): RGB =>
  top.map((c, i) => c * alpha + bottom[i] * (1 - alpha)) as RGB;
const luminance = ([r, g, b]: RGB) => {
  const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a: RGB, b: RGB) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const c = (name: string) => rgb(token(name));
const ground = c("ground");
const surface = c("surface");

// [text, background, where it appears]
const PAIRS: [string, RGB, RGB][] = [
  ["ink on page", c("ink"), ground],
  ["ink on card", c("ink"), surface],
  ["muted on page", c("muted"), ground],
  ["muted on card", c("muted"), surface],
  ["muted in the needs-label card", c("muted"), over(c("attention-bg"), 0.3, ground)],
  ["green 'came in' amounts", c("in"), surface],
  ["red error text", c("problem"), surface],
  ["red error text on page", c("problem"), ground],
  ["pill: neutral", c("muted"), ground],
  ["pill: in", c("in"), over(c("in"), 0.1, surface)],
  ["pill: attention", c("attention-ink"), c("attention-bg")],
  ["pill: problem", c("problem"), over(c("problem"), 0.1, surface)],
  ["balance banner text", c("problem"), over(c("problem"), 0.1, ground)],
  ["stale-bank banner", c("attention-ink"), over(c("attention-bg"), 0.4, ground)],
  [
    "stale-bank banner detail",
    over(c("attention-ink"), 0.8, over(c("attention-bg"), 0.4, ground)),
    over(c("attention-bg"), 0.4, ground),
  ],
  ["primary button", surface, c("brand")],
  ["primary button, hovered", surface, c("brand-deep")],
  ["blue links and active tab text", c("brand"), surface],
  ["filter chip", c("brand-deep"), c("brand-soft")],
  ["sidebar text", c("nav-ink"), c("nav")],
  ["sidebar: current page", rgb("#ffffff"), over(rgb("#ffffff"), 0.1, c("nav"))],
  ["sidebar: bank late warning", c("attention-bg"), c("nav")],
  ["status bar on navy", surface, c("nav")],
  ["danger button", surface, c("problem")],
  ["Home: Money in button (and its hint)", surface, c("in")],
  ["input hint text (placeholder)", c("muted"), surface],
];

describe("colour contrast (WCAG AA 4.5:1)", () => {
  it.each(PAIRS)("%s", (_where, text, background) => {
    expect(ratio(text, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("the formula is right (black on white is 21:1)", () => {
    expect(ratio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
  });
});
