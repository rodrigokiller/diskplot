---
name: Diskplot
description: A disk drawn as a floor plan, in one green ink on drafting paper.
colors:
  paper: "oklch(0.972 0.006 165)"
  panel: "oklch(0.95 0.008 165)"
  sunken: "oklch(0.925 0.01 165)"
  ink: "oklch(0.24 0.025 170)"
  ink-2: "oklch(0.43 0.025 170)"
  line: "oklch(0.87 0.012 168)"
  line-strong: "oklch(0.7 0.02 168)"
  t1: "oklch(0.925 0.028 168)"
  t2: "oklch(0.845 0.052 168)"
  t3: "oklch(0.71 0.082 168)"
  t4: "oklch(0.47 0.094 169)"
  t5: "oklch(0.39 0.078 171)"
  on-weak: "oklch(0.26 0.04 170)"
  on-strong: "oklch(0.97 0.012 165)"
  red: "oklch(0.55 0.19 30)"
  red-weak: "oklch(0.935 0.035 30)"
  on-red: "oklch(0.985 0.01 30)"
  paper-dark: "oklch(0.195 0.012 170)"
  panel-dark: "oklch(0.23 0.014 170)"
  sunken-dark: "oklch(0.165 0.012 170)"
  ink-dark: "oklch(0.93 0.012 165)"
  ink-2-dark: "oklch(0.73 0.02 167)"
  line-dark: "oklch(0.31 0.015 170)"
  line-strong-dark: "oklch(0.45 0.022 170)"
  t1-dark: "oklch(0.275 0.028 170)"
  t2-dark: "oklch(0.36 0.05 170)"
  t3-dark: "oklch(0.44 0.074 169)"
  t4-dark: "oklch(0.68 0.094 168)"
  t5-dark: "oklch(0.82 0.088 167)"
  on-weak-dark: "oklch(0.93 0.02 165)"
  on-strong-dark: "oklch(0.18 0.03 170)"
  red-dark: "oklch(0.7 0.17 32)"
  red-weak-dark: "oklch(0.3 0.06 30)"
  on-red-dark: "oklch(0.16 0.03 30)"
typography:
  display:
    fontFamily: "Barlow Semi Condensed, Barlow, Bahnschrift, sans-serif"
    fontSize: "clamp(2.7rem, 7.2vw, 5.6rem)"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.012em"
  headline:
    fontFamily: "Barlow, Bahnschrift, Segoe UI, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Barlow, Bahnschrift, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Barlow, Bahnschrift, Segoe UI, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.35
    fontFeature: "tabular-nums lining-nums"
  body-site:
    fontFamily: "Barlow, Bahnschrift, Segoe UI, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tabular-nums lining-nums"
  label:
    fontFamily: "Barlow, Bahnschrift, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.35
  plan:
    fontFamily: "Barlow, Bahnschrift, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
rounded:
  none: "0"
spacing:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  2xl: "24px"
  3xl: "32px"
  row: "26px"
  control: "28px"
  tabs: "34px"
  bar: "36px"
  toolrow: "40px"
  titleblock: "48px"
components:
  button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "28px"
    padding: "0 10px"
  button-active:
    backgroundColor: "{colors.sunken}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    height: "28px"
    padding: "0 10px"
  button-primary-hover:
    backgroundColor: "{colors.t5}"
    textColor: "{colors.on-strong}"
  button-danger:
    backgroundColor: "{colors.red}"
    textColor: "{colors.on-red}"
    rounded: "{rounded.none}"
    height: "28px"
    padding: "0 10px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    height: "28px"
    padding: "0 10px"
  button-icon:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    width: "28px"
    height: "28px"
    padding: "0"
  button-site:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    height: "48px"
    padding: "0 20px"
  button-site-hover:
    backgroundColor: "{colors.t5}"
    textColor: "{colors.on-strong}"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.none}"
    height: "28px"
    padding: "0 8px"
  select-on:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    height: "28px"
  tab:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink-2}"
    height: "34px"
    padding: "0 11px"
  tab-selected:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  table-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    height: "26px"
    padding: "0 8px"
  table-row-hot:
    backgroundColor: "{colors.t1}"
  table-row-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  menu-item:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    height: "28px"
    padding: "0 12px 0 8px"
  menu-item-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  menu-item-danger-hover:
    backgroundColor: "{colors.red}"
    textColor: "{colors.on-red}"
  tooltip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    padding: "6px 9px 7px"
  notice:
    backgroundColor: "{colors.t1}"
    textColor: "{colors.on-weak}"
    padding: "6px 10px"
  notice-bad:
    backgroundColor: "{colors.red-weak}"
    textColor: "{colors.on-weak}"
  titleblock-cell:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    height: "48px"
    padding: "5px 14px 0 10px"
---

# Design System: Diskplot

## Overview

**Creative North Star: "The Floor Plan"**

Diskplot draws a disk the way an architect draws a building. Folders are rooms, files are filled areas inside them, and the thickness of a wall tells how close a room is to the top of the view. The sheet is drafting paper with a slight green cast. One green ink fills the plan in five values, from weak to strong, and the heaviest items print darkest. A single red is kept for things that need attention.

The app is a dense desktop tool. Controls are 28px high, table rows are 26px, and body text is 13.5px. Everything is ruled: panels are separated by 1px lines, and the main frames (the plan, the title block, dialogs, the drive list) use a 2px ink line. There are no rounded corners and no shadows anywhere. The landing page in `site/` uses the same paper, ink and lettering at reading sizes, with a condensed display face for headings.

Both surfaces have a light and a dark theme with the same structure. The app switches by setting `data-theme="dark"` on the root element. The site follows `prefers-color-scheme`.

**Key Characteristics:**
- One hue (green, around hue 168) in five values, plus one red.
- Square corners on every element. The global reset sets `border-radius: 0`.
- No shadows. Depth comes from line weight and from three paper tones.
- Barlow lettering with tabular, lining figures so columns of numbers align.
- A custom icon set drawn on a 16px grid with square caps and mitred joins.
- Short motion (120ms to 200ms) that turns off under reduced motion.

## Colors

The palette is drafting paper, green-black ink, a five-step green ink ramp, and one revision red. Exact values for both themes are in the frontmatter. Dark theme tokens carry the `-dark` suffix there; in CSS both themes use the same custom property names.

### Primary
- **Ink** (`ink`): text, icons, the 2px frames, primary buttons, selected rows, tooltips, toasts and menu hover. It is a green-black, never pure black. In the dark theme it becomes a pale green-white.
- **Ink ramp** (`t1` to `t5`): the fill of the plan, weak to strong. Outside the plan, `t1` is the hovered table row and the neutral notice bar, `t3` is the scale box in the title block, `t4` is the share bars, drive meters, folder and file icons in tables and the text selection colour, and `t5` is the hover fill of primary buttons. In the dark theme the ramp is reversed in lightness so that `t5` is still the most prominent value against the paper.
- **On weak, on strong** (`on-weak`, `on-strong`): text drawn on top of the ramp. `on-weak` is used on `t1` to `t3`, `on-strong` on `t4` and `t5`.

### Secondary
- **Revision red** (`red`): the selection outline in the plan, growth since the last scan (the 6px mark, the signed size and the up delta in tables), link and error flags on rows, the issues cell in the title block, a drive meter that is nearly full, the problem box, and destructive buttons and menu items.
- **Red weak** (`red-weak`): the background of an error notice and the hover of the issues cell.
- **On red** (`on-red`): text on a red fill.

### Neutral
- **Paper** (`paper`): the sheet. Window background, inputs, default buttons, menus and dialogs.
- **Panel** (`panel`): the tool row, the tab strip, table group rows, table heads on the start sheet and dialog footers.
- **Sunken** (`sunken`): pressed buttons, hovered menu buttons and breadcrumbs, and the empty track of a share bar.
- **Ink 2** (`ink-2`): secondary text. Column heads, captions, placeholder text, unselected tabs and breadcrumbs.
- **Line** (`line`): light rules between rows and inside panels.
- **Line strong** (`line-strong`): control borders, rules between major regions, disabled text, deep walls in the plan and the hatch.

### Named Rules
**The One Ink Rule.** All fills that carry data use the five values of the green ramp. Do not add a second hue to encode file type, extension or category.

**The Red Means Look Here Rule.** Red is reserved for selection, growth, problems and destructive actions. It is never decoration and never a brand colour. On a selected row, red marks switch to the row text colour so they stay readable on the ink background.

**The Tinted Paper Rule.** Paper is never neutral white and ink is never pure black. Every neutral carries a small amount of green chroma (0.006 to 0.025).

## Typography

**Display Font:** Barlow Semi Condensed 600 (with Barlow, Bahnschrift, sans-serif). Site headings only.
**Body Font:** Barlow 400, 500 and 600 (with Bahnschrift, Segoe UI, system-ui, sans-serif).
**Label/Mono Font:** none. Numbers use Barlow with `font-variant-numeric: tabular-nums lining-nums`.

**Character:** DIN-style lettering, the kind found on technical drawings. Three weights do all the work: 400 for text, 500 for controls and column heads, 600 for names, values and headings.

### Hierarchy
- **Display** (600, clamp(2.7rem, 7.2vw, 5.6rem), line height 1.02, tracking -0.012em): the site h1. Site h2 uses the same face at clamp(1.9rem, 3.6vw, 3rem).
- **Headline** (600, 30px, line height 1.15, tracking -0.01em): the heading of the app start sheet. The scanning heading and scan counters use 24px at 600.
- **Title** (600, 15px): values in the title block and the problem heading. Dialog headings use 17px at 600. The drive letter on the start sheet uses 20px at 600.
- **Body** (400, 13.5px, line height 1.35): all app text, table cells, menus and buttons (buttons use weight 500). The site body is 17px with line height 1.5, and lead paragraphs are 1.16rem in `ink-2` with a measure of 44ch to 58ch.
- **Label** (500, 12px, `ink-2`): column heads, drive list heads and menu section titles. Title block keys are 11.5px at 400. Labels are sentence case. There is no uppercase and no added tracking.
- **Plan lettering** (12px on canvas): file names at 400, folder names at 600 for depth 0 and 1 and 500 below that.

### Named Rules
**The Tabular Figures Rule.** Every number in the interface uses tabular lining figures, and number columns are right aligned, so values can be compared by eye down a column.

**The Three Weights Rule.** Only 400, 500 and 600 are loaded and used. Emphasis comes from weight and from the `ink` and `ink-2` pair, not from size jumps, italics or colour.

## Layout

The app window is a fixed vertical stack that never scrolls as a whole:

1. Title bar, 36px, with the mark, the product name, text menus and the current path centred. The right 140px is left free for the native window controls. A 1px `line-strong` rule closes it.
2. Tool row, 40px, on `panel`: drive button, rescan, up, breadcrumb, search field and filters. Controls are 28px high with 8px gaps.
3. Work area: the plan on the left inside a 2px ink frame with an 8px margin, a 5px splitter, and the schedule panel on the right. The panel is 580px wide by default, can be dragged between 320px and the window width minus 360px, and the width is remembered.
4. Title block, 48px, opened by a 2px ink rule. Cells are separated by 1px `line-strong` rules. Each cell has a small key over a 15px value. The last cell is the graphic scale.

The schedule panel has a 34px tab strip on `panel`, an optional note or action bar with 8px to 12px padding, a 26px table head, and virtualised rows of 26px.

The start sheet and the scanning view are a single centred column, at most 760px wide, with 56px top padding and 32px side padding. The drive list is a six column grid (96px, 1fr, 104px, 104px, 104px, 112px) with 56px rows inside a 2px ink frame.

Spacing uses a short set of steps: 4, 6, 8, 12, 16, 24 and 32px. Gaps inside controls are 6px or 8px. Cell padding in tables is 8px. Dialog padding is 16px.

The site is a single column up to 1280px wide with a gutter of clamp(16px, 4vw, 48px). The top bar is sticky and 56px high. Sections are spaced by clamp(64px, 9vw, 128px). Two-column blocks (hero, split figures, the ruled feature schedule, the three-way comparison) collapse to one column at 860px and below, and the top navigation is hidden at that width.

## Elevation & Depth

The system is flat. There are no drop shadows, no blurs and no gradients used for depth. The only `box-shadow` in the build is a 1px paper-coloured line that joins the selected tab to the pane below it.

Depth is conveyed in three ways:
- **Line weight.** 2px ink for the frames that matter most (plan, title block top rule, dialogs, drive list, counters). 1px `line-strong` between regions and around controls. 1px `line` between rows.
- **Paper tone.** `paper` for the sheet, `panel` for bars and strips that sit beside it, `sunken` for pressed and recessed states.
- **Inversion.** Things that float (menus aside) are solid ink with paper text: tooltips, toasts, the selected row. Menus are paper with a 1px ink border. The dialog backdrop is ink at 45 percent opacity.

### Named Rules
**The No Shadow Rule.** Nothing casts a shadow. If a surface needs to stand apart, give it a heavier line or invert it.

## Shapes

Every corner is square. A global rule sets `border-radius: 0` on all elements and pseudo elements, so no component can opt out by accident. Badges, growth marks and radio marks are small squares (6px in the plan and on tabs, a 5px square for a checked menu item). Sort indicators are solid triangles. Scrollbar thumbs are square, 12px wide, in `line-strong`.

Borders are always solid, with one exception: a 2px dashed ink outline, offset 8px, shows a valid drop target while a folder is dragged over the window.

A diagonal hatch (45 degrees, 1px lines) marks what is not drawn in full: the remainder of a folder in the plan, and the free part of a drive meter.

Focus is a 2px solid ink outline. It is inset by 2px on most elements and offset 2px outside buttons. On the site it is offset 3px.

## Components

### Buttons
- **Shape:** square, 28px high, 10px side padding, 6px gap between icon and label, weight 500.
- **Default:** paper fill, 1px `line-strong` border. Hover darkens the border to ink. Active fills with `sunken`. Disabled text is `line-strong`.
- **Primary:** ink fill, paper text. Hover changes fill and border to `t5` with `on-strong` text. Used for Scan.
- **Danger:** red fill, `on-red` text. Used only for the confirming action of a deletion.
- **Quiet:** no fill and a transparent border that appears as `line-strong` on hover.
- **Icon:** 28px square, icon centred, no label.
- **Motion:** background and border colour change over 120ms with the standard ease.
- **Site button:** 48px high, 20px side padding, 2px ink border, weight 600. The line variant has no fill and inverts to ink on hover. The small variant is 36px high. On the dark closing band the colours are inverted.

### Inputs / Fields
- **Search field:** 28px high, 1px `line-strong` border, paper fill, a search icon and a 190px text input with no border of its own. Content is `ink-2` until focus.
- **Focus:** the border becomes ink and the content becomes ink. The inner input does not draw its own outline.
- **Select:** 28px high, same border. A select with an active filter is inverted (ink fill, paper text) so active filters are visible at a glance.

### Navigation
- **Menus:** text buttons in the title bar, full bar height, `sunken` on hover or when open. The menu is a paper sheet with a 1px ink border, at least 220px wide, with 28px items. An item has a 16px mark column, a label and a right aligned shortcut in `ink-2`. Hover and keyboard focus invert the item to ink. A danger item turns red on hover. Separators are 1px `line`.
- **Breadcrumb:** text segments in `ink-2`, 28px high, separated by a 10px chevron in `line-strong`. Hover gives `sunken` and ink text. The current folder is ink at weight 600 and never shrinks below its content up to half the row.
- **Tabs:** text only, 34px high, on `panel`, separated by 1px `line` rules. The selected tab is paper with ink text at weight 600 and merges with the pane below. A 6px red square after the label marks a tab with something new.

### Tables
- **Head:** 26px, 12px text at weight 500 in `ink-2`, closed by a 1px `line-strong` rule. Each head is a button. The sorted column is ink at weight 600 with a 12px triangle.
- **Rows:** 26px, no row rules. The row under the pointer, or the row matching the hovered plan cell, is `t1`. The selected row is inverted to ink, and everything inside it (icons, bars, flags, secondary text) takes the row text colour.
- **Name cell:** an 18px disclosure chevron that rotates 90 degrees over 120ms, a 16px folder or file icon in `t4`, the name, and optional secondary text in `ink-2`.
- **Share bar:** an 8px track in `sunken` with a `t4` fill and a 44px right aligned percentage.
- **Group rows:** `panel` fill, weight 600, with a 1px `line` rule below.
- **Tags:** a 1px border in the current text colour, 4px side padding, 11.5px text.

### Title block
A 48px ruled strip at the bottom of the window, opened by a 2px ink rule. Cells hold a key (11.5px, `ink-2`) over a value (15px, weight 600) with an optional unit in 12.5px `ink-2`. The issues cell is a button: its value is red and it gets a `red-weak` fill on hover. The last cell is the graphic scale: a square in `t3` with a 1px ink border, between 12px and 32px on a side, and the amount of data that square represents at the current zoom. The value steps through 1, 2, 5, 10, 20, 50, 100, 200 and 500 of each binary unit.

### Dialogs, notices, toasts, tooltips
- **Dialog:** paper, 2px ink border, up to 480px wide. Heading 17px at weight 600, body with 16px padding, and a footer on `panel` above a 1px `line-strong` rule with right aligned buttons 8px apart. Backdrop is ink at 45 percent.
- **Notice:** a bar under the tool row, `t1` fill with `on-weak` text, or `red-weak` for a problem. 6px by 10px padding and a 1px `line-strong` rule below.
- **Problem box:** 2px red border, red 15px heading, at most 60ch wide.
- **Toast:** ink fill, paper text, centred 64px above the bottom edge. It rises 6px and fades in over 160ms.
- **Tooltip:** ink fill, paper text, at most 420px wide. The name is weight 600 and the detail lines are at 80 percent opacity. It follows the pointer over the plan, 14px right and 18px below.

### Drive list and scan progress
- **Drive row:** 56px high, the drive letter at 20px weight 600 with a 20px drive icon, a meter, three right aligned numbers and a primary Scan button. Hover gives `panel`.
- **Meter:** 18px high, 1px ink border. Used space is a `t4` fill closed by a 1px ink line, free space is hatched. A drive that is nearly full is filled red.
- **Counters:** four cells and a stop button inside a 2px ink frame. Key at 12px in `ink-2`, value at 24px weight 600. The columns do not move while scanning; only the values change.
- **Largest so far:** 26px rows with a 10px `t4` bar that scales from the left over 200ms.

### Icons
The icon set is custom and lives in `src/renderer/src/components/Icon.tsx`. Do not add icons from a library.

- **Grid:** 16 by 16 view box. Coordinates sit on quarter pixels so 1.5px strokes land cleanly.
- **Stroke:** 1.5px, `currentColor`, square caps, mitred joins, no fill.
- **Geometry:** right angles wherever the shape allows it. Folder, file, drive, search, copy and warning are all built from rectangles. Diagonals are used only where the meaning needs them (chevron, check, close, arrows, the search handle).
- **Solid fills:** only for small squares and triangles: stop, the checked dot, the sort triangles, the lamp on the drive and the core of the scan icon.
- **Sizes:** 16px by default. 12px for sort triangles, the disclosure chevron and row flags. 10px for breadcrumb separators. 20px for the drive icon on the start sheet.
- **Colour:** inherits the text colour. Folder and file icons in tables use `t4`. Flags use red.
- **Accessibility:** icons are `aria-hidden`. A button that has only an icon needs its own accessible name.
- **Set:** folder, file, drive, chevron, scan, rescan, stop, search, close, trash, reveal, copy, enter, up, warn, link, check, dot, sortDown, sortUp, open.

**The mark** is a square plot on a 32 grid: a frame 4 units thick, one vertical and one horizontal partition 3 units thick, and one room filled with `t4`. The frame and partitions take the text colour. It is used at 18px in the title bar and 44px in the About dialog.

### The plan (treemap)
The plan is drawn on a canvas by `src/renderer/src/components/Treemap.tsx`, with the layout from `src/renderer/src/lib/treemap.ts`. Colours are read from the CSS custom properties at draw time, so the plan follows the theme. A second canvas on top carries hover and selection so the plan is not redrawn when the pointer moves.

**Layout**
- Squarified treemap. Area is proportional to size within the current view.
- A folder gets a 17px label strip when it is at least 46px wide and 31px high. Otherwise it has no label.
- Inner padding of a folder is 2px when both sides exceed 14px, 1px when both exceed 6px, and 0 below that.
- When the next item in a folder would cover less than 12 square pixels, the remainder of that folder becomes one "rest" cell. Layout stops at 90,000 rectangles.
- All rectangles are snapped to whole pixels.

**Files**
- A file is a solid rectangle in one of the five ink values, drawn 1px short on the right and bottom so the paper shows through as a joint.
- The value depends on the share of the current view: `t5` at 5 percent or more, `t4` at 1.2 percent or more, `t3` at 0.3 percent or more, `t2` at 0.06 percent or more, `t1` below that.
- A file shows its name when it is at least 50px wide and 17px high, inset 5px. At 34px high or more it also shows its size on a second line at 80 percent opacity.
- Text is `on-strong` on `t4` and `t5` and `on-weak` on the lighter values. Text that does not fit is cut with an ellipsis, and dropped if less than two characters would remain.

**Walls**
- The view root has no wall of its own. The 2px ink frame of the plan is its wall.
- Depth 1 folders have a 2px ink wall. Depth 2 folders have a 1px ink wall. Deeper folders have a 1px `line-strong` wall.
- A folder too small to stroke is filled with `line-strong`.

**Folder labels**
- The name is ink, 12px, weight 600 at depth 0 and 1 and weight 500 deeper, inset 6px.
- The size is right aligned in `ink-2` and shown only when the folder is at least 150px wide.

**Rest**
- The rest cell is filled with a diagonal hatch: a 6px tile, 1px lines in `line-strong`. Its tooltip says what it stands for.

**Growth since the last scan**
- A growth mark is shown for items that grew by 4 MiB or more.
- On a labelled folder, the size in the label is replaced by the signed change in red.
- On any other cell of at least 12px by 12px, a 6px red square is drawn in the top right corner.

**Hover and selection**
- Hover: a 2px ink outline with a 1px paper line inside it.
- Selection: the same outline in red.
- Hovering a cell lights the matching row in the schedule, and hovering a row outlines the matching cell.

**Interaction**
- Click selects. Double click opens the folder (or the parent folder of a file) to fill the sheet. Wheel up steps one level in under the pointer, wheel down steps one level out. Right click selects and opens the context menu.

**Motion**
- Opening a folder magnifies the old drawing from the room to the full sheet over 170ms with an ease-out quart curve. Going out runs the same movement in reverse on the new drawing.
- With reduced motion the new plan is drawn at once.

The site shows a small live version of the plan built from HTML elements. It follows the same rules for wall weights, the five values and text colours, and its opening animation is a 180ms clip from the room to the full area.

### Motion summary
- **Ease:** `cubic-bezier(0.16, 1, 0.3, 1)` for everything in CSS.
- **Durations:** 120ms for control hover and the disclosure chevron, 160ms for the toast, 170ms for the plan zoom, 200ms for scan bars. On the site: 140ms for buttons, 160ms for the FAQ chevron, 180ms for the plan.
- **Reduced motion:** all transitions and animations are set to 0ms, smooth scrolling is turned off on the site, and the plan zoom is skipped.

## Do's and Don'ts

### Do:
- **Do** use the existing custom properties for every colour. Both themes are defined by the same names.
- **Do** keep every corner square, including badges, tags, inputs, dialogs and images.
- **Do** separate regions with rules: 2px ink for the main frames, 1px `line-strong` between regions, 1px `line` between rows.
- **Do** keep controls at 28px and table rows at 26px in the app.
- **Do** right align numbers and keep tabular figures on.
- **Do** invert to ink fill with paper text for selection, tooltips and toasts.
- **Do** draw new icons on the 16 grid with 1.5px strokes, square caps and mitred joins, and add them to `Icon.tsx`.
- **Do** read plan colours from the custom properties at draw time so the canvas follows the theme.
- **Do** keep motion between 120ms and 200ms and respect reduced motion.
- **Do** write interface text in plain sentence case, in English and Brazilian Portuguese.

### Don't:
- **Don't** add rounded corners, shadows, blurs or colour gradients. The diagonal hatch is the only pattern.
- **Don't** colour the plan by file type or add a second hue. Value carries weight and nothing else.
- **Don't** use red for decoration, for branding or for a primary action.
- **Don't** use pure white, pure black or neutral grey. Neutrals carry the green tint.
- **Don't** use an icon library, icon font or emoji.
- **Don't** use em dashes or emojis in the interface, the copy, the README or the site.
- **Don't** use uppercase labels with wide tracking.
- **Don't** add font weights beyond 400, 500 and 600, or a monospace face for numbers.
- **Don't** move or resize columns while a scan is running. Only values change.
- **Don't** use Barlow Semi Condensed in the app. It is the display face of the site only.

## Themes and brand (update)

The brand is now the Grid theme: a white sheet, black line and one blue ink. The icon, the landing page and the default theme of the app all use it. The green palette documented above remains in the app as the Paper theme.

The app has two themes, Grid and Paper, and each has a light and a dark mode. The mode follows Windows unless the user picks one. The stylesheet keys on `data-theme`: `grid`, `grid-dark`, `light` (Paper) and `dark` (Paper at night). A new theme is one more block of the same variables in `src/renderer/src/styles.css`.

Grid, light: paper `oklch(1 0 0)`, ink `oklch(0.18 0.005 268)`, ramp from `oklch(0.935 0.032 270)` to `oklch(0.4 0.21 265)`. In the Grid themes the construction grid (24px, in the `line` colour) shows behind the start sheet in the app and behind the hero on the site. The site adds one colour plane, `oklch(0.45 0.21 265)`, used for the closing band and for button hover.

The mark is a small treemap: five blocks, each half the one before it, in the ramp from strong to weak.
