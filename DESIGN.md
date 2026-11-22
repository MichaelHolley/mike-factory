---
name: mike-factory
description: A calm status board for agent runs, from issue comment to pull request.
colors:
  bg: "#edf0f3"
  surface: "#ffffff"
  ink: "#18212b"
  muted: "#5d6a78"
  line: "#d7dde3"
  chrome: "#18212b"
  chrome-ink: "#e9edf1"
  run: "#2447f5"
  focus: "#2447f5"
  ok: "#22c27a"
  bad: "#ff5650"
  halt: "#6e6a86"
  you: "#0a9bc4"
  setup: "#4f6479"
  check: "#a35f00"
  ship: "#7440d4"
  merged: "#8250df"
  idle: "#c3cbd3"
  bg-dark: "#14181e"
  surface-dark: "#1c2129"
  ink-dark: "#e6eaee"
  muted-dark: "#94a0ad"
  line-dark: "#2c333d"
  chrome-dark: "#0e1216"
  run-dark: "#6e8bff"
  focus-dark: "#6e8bff"
  ok-dark: "#2fd98a"
  bad-dark: "#ff5650"
  halt-dark: "#a9a3c9"
  you-dark: "#5cc8d8"
  setup-dark: "#9db0c4"
  check-dark: "#eeb150"
  ship-dark: "#7440d4"
  merged-dark: "#a371f7"
  idle-dark: "#38414c"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.25
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.43
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
rounded:
  xs: "2px"
  sm: "4px"
  md: "6px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  header:
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.chrome-ink}"
    height: "52px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "20px 24px"
  run-row:
    backgroundColor: "{colors.surface}"
    padding: "16px 20px 16px 24px"
  run-row-compact:
    typography: "{typography.body-sm}"
    padding: "8px 20px 8px 24px"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    size: "28px"
  button-icon-hover:
    textColor: "{colors.ink}"
  button-send:
    backgroundColor: "{colors.run}"
    textColor: "{colors.surface}"
    rounded: "{rounded.full}"
    size: "40px"
  phase-badge:
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    size: "24px"
  composer:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "16px"
  error-banner:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.bad}"
    padding: "12px 16px"
  code-block:
    backgroundColor: "{colors.bg}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
---

<!-- sources: web/src/style.css, web/src/phase.ts, web/src/App.vue, web/src/components/, web/src/views/ -->

# Design System: mike-factory

## Overview

**Creative North Star: "The Control Room"**

mike-factory is a calm wall of status boards. An operator looks up, reads which runs are live, which need review and which have finished, and looks away again. Surfaces stay neutral cool greys and whites. Color is a signal light: every hue belongs to a phase of the pipeline or to an outcome, and nothing is colored for decoration.

The mood is calm, legible and exact. The philosophy is **"Status at a glance, detail on demand."** List views are dense, with hairline-divided rows. The run page opens into a pipeline track, a facts panel and a conversation log with collapsible tool calls. The system rejects the flashy SaaS dashboard: no gradients, no glassmorphism, no hero illustrations, and no colored cards fighting for attention.

Light and dark mode both follow `prefers-color-scheme`. Every token is defined once per mode; components never branch on the mode themselves.

**Key Characteristics:**

- Dark console header above a cool grey page holding white panels.
- One hue per kind of work, with the same icon and color for a phase everywhere.
- Flat tonal layering and hairline borders; a shadow only on what floats.
- System sans for UI, IBM Plex Mono for code, prompts, branches and paths.
- Tabular numerals for every count, cost and time.

## Colors

A quiet slate-and-fog neutral base, punctuated by saturated signal hues that map one-to-one to pipeline phases and outcomes.

### Primary

- **Live Signal Blue** (`{colors.run}`): the active-work hue. Implement and fix phases, links, the send button, running tool calls and the "running" label. Doubles as the focus ring (`{colors.focus}`).

### Secondary

The phase hues, grouped by kind of work (`stepLook` in `web/src/phase.ts`):

- **Staging Steel** (`{colors.setup}`): queued and prepare, setup work before the agent starts.
- **Inspection Amber** (`{colors.check}`): verify, when the run's checks execute.
- **Operator Teal** (`{colors.you}`): revise, and everything that comes from a human: review comments and reviewers.
- **Dispatch Violet** (`{colors.ship}`): publish and report, shipping the result to GitHub.

### Tertiary

The outcome hues:

- **All-Clear Green** (`{colors.ok}`): review and done, a run that succeeded.
- **Merged Violet** (`{colors.merged}`): a merged PR, matching GitHub's merged purple.
- **Alarm Coral** (`{colors.bad}`): failed runs, errors, error banners and failed tool calls.
- **Stopped Lavender-Grey** (`{colors.halt}`): aborted runs and closed PRs, an ending that is neither success nor failure.

### Neutral

- **Cool Fog Grey** (`{colors.bg}`): the page background, and the inset background of code blocks inside panels.
- **Panel White** (`{colors.surface}`): every panel, list and card, and the text on filled blue.
- **Deep Slate Ink** (`{colors.ink}`): primary text and headings.
- **Weathered Slate** (`{colors.muted}`): secondary text, counts, timestamps, meta rows and resting icon buttons. The most-used text color in the app.
- **Hairline Grey** (`{colors.line}`): panel borders and row dividers.
- **Console Slate** (`{colors.chrome}`) with **Console Glow** (`{colors.chrome-ink}`): the header bar and its text.
- **Idle Rail Grey** (`{colors.idle}`): the connector rails of the pipeline track and other inactive fills.

**The Signal Light Rule.** A hue appears only when it means something: a phase, an outcome or a human. Never color an element for emphasis or decoration.

**The Same Light Everywhere Rule.** A phase always uses its hue and icon from `stepLook`, whether it is a row edge, a badge, a track station or a filter option. A PR always uses `GitPullRequest`, `GitMerge` once merged and `GitPullRequestClosed` once closed.

**The Two Modes Rule.** Every color is a token with a light value and a `-dark` value, except Console Glow (`{colors.chrome-ink}`), since the header stays dark in both modes. Most hues lighten in dark mode; Dispatch Violet (`{colors.ship-dark}`) and Alarm Coral (`{colors.bad-dark}`) deliberately keep their light values. Tints come from the token with opacity (a hue at 10–15% behind its icon, ink at 4–6% for hover), never from a new hex.

## Typography

**Display Font:** System UI sans (-apple-system, BlinkMacSystemFont, system-ui)
**Body Font:** The same system sans
**Label/Mono Font:** IBM Plex Mono (with ui-monospace)

**Character:** The native system face keeps the board quiet and familiar on the operator's machine. IBM Plex Mono marks anything machine-made: prompts, code, branch names, file paths and tool names.

### Hierarchy

- **Display** (600, 2.25rem, 1.25): page titles such as "Runs", "Finished runs" and "Metrics".
- **Headline** (600, 1.875rem, 1.25): a run's issue title on the detail page, stepping down to 1.5rem on small screens; also the large cost figure and metric summary sentence.
- **Title** (600, 1.125rem, 1.25): section headings ("Working now", "Conversation") and metric panel titles, followed by a count in Weathered Slate at medium weight.
- **Body** (400, 1rem, 1.5): run titles, conversation messages and prose, capped at a readable measure (prose width) in long text.
- **Body small** (400, 0.875rem): meta rows, compact rows, tables, review comments and secondary links.
- **Label** (600, 0.875rem): phase badges and the current station on the pipeline track. Lowercase phase names, no letter-spacing, no uppercase.
- **Mono** (400, 0.875rem, relaxed 1.625): code, prompts and tool input and output.

**The Tabular Rule.** Every issue number, count, cost, duration and timestamp uses tabular numerals so columns line up.

## Layout

One centered column, at most 72rem (1152px) wide, with 16px side padding that grows to 32px from the `sm` breakpoint. The page starts 24px below the header (40px from `sm`) and ends with 64px of space.

Sections stack with 40px between them, and a section heading sits 12px above its panel. Inside panels, content is padded 20–24px horizontally and 16–20px vertically. The default gap between inline items is 8px, tightening to 4–6px between an icon and its label.

Run lists use a fixed column grid (repo and issue, title, phase, PR, time) and collapse to a stacked layout with a container query when the list itself gets narrow, not the viewport. Rows come in two densities: regular for live work, compact for review and finished lists.

## Elevation & Depth

Flat, with tonal layering. Depth comes from three layers: the Console Slate header, the Cool Fog Grey page and Panel White panels with a Hairline Grey border. Inside a panel, inset content (code blocks) drops back to Cool Fog Grey.

### Shadow Vocabulary

- **Floating** (`box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)`): only for elements that float over scrolling content, currently the sticky message composer. ui-sdk popups (select, autocomplete, tooltip) bring their own.

**The Nothing Floats Unless It Moves Rule.** A shadow is earned by sitting above content that scrolls under it. Static panels, rows and cards stay flat.

## Shapes

Small, precise corners. Panels and lists use gently rounded corners (`{rounded.md}`); controls, code blocks and the header's nav pills use `{rounded.sm}`, which is also ui-sdk's base radius. The focus outline is barely rounded (`{rounded.xs}`). The floating composer is the only larger shape (`{rounded.xl}`). Circles (`{rounded.full}`) mark phases: badge discs, pipeline stations and the send button.

Borders are 1px Hairline Grey. A 3px left edge in a status hue is the system's accent shape: the phase edge on every run row, and Alarm Coral on error banners and the failure message.

## Components

### Buttons

Refined and restrained: controls stay out of sight until hover or focus.

- **Shape:** Square, borderless icon buttons (28px, `{rounded.sm}`) with a 16px icon and a tooltip label.
- **Primary:** Icon buttons rest in Weathered Slate on a transparent background. PR buttons take the PR's state hue (Merged Violet, Stopped Lavender-Grey).
- **Hover / Focus / Active:** Hover adds a faint ink tint (6%) and darkens the icon to ink. Focus shows a 2px Live Signal Blue outline, offset 2px.
- **Send:** The only filled button, a 40px Live Signal Blue circle with a white arrow, in the composer.
- **Header:** Nav links and icon buttons in Console Glow at 80%, with a 10% Console Glow tint on hover.

### Cards / Containers

- **Panel:** Panel White, 1px Hairline Grey border, `{rounded.md}`. Used for run lists, run facts, metric panels, pipeline prompts and empty states.
- **Metric tiles:** a grid of Panel White cells divided by 1px gaps that show the Hairline Grey behind them.

### Inputs / Fields

ui-sdk Select, Autocomplete and Textarea, themed through the `--ui-*` tokens. Fields sit on Panel White with a Hairline Grey border and a Live Signal Blue focus ring. The header search sits on a translucent Console Glow fill.

### Navigation

A 52px Console Slate header: the wordmark, a Metrics link and a centered run search. Back links on detail pages are small muted text with an arrow, darkening to ink on hover.

### Chips

- **Phase badge:** a 24px disc tinted at 15% of the phase hue, holding the phase icon, then the lowercase phase name in Label type and the same hue. A phase change slides the badge up and fades it (250ms, ease-out-quint).

### Run Row

The board's core unit. A 3px left edge in the phase hue, repo name in 600 weight, issue number in Weathered Slate, the title, the phase badge, the PR button and a right-aligned relative time. The whole row is a link target and takes a 4% Live Signal Blue tint on hover.

### Pipeline Track

The run's stations in order, linked by 2px Idle Rail Grey rails. Passed stations are outlined circles at half opacity, pending stations fainter still. The current station is a filled 48px disc in its hue with a soft 4px halo, its icon in white (page background in dark mode), and a ping pulse while the run is live.

### Message Composer

A floating Panel White card (`{rounded.xl}`, Floating shadow), sticky at the bottom of the run page from `md` up. On focus its border turns Live Signal Blue with a faint 15% ring. It shows the current phase badge, the keyboard shortcut hint and the send button.

### Tool Call

A collapsible row in the conversation: chevron, status icon (spinning blue while running, coral on failure, faded muted on success), the tool name and a summary in mono. Opening it shows input and output in Cool Fog Grey code blocks, each with a copy button.

## Do's and Don'ts

### Do:

- **Do** take every color from a token in `web/src/style.css`, and give any new color a `-dark` value. The one exception: an icon on a filled phase disc is white in light mode.
- **Do** look up a phase's hue and icon in `stepLook` (`web/src/phase.ts`) rather than choosing one.
- **Do** build controls from `@ui-sdk/vue`, themed through the `--ui-*` tokens.
- **Do** use tabular numerals for numbers, and Weathered Slate for counts next to headings.
- **Do** honor `prefers-reduced-motion`: drop translations, pings and spins, and remove or shorten transitions.
- **Do** use ease-out-quint (`cubic-bezier(0.23, 1, 0.32, 1)`) for state changes, at 150–300ms.

### Don't:

- **Don't** color text or surfaces for emphasis; reach for weight (500/600) or ink versus muted instead.
- **Don't** add shadows to static panels, rows or cards.
- **Don't** use corners larger than `{rounded.md}` except on floating elements and circular phase marks.
- **Don't** add filled or colored buttons beyond the send button; actions are quiet icon buttons with tooltips.
- **Don't** uppercase or letter-space labels; phase names stay lowercase.
- **Don't** use gradients, blurs or illustrations.
