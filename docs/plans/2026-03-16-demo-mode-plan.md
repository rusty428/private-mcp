# Demo Mode Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a client-side demo mode that replaces live API data with synthetic data for screenshots and presentations.

**Architecture:** Entirely frontend — a DemoContext reads a localStorage flag, the API module returns static JSON (with timestamp shifting) when demo mode is on, and each page either works with demo data or shows a disabled state. No backend changes.

**Tech Stack:** React context, Vite JSON imports, Cloudscape components, localStorage

**Spec:** `docs/plans/2026-03-16-demo-mode-design.md`

---

### Task 1: DemoContext

**Files:**
- Create: `ui/src/contexts/DemoContext.tsx`
- Modify: `ui/src/App.tsx` (wrap app with DemoProvider)

- [ ] **Step 1: Create DemoContext**

```tsx
// ui/src/contexts/DemoContext.tsx
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

const STORAGE_KEY = 'privatemcp-demo-mode';

interface DemoContextValue {
  isDemoMode: boolean;
  toggleDemoMode: () => void;
}

const DemoContext = createContext<DemoContextValue>({ isDemoMode: false, toggleDemoMode: () => {} });

export function DemoProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');

  const toggleDemoMode = useCallback(() => {
    setIsDemoMode((prev) => {
      const next = !prev;
      if (next) {
        localStorage.setItem(STORAGE_KEY, 'true');
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
      return next;
    });
  }, []);

  return <DemoContext.Provider value={{ isDemoMode, toggleDemoMode }}>{children}</DemoContext.Provider>;
}

export function useDemoMode() {
  return useContext(DemoContext);
}
```

- [ ] **Step 2: Wrap app with DemoProvider**

In `ui/src/App.tsx`, import `DemoProvider` and wrap `ThemeProvider` with it inside the `App()` function, so all children (including `AppContent`, `DemoSync`, and `DemoBanner`) have access to demo context:

```tsx
export function App() {
  return (
    <BrowserRouter>
      <DemoProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </DemoProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Step 3: Verify app still loads**

Run: `pnpm --dir ui dev` — confirm app loads without errors in browser console.

- [ ] **Step 4: Commit**

```bash
git add ui/src/contexts/DemoContext.tsx ui/src/App.tsx
git commit -m "feat(demo): add DemoContext with localStorage toggle"
```

---

### Task 2: Timestamp Shift Utility

**Files:**
- Create: `ui/src/demo/shiftDates.ts`

- [ ] **Step 1: Create shift utility**

```tsx
// ui/src/demo/shiftDates.ts

// All demo JSON files use this anchor. Data spans anchor-6d through anchor.
export const DEMO_ANCHOR = '2026-01-08';

function getOffsetMs(): number {
  const anchor = new Date(DEMO_ANCHOR + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime() - anchor.getTime();
}

/** Shift a YYYY-MM-DD date string forward by the offset. */
export function shiftDate(dateStr: string): string {
  if (!dateStr) return dateStr;
  const offsetMs = getOffsetMs();
  // Handle both YYYY-MM-DD and ISO datetime strings
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  d.setTime(d.getTime() + offsetMs);
  if (dateStr.includes('T')) return d.toISOString();
  return d.toISOString().slice(0, 10);
}

/** Shift all date fields in a thought record. */
export function shiftThoughtDates<T extends Record<string, any>>(item: T): T {
  return {
    ...item,
    metadata: {
      ...item.metadata,
      thought_date: shiftDate(item.metadata.thought_date),
      created_at: shiftDate(item.metadata.created_at),
    },
  };
}

/** Shift all date fields in a timeseries response. */
export function shiftTimeSeriesDates<T extends Record<string, any>>(data: T): T {
  return {
    ...data,
    buckets: data.buckets.map((b: any) => ({ ...b, date: shiftDate(b.date) })),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/demo/shiftDates.ts
git commit -m "feat(demo): add timestamp shift utility"
```

---

### Task 3: Demo Data Files

**Files:**
- Create: `ui/src/demo/demo-timeseries.json`
- Create: `ui/src/demo/demo-thoughts.json`
- Create: `ui/src/demo/demo-settings.json`

- [ ] **Step 1: Create demo-settings.json**

Realistic enrichment settings with 4 projects, aliases, and all config fields. No timestamp shifting needed for this file.

Projects: "Acme API", "Dashboard Redesign", "Data Pipeline", "Internal Docs". Types: the standard 8. Model: `anthropic.claude-3-haiku-20240307-v1:0`.

- [ ] **Step 2: Create demo-thoughts.json**

Array of ~120 thought records spanning 7 days (anchor-6d through anchor). Each record has the full `ThoughtRecord` shape: `{ key, metadata: { content, summary, type, topics, people, action_items, dates_mentioned, project, related_projects, source, source_ref, session_id, session_name, quality, thought_date, created_at, enriched } }`.

Mix of sources (mcp ~30%, user-prompt ~50%, session-hook ~10%, slack ~10%), types (all 8 represented), projects (all 4), realistic summaries and topics. No real names or sensitive content.

Dates use anchor-relative values: `2026-01-02` through `2026-01-08`.

- [ ] **Step 3: Create demo-timeseries.json**

Matches `TimeSeriesResponse` shape with 7 daily buckets. Each bucket has `date`, `total`, `bySource`, `byType`, `byTopic`, `byProject`. Include aggregate fields: `byType`, `bySource`, `topTopics`, `projects`, `actionItemCount`, `totalInRange`, `totalAllTime`.

Totals should be consistent with demo-thoughts.json (same counts, same project/type distributions).

- [ ] **Step 4: Verify JSON is valid**

Run: `node -e "require('./ui/src/demo/demo-thoughts.json'); require('./ui/src/demo/demo-timeseries.json'); require('./ui/src/demo/demo-settings.json'); console.log('OK');"` from `private-mcp/`.

- [ ] **Step 5: Commit**

```bash
git add ui/src/demo/demo-thoughts.json ui/src/demo/demo-timeseries.json ui/src/demo/demo-settings.json
git commit -m "feat(demo): add synthetic demo data files"
```

---

### Task 4: API Layer Demo Intercept

**Files:**
- Create: `ui/src/demo/demoApi.ts`
- Modify: `ui/src/api/client.ts`

- [ ] **Step 1: Create demoApi module**

This module exports demo-mode replacements for each API method. It imports the three JSON files, applies timestamp shifting, and handles client-side pagination/filtering.

```tsx
// ui/src/demo/demoApi.ts
import rawThoughts from './demo-thoughts.json';
import rawTimeSeries from './demo-timeseries.json';
import rawSettings from './demo-settings.json';
import { shiftThoughtDates, shiftTimeSeriesDates, shiftDate } from './shiftDates';
import type { ThoughtRecord, TimeSeriesResponse, PaginatedThoughtsResponse } from '../api/types';
import type { EnrichmentSettings } from '../api/settingsTypes';

const thoughts: ThoughtRecord[] = (rawThoughts as any[]).map(shiftThoughtDates);
const timeSeries: TimeSeriesResponse = shiftTimeSeriesDates(rawTimeSeries as any);
const settings: EnrichmentSettings = rawSettings as any;

export const demoApi = {
  getTimeSeries(params?: { startDate?: string; endDate?: string; project?: string }): TimeSeriesResponse {
    if (params?.project) {
      // Filter buckets to single project
      return {
        ...timeSeries,
        buckets: timeSeries.buckets.map((b) => ({
          ...b,
          total: b.byProject[params.project!] || 0,
          byProject: params.project! in b.byProject ? { [params.project!]: b.byProject[params.project!] } : {},
        })),
      };
    }
    return timeSeries;
  },

  listThoughts(params?: {
    pageSize?: string;
    nextToken?: string;
    type?: string;
    project?: string;
  }): PaginatedThoughtsResponse {
    let filtered = thoughts;
    if (params?.type) filtered = filtered.filter((t) => t.metadata.type === params.type);
    if (params?.project) filtered = filtered.filter((t) => t.metadata.project === params.project);

    const pageSize = parseInt(params?.pageSize || '25', 10);
    const startIndex = params?.nextToken ? parseInt(params.nextToken, 10) : 0;
    const page = filtered.slice(startIndex, startIndex + pageSize);
    const hasMore = startIndex + pageSize < filtered.length;

    return {
      items: page,
      hasMore,
      nextToken: hasMore ? String(startIndex + pageSize) : undefined,
    };
  },

  getEnrichmentSettings(): EnrichmentSettings {
    return settings;
  },

  getProjects(): { projects: string[] } {
    return { projects: Object.keys(settings.projects).sort() };
  },

  search(): any[] {
    return [];
  },
};
```

- [ ] **Step 2: Modify api/client.ts to accept demo mode flag**

The `api` object methods need to check demo mode. Since `client.ts` doesn't have access to React context, the simplest approach: export a `setDemoMode(flag: boolean)` function that sets a module-level variable, and check it in each method.

In `client.ts`, add at the top:

```tsx
import { demoApi } from '../demo/demoApi';

let _demoMode = false;
export function setDemoMode(flag: boolean) { _demoMode = flag; }
```

Then in each method, add an early return. For example:

```tsx
// existing getTimeSeries method
async getTimeSeries(params) {
  if (_demoMode) return demoApi.getTimeSeries(params);
  // ... existing fetch logic
},
```

Apply the same pattern to: `listThoughts`, `getEnrichmentSettings`, `getProjects`, `search`.

Methods that are disabled in demo mode (`capture`, `editThought`, `deleteThought`, `generateNarrative`, `putEnrichmentSettings`) do not need intercepts — the UI will disable those controls.

- [ ] **Step 3: Sync demo mode flag from DemoContext**

In `App.tsx` (or a small effect component), add a `useEffect` that calls `setDemoMode(isDemoMode)` whenever the context value changes, keeping the module-level flag in sync:

```tsx
import { setDemoMode } from './api/client';
import { useDemoMode } from './contexts/DemoContext';

function DemoSync() {
  const { isDemoMode } = useDemoMode();
  useEffect(() => { setDemoMode(isDemoMode); }, [isDemoMode]);
  return null;
}
```

Render `<DemoSync />` inside `DemoProvider`.

- [ ] **Step 4: Verify Dashboard loads with demo data**

Toggle demo mode on via browser console: `localStorage.setItem('privatemcp-demo-mode', 'true')` and reload. Dashboard should show demo chart data. Toggle off: `localStorage.removeItem('privatemcp-demo-mode')` and reload.

- [ ] **Step 5: Commit**

```bash
git add ui/src/demo/demoApi.ts ui/src/api/client.ts ui/src/App.tsx
git commit -m "feat(demo): wire API layer to return demo data when flag is on"
```

---

### Task 5: Demo Banner

**Files:**
- Create: `ui/src/components/DemoBanner.tsx`
- Modify: `ui/src/App.tsx`

- [ ] **Step 1: Create DemoBanner component**

```tsx
// ui/src/components/DemoBanner.tsx
import { useDemoMode } from '../contexts/DemoContext';

export function DemoBanner() {
  const { isDemoMode } = useDemoMode();
  if (!isDemoMode) return null;

  return (
    <div style={{
      background: '#B8860B',
      color: '#fff',
      textAlign: 'center',
      padding: '8px 16px',
      fontSize: '14px',
      fontWeight: 600,
    }}>
      You're viewing demo data
    </div>
  );
}
```

- [ ] **Step 2: Add banner to App.tsx**

Insert `<DemoBanner />` after `TopNavigation` and before the scrollable content div (around line 53 in App.tsx).

- [ ] **Step 3: Verify banner appears**

Toggle demo mode on, confirm amber bar appears below top nav on all pages.

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/DemoBanner.tsx ui/src/App.tsx
git commit -m "feat(demo): add amber demo data banner"
```

---

### Task 6: Disabled Pages — Search, Reports, Capture

**Files:**
- Modify: `ui/src/pages/Search/Search.tsx`
- Modify: `ui/src/pages/Reports/Reports.tsx`
- Modify: `ui/src/pages/Capture/Capture.tsx`

- [ ] **Step 1: Add demo alert to Search**

Import `useDemoMode` and Cloudscape `Alert`. At the top of the page content (inside `ContentLayout`), conditionally render:

```tsx
{isDemoMode && (
  <Alert type="info">Search is not available in demo mode.</Alert>
)}
```

Disable the search input and button when `isDemoMode` is true (add `disabled={isDemoMode}` prop).

- [ ] **Step 2: Add demo alert to Reports**

Same pattern as Search. Alert text: "Reports are not available in demo mode." Disable the project selector, date inputs, and generate button.

- [ ] **Step 3: Add demo alert to Capture**

Same pattern. Alert text: "Capture is not available in demo mode." Disable the text input, project input, and submit button.

- [ ] **Step 4: Verify all three pages**

Toggle demo mode on, navigate to Search/Reports/Capture, confirm alert shows and controls are disabled.

- [ ] **Step 5: Commit**

```bash
git add ui/src/pages/Search/Search.tsx ui/src/pages/Reports/Reports.tsx ui/src/pages/Capture/Capture.tsx
git commit -m "feat(demo): disable Search, Reports, Capture in demo mode"
```

---

### Task 7: Browse Page Demo Adjustments

**Files:**
- Modify: `ui/src/pages/Browse/Browse.tsx`

- [ ] **Step 1: Disable delete and edit-save in demo mode**

Import `useDemoMode`. When `isDemoMode`:
- Disable the bulk delete button (the "Delete" action button)
- Remove multi-select checkboxes (set `selectionType` to `undefined` or conditionally omit it)
- In the detail/edit modal, disable the Save and Delete buttons
- Edit form can still render (shows demo data) but save is disabled

- [ ] **Step 2: Verify Browse in demo mode**

Toggle demo mode on. Confirm:
- Thoughts load from demo data
- Pagination works (next/prev page)
- Type/project filters work
- Detail modal opens and shows content
- Delete and save buttons are disabled
- No multi-select checkboxes

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/Browse/Browse.tsx
git commit -m "feat(demo): disable delete and edit-save in Browse demo mode"
```

---

### Task 8: Settings Page — Danger Zone + Read-Only Mode

**Files:**
- Modify: `ui/src/pages/Settings/Settings.tsx`

- [ ] **Step 1: Add Danger Zone section**

At the bottom of the Settings page content (before the spacer div that accounts for the fixed save bar), add a new section:

```tsx
<Container
  header={<Header variant="h2">Danger Zone</Header>}
>
  <SpaceBetween direction="horizontal" size="l" alignItems="center">
    <div>
      <Box variant="h4">Demo Mode</Box>
      <Box variant="small" color="text-body-secondary">
        Replace live data with sample data for screenshots and presentations
      </Box>
    </div>
    <Toggle
      checked={isDemoMode}
      onChange={() => toggleDemoMode()}
    />
  </SpaceBetween>
</Container>
```

Style the container with a red/warning left border: `style={{ borderLeft: '4px solid #d13212' }}` (Cloudscape error red).

- [ ] **Step 2: Disable all CRUD controls in demo mode**

When `isDemoMode`:
- Type tags: remove `onDismiss` handler (removes X buttons)
- "Add type" input + button: add `disabled` prop
- Alias tags: remove `onDismiss` handler
- "Add alias" inputs + buttons: add `disabled` prop
- Project trash icons: hide or disable
- Model selector: add `disabled` prop
- Special instructions textarea: add `disabled` prop
- Custom prompt textarea: add `disabled` prop
- "Import from captured" button: add `disabled` prop

- [ ] **Step 3: Disable save bar in demo mode**

When `isDemoMode`:
- Save button: `disabled={true}` (override dirty tracking)
- Reset to defaults button: `disabled={true}`
- Add text note: "Settings are read-only in demo mode"

The Danger Zone toggle remains functional — it's the only interactive control.

- [ ] **Step 4: Verify Settings in demo mode**

Toggle demo mode on from the Danger Zone. Confirm:
- Demo banner appears
- Settings shows demo data (from demo-settings.json)
- All controls are visually disabled (no X buttons, inputs greyed out)
- Save bar shows read-only message, buttons disabled
- Danger Zone toggle works to turn demo mode off
- Turning off restores real settings data

- [ ] **Step 5: Commit**

```bash
git add ui/src/pages/Settings/Settings.tsx
git commit -m "feat(demo): add Danger Zone toggle and read-only settings in demo mode"
```

---

### Task 9: Final Verification & Cleanup

- [ ] **Step 1: Full walkthrough**

With demo mode ON, verify each page:
1. Dashboard — charts show 7 days of demo data, stat cards populated, project modal works
2. Browse — pagination, filters, detail modal all work with demo data, delete/edit disabled
3. Search — alert shown, controls disabled
4. Reports — alert shown, controls disabled
5. Capture — alert shown, controls disabled
6. Settings — demo data displayed, all CRUD disabled, save bar disabled, Danger Zone toggle works
7. Banner visible on all pages

- [ ] **Step 2: Toggle off and verify real data returns**

Turn demo mode off from Danger Zone. Verify all pages load real data again, all controls re-enabled, banner gone.

- [ ] **Step 3: Commit any cleanup**

```bash
git commit -m "chore(demo): final polish"
```
