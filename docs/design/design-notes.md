# HiveMind design notes

Single source of truth for tokens, components and motion. Update this file when the design changes.

## Direction
Warm, calm and editorial rather than the stock "AI" look (no purple gradients, no glowing blobs, no emoji icons). A warm off-white / near-black neutral base with one honey-amber accent (the "hive"). A serif display face for headlines gives character; the UI itself stays quiet and legible.

### Reference-driven rules (from `references/README.md`)
1. One accent per screen, used for a single phrase, button or bar; everything else stays neutral.
2. Headlines carry the personality: large, tight line height, one emphasized phrase (accent color or italic serif).
3. Small uppercase mono "eyebrow" labels above headings and on metadata (timestamps, counts, roles); hairline `border` rules between sections.
4. Show the real product (the actual chat UI) in the landing hero rather than decorative graphics.
5. No gradient blobs, glass effects, emoji icons or three identical feature cards.
6. Open decision for 6.1: the honey-amber accent stays unless you prefer a stronger vermilion/red like the references; changing it only means editing `--accent` tokens.

## Tokens (defined in `src/app/globals.css`)
| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | #faf7f2 | #0e0d0b | page |
| `surface` | #ffffff | #171512 | cards, inputs, dialogs |
| `surface-2` | #f2ede4 | #1f1c18 | secondary buttons, avatars, hovers |
| `border` | #ddd5c6 | #2f2a24 | all borders |
| `foreground` | #1c1915 | #f3efe8 | body text |
| `muted` | #655e52 | #a39b8c | secondary text |
| `accent` / `accent-foreground` | #f2b441 / #1a1304 | same | primary button |
| `accent-text` | #8a5a00 | #f2b441 | accent-colored text and links |
| `danger`, `success` | #b42318, #067647 | #f97066, #47cd89 | status |
| `ring` | #b57a06 | #f2b441 | focus outline |

Rule: components use token class names (`bg-surface`, `text-muted`, ...). Hex values live only in `globals.css`. `src/lib/contrast.test.ts` checks WCAG AA (4.5:1) for the text pairs; keep it in sync with the table.

## Type
- Sans (UI): Geist. Display (headlines only): Instrument Serif. Mono (code): Geist Mono. All loaded with `next/font`, so they are self-hosted and cause no layout shift.
- Headlines use `font-display`; body uses the default sans.

## Components (`src/components/ui/`)
`Button` (primary / secondary / ghost / danger), `Input` (label + error wiring), `Card`, `Avatar` (initials), `Spinner`, `Dialog` (native `<dialog>`: focus trap, Esc, inert background built in). Showcase at `/design` (development only; returns 404 in production builds).

## Motion rules
- CSS transitions of 150 ms or less for state changes. GSAP and Lenis are used on `/` and `/privacy` only: they are imported on demand from `LandingMotion`, are absent from the chat pages' JavaScript (checked on a production build by `tests/e2e/csp.spec.ts`), and do nothing when `prefers-reduced-motion` is set.
- Chat: new-message entrance 200 ms or less and never delays showing a message.
- `prefers-reduced-motion` disables animation globally (rule in `globals.css`).

## Libraries and licenses
| Source | Status | License note |
|---|---|---|
| Geist, Geist Mono, Instrument Serif (Google Fonts via next/font) | in use | SIL Open Font License |
| Native `<dialog>` | in use | web platform |
| GSAP 3.15 (incl. ScrollTrigger) | in use, landing and privacy pages only | "Standard 'no charge' license" (https://gsap.com/standard-license). The page says GSAP is free for everyone; the full terms could not be read in detail while building, so re-read them before any commercial launch. |
| Lenis 1.3 | in use, landing and privacy pages only | MIT |
| three.js 0.186 | in use, landing hero only (loaded on demand) | MIT |
| React Bits | patterns re-implemented, no code copied | The motion components in `src/components/fx` (blur-in text, spotlight card, word reveal, shiny text) are written from scratch in the style of React Bits; no component source was copied, so no licence terms apply. |
| 21st.dev | pattern reference only | No component source copied. |
| React Bits components | none copied yet | check each component's license before copying |
| 21st.dev patterns | used as inspiration only; no code copied | check per-component license if copying |

## Review log (Impeccable-style pass)
- Hierarchy: one serif display size plus a small sans scale; no decorative gradients.
- Contrast: automated test passes for both themes.
- Open item: visual approval by the owner on `/design`; revisit when real reference sites are chosen (see `references/README.md`).

## Landing page review (Milestone 6.1)
Checked against the "AI slop" list from the reference notes:
- No purple/blue gradient hero, no glowing orbs as the main visual: the only background effect is a faint amber wash and dot grid (also used in the app), and the hero shows the real chat UI instead of an illustration.
- No emoji icons, no row of three identical feature cards: "How it works" is a numbered list separated by hairlines, in an editorial layout.
- Copy states real behaviour and limits (five people, three-day links, free-tier Gemini data use) instead of generic claims.
- Headline carries the personality: serif, tight, one italic accent word.
- Accent colour decision: honey-amber stays (single accent per screen, buttons and one headline word). Switching to a stronger red later only means editing the `--accent` tokens.
- Open for the owner: final visual approval.

Lighthouse (mobile emulation, production build, 2026-10-27): `/` performance 91, accessibility 100, best practices 100, SEO 91, cumulative layout shift 0, LCP 3.2 s. `/privacy`: 91 / 100 / 100 / 91, CLS 0, LCP 3.3 s.
