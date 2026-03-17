# Demo Mode — Design Spec

**Date:** 2026-03-16
**Status:** Draft
**Purpose:** Toggle the UI into a demo state with synthetic data for screenshots and live presentations.

## Overview

A client-side-only demo mode that replaces live API data with static synthetic data, shifted in time so it always looks fresh. No backend changes. Toggled from a "Danger Zone" section at the bottom of the Settings page.

## Data Files

Three static JSON files in `ui/src/demo/`:

| File | API it replaces | Shape |
|---|---|---|
| `demo-timeseries.json` | `GET /timeseries` | Matches `getTimeSeries` response: buckets, byType, bySource, topTopics, projects, actionItemCount, totalInRange |
| `demo-thoughts.json` | `GET /thoughts` | Array of thought records with full metadata (content, summary, type, topics, people, project, source, dates, etc.) |
| `demo-settings.json` | `GET /settings/enrichment` | Matches enrichment settings shape: types, defaultType, projects with aliases, classificationModel, specialInstructions, customPrompt, timezone |

### Timestamp Shifting

All files use a fixed **anchor date** (e.g. `2026-01-08`). A `shiftDate(dateStr, offsetMs)` utility in `ui/src/demo/shiftDates.ts` computes the offset between the anchor and today, then shifts all date fields forward. This means the data always appears as the most recent 7 days regardless of when the demo is viewed.

The shift function walks the response structure and offsets `thought_date`, `created_at`, and bucket `date` fields. The anchor date constant is defined once alongside the utility.

### Content Guidelines

The synthetic data represents a realistic solo developer workflow:
- 3-4 projects with aliases
- Mix of sources: mcp, user-prompt, session-hook, slack
- Varied types: decision, observation, task, idea, reference, person_note, milestone
- ~15-25 thoughts per day across 7 days
- Realistic summaries, topics, people, and action items
- No real names, project names, or sensitive content

## Demo Mode State

### Storage

`localStorage` key: `privatemcp-demo-mode` (value: `"true"` or absent). Purely client-side — no DDB field, no backend changes, no bootstrap ordering issues.

### Frontend Context

A `DemoContext` React context:
- Reads `localStorage` on init to determine demo state
- Exposes `isDemoMode: boolean` and `toggleDemoMode: () => void`
- `toggleDemoMode` writes to `localStorage` and updates context state
- Context update triggers re-renders across all pages — no reload needed

## Settings Page — Danger Zone

A visually separated section at the bottom of the Settings page scrollable content (above the spacer div that accounts for the fixed save bar), styled with a warning/red border similar to GitHub's Danger Zone pattern.

Contents:
- Heading: "Danger Zone"
- Toggle row: "Demo Mode" with description "Replace live data with sample data for screenshots and presentations"
- Cloudscape Toggle component
- This toggle writes to `localStorage` via `toggleDemoMode()` from DemoContext

## API Layer Intercept

The `api` module checks `isDemoMode` (passed as a parameter or read from context) before every call. When demo mode is on:

| Method | Behavior |
|---|---|
| `getTimeSeries()` | Load `demo-timeseries.json`, apply timestamp shift, return |
| `queryThoughts()` | Load `demo-thoughts.json`, apply timestamp shift, simulate pagination/filtering client-side |
| `getEnrichmentSettings()` | Load `demo-settings.json` (no shift needed) |
| `getProjects()` | Derive from `demo-settings.json` project names |
| `searchThoughts()` | Return empty result (page disabled) |
| `getTimeSeries()` for Reports | Return empty result (page disabled) |

Demo JSON files are statically imported (Vite handles JSON imports). No fetch calls at all in demo mode.

### Pagination Simulation

`demo-thoughts.json` contains the full array. The demo `queryThoughts` slices the array client-side to simulate cursor-based pagination, respecting `limit` and returning `hasMore`. `nextToken` is simulated as a stringified array index (e.g. `"25"`, `"50"`). Type and project filters apply client-side against the full array before slicing.

## Banner

A full-width amber/gold bar rendered in the app shell, positioned above AppLayout and below TopNavigation. Visible on every page when demo mode is on.

- Background: amber/gold
- Text: white, "You're viewing demo data"
- No CTA link (no signup flow — single-user app)
- Implemented as a styled div (not a Cloudscape component) to keep it visually distinct

## Page Behavior in Demo Mode

### Dashboard
- Fully functional with demo data
- Charts, stat cards, project modal all work against shifted demo-timeseries data

### Browse
- Fully functional with demo data
- Pagination, type/project filters work client-side
- Detail modal renders demo thought content
- Edit form is read-only (save disabled)
- Delete button in detail modal disabled
- Bulk delete action and multi-select checkboxes disabled

### Search
- Page renders with search input and results table visible
- Cloudscape Alert (`type="info"`) at top: "Search is not available in demo mode"
- Search input and button disabled

### Reports
- Page renders with project selector and layout visible
- Cloudscape Alert (`type="info"`) at top: "Reports are not available in demo mode"
- Controls disabled

### Capture
- Page renders with form visible
- Cloudscape Alert (`type="info"`) at top: "Capture is not available in demo mode"
- Form controls disabled

### Settings
- Displays data from `demo-settings.json`
- All CRUD controls disabled:
  - Type tag X buttons removed
  - "Add type" input + button disabled
  - Alias tag X buttons removed
  - "Add alias" inputs + buttons disabled
  - Project trash icons removed
  - Model selector dropdown disabled
  - Special instructions textarea disabled
  - Custom prompt textarea disabled
  - "Import from captured" button disabled (if present)
- Save bar visible but Save and Reset to defaults buttons disabled
- Note in save bar area: "Settings are read-only in demo mode"
- Danger Zone toggle remains functional (writes to localStorage)

## What This Feature Does NOT Include

- No backend changes (no demo-aware query logic, no seed scripts to DDB, no new fields)
- No auth or demo user accounts
- No URL parameter override
- No demo data for the MCP tools themselves (only the UI)
