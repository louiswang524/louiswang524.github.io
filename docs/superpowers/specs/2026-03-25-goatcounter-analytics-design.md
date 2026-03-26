---
name: Goatcounter Analytics Integration
description: Add simple visit tracking to louiswang524.github.io using Goatcounter
type: project
---

# Design: Goatcounter Analytics Integration

**Date:** 2026-03-25
**Scope:** Single file change — add tracking script to base layout

## Goal

Track visit counts per page on the personal blog (louiswang524.github.io).

## Approach

Add the Goatcounter tracking script to `src/layouts/BaseLayout.astro` before `</body>`. Goatcounter fires automatically on every page load, tracking the current URL.

## Prerequisites (manual, done by user)

1. Sign up at goatcounter.com
2. Choose a site code (e.g. `louiswang524`) → dashboard at `louiswang524.goatcounter.com`
3. Confirm the site code so the script URL can be set correctly

## Code Change

**File:** `src/layouts/BaseLayout.astro`

Add before `</body>`:

```html
<script data-goatcounter="https://<SITE_CODE>.goatcounter.com/count"
        async src="//gc.zgo.at/count.js"></script>
```

Replace `<SITE_CODE>` with the actual Goatcounter site code.

## What Gets Tracked

Every page using `BaseLayout` — blog index, all blog posts, tag pages, archive, search.

## What Does Not Change

No other files. No new dependencies. No build config changes.
