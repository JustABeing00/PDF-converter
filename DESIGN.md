# DESIGN.md: Vercel (vercel.com)

## Source
- URL: https://vercel.com/
- Capture date: 2026-09-28
- Evidence: Firecrawl scrape (`markdown,branding,images`, 1 credit) → `.firecrawl/vercel-design.json`; full-page screenshot attempted twice, both returned solid-black (JS/canvas hero blocked for bots), so layout tokens below come from the structured `branding` block, not the screenshot.

## Reference Screenshot
![Full-page screenshot attempt of vercel.com](./.firecrawl/vercel-shot2.png)

> Note: automated capture rendered black (bot protection on the WebGL hero). Treat tokens below — taken from Firecrawl's structured branding output (confidence 0.925) — as the source of truth, not the image.

## Design Summary
Vercel's language is strict monochrome minimalism: near-black text on off-white, hairline gray borders, zero decorative shadow, pill-shaped CTA buttons, 4px spacing base, and GeistSans set tight. Color is rationed — one blue (`#0072F5`) reserved for links/focus. Everything else is black, white, and gray. An agent recreating this feel should remove color, not add it.

## Design Tokens

### Colors
| Role | Value | Notes |
|---|---|---|
| Background (page) | `#FAFAFA` | observed |
| Surface (cards) | `#FFFFFF` | observed (secondary button bg) |
| Text primary | `#171717` | observed |
| Text muted | `#666666` | inferred (Geist gray-500; scrape gave no muted token) |
| Border hairline | `#EAEAEA` | inferred from secondary-button ring `rgb(235,235,235)` |
| Border strong | `#D4D4D4` | inferred |
| Primary action bg | `#171717` (white text) | observed, confidence 0.95 |
| Link / focus blue | `#0072F5` | observed (`primary` + focus use) |
| Error red | `#EE0000` | inferred (Vercel error red; scrape `link: #9A050F` is page-specific, not reused) |
| CTA example | "Deploy now" (primary, dark) / "Talk to sales" (secondary, light) | observed |

### Typography
- Family: `GeistSans` for headings and body (observed). Fallback when Geist is unavailable: `Inter, -apple-system, "Segoe UI", Roboto, sans-serif` (inferred).
- Scale observed: h1 `64px`, h2 `56px`, body `14px`. Small UI text (13–14px) is the norm; large headings carry tight negative tracking.
- Weights: headings 600–700, body 400–500 (inferred).
- Rules: sentence-case headings, short declarative copy, one idea per line. No uppercase display type.

### Spacing And Layout
- Base unit `4px` (observed). Spacing ramps in 4s: 4 / 8 / 12 / 16 / 24 / 32 / 48+.
- Radius: `6px` on cards/inputs (observed); buttons are full pill (`33554400px` observed → use `999px`).
- Shadows: `none` on buttons (observed). Depth comes from hairline borders, not elevation.
- Borders: 1px hairlines; secondary button ring is `0 0 0 1px #EBEBEB` (observed).
- Container: narrow centered column (~1000–1100px), generous vertical rhythm (inferred).
- Nav pattern: slim top bar, wordmark left, links center/right, dark pill CTA + ghost "Log In" (observed in markdown).

## Components
- **Primary button**: black pill, white 14–15px medium text, no shadow, hover → `#000` or `#2E2E2E`.
- **Secondary button**: white pill, black text, 1px `#EBEBEB` ring, hover → ring darkens.
- **Ghost/tertiary**: plain text button, gray → black on hover.
- **Cards**: white, 1px `#EAEAEA` border, 6–8px radius, no shadow.
- **Badges/pills**: tiny 12–13px gray text in bordered pill (e.g. version announcements).
- **Inputs/dropzones**: bordered box, black border on focus/drag, blue focus ring sparingly.
- **Footer**: hairline top border, small gray links in columns (inferred).

## Page Patterns
1. Slim sticky nav (logo left, links, login + dark CTA right).
2. Centered hero: pill badge → huge tight headline → one-line subcopy → two buttons (dark + light) side by side.
3. Logos / social proof strip.
4. Alternating feature rows with product screenshots in bordered frames.
5. Card grids (3-up) for products/templates.
6. CTA band + fat footer.

## Content Style
- Voice: terse, technical, confident. Developer audience.
- CTAs: verb-first, 2 words ("Deploy now", "Talk to sales", "Start building").
- Headings: short, no jargon walls, no exclamation marks.
- Copy density: very low — whitespace does the work.

## Agent Build Instructions
When building in this style:
1. Set page bg `#FAFAFA`, surface `#FFFFFF`, text `#171717`, muted `#666666`, hairline `#EAEAEA`.
2. Use system stack approximating Geist (`Inter, -apple-system, "Segoe UI", Roboto, sans-serif`); body 14–15px; headings 600+ weight with `-0.02em` to `-0.04em` tracking.
3. Space everything on a 4px grid; default gaps 12/16/24.
4. All buttons pill (`999px`); primary black/white-text, secondary white/black-text with 1px ring; no shadows anywhere.
5. Cards: white, 1px hairline, 6–8px radius.
6. One blue (`#0072F5`) only for links/focus rings; one red only for errors.
7. Header: slim bar, product name left, one meta badge/action right, hairline bottom border.
8. No gradients, no decorative animation, no illustrations. If it doesn't help the workflow, delete it.
9. Do NOT copy Vercel's logo, triangle mark, wordmark, product names, or marketing copy — use the client's own brand and words.

## Rerun Inputs
workflow: firecrawl-website-design-clone
source_url: https://vercel.com/
target_stack: React + Vite + plain CSS (this repo)
output: DESIGN.md
artifacts: .firecrawl/vercel-design.json, .firecrawl/vercel-shot2.png
