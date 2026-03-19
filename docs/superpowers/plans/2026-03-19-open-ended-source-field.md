# Open-Ended Source Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `VALID_SOURCES` allowlist with format-based regex validation so new capture clients don't require code changes.

**Architecture:** Remove the fixed array and union type, replace with a regex pattern (`/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,48}[a-zA-Z0-9])?$/`) and helper function. Update all validation points (MCP server Zod schema, REST API manual check) to use the new pattern. Clean up redundant type casts.

**Tech Stack:** TypeScript, Zod, Express

**Spec:** `docs/superpowers/specs/2026-03-19-open-ended-source-field-design.md`

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `types/validation.ts` | Remove `VALID_SOURCES`, add `SOURCE_REGEX`, `SOURCE_FORMAT_DESCRIPTION`, `isValidSource()` |
| Modify | `types/thought.ts` | Widen `ThoughtSource` from union to `string` alias |
| Modify | `lambdas/mcp-server/server.ts` | Replace `z.enum()` with `z.string().regex()` |
| Modify | `lambdas/rest-api/server.ts` | Replace `.includes()` with `isValidSource()` |
| Modify | `lambdas/process-thought/index.ts` | Remove redundant type cast |
| Modify | `lambdas/enrich-thought/index.ts` | Remove redundant type cast |

---

### Task 1: Update validation constants

**Files:**
- Modify: `types/validation.ts:33-40`

- [ ] **Step 1: Replace `VALID_SOURCES` with regex and helper**

In `types/validation.ts`, replace lines 33-40:

```typescript
// old:
export const VALID_SOURCES = [
  'mcp',
  'slack',
  'api',
  'session-summary',
  'session-hook',
  'user-prompt',
] as const;
```

With:

```typescript
export const SOURCE_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,48}[a-zA-Z0-9])?$/;
export const SOURCE_FORMAT_DESCRIPTION = 'alphanumeric and hyphens, 1-50 chars, no leading/trailing hyphens';

export function isValidSource(value: string): boolean {
  return SOURCE_REGEX.test(value);
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit`

Expected: Type errors in files that still import `VALID_SOURCES` (this is expected — we fix those in the next tasks).

- [ ] **Step 3: Commit**

```bash
git add types/validation.ts
git commit -m "feat: replace VALID_SOURCES allowlist with SOURCE_REGEX format validation"
```

---

### Task 2: Widen ThoughtSource type

**Files:**
- Modify: `types/thought.ts:11-18`

- [ ] **Step 1: Replace the union type with a string alias**

In `types/thought.ts`, replace lines 11-18:

```typescript
// old:
export type ThoughtSource =
  | 'mcp'
  | 'user-prompt'
  | 'session-summary'
  | 'session-hook'
  | 'slack'
  | 'memory-seed'
  | 'api';
```

With:

```typescript
export type ThoughtSource = string;
```

- [ ] **Step 2: Commit**

```bash
git add types/thought.ts
git commit -m "feat: widen ThoughtSource from union type to string alias"
```

---

### Task 3: Update MCP server validation

**Files:**
- Modify: `lambdas/mcp-server/server.ts:10,83`

- [ ] **Step 1: Update import**

In `lambdas/mcp-server/server.ts`, replace line 10:

```typescript
// old:
import { VALID_SOURCES, MAX_PROJECT_LENGTH, MAX_SESSION_FIELD_LENGTH } from '../../types/validation';
```

With:

```typescript
import { SOURCE_REGEX, SOURCE_FORMAT_DESCRIPTION, MAX_PROJECT_LENGTH, MAX_SESSION_FIELD_LENGTH } from '../../types/validation';
```

- [ ] **Step 2: Replace Zod enum with regex**

In `lambdas/mcp-server/server.ts`, replace line 83:

```typescript
// old:
source: z.enum(VALID_SOURCES as unknown as [string, ...string[]]).optional().default('mcp').describe('Where this thought came from'),
```

With:

```typescript
source: z.string().regex(SOURCE_REGEX).optional().default('mcp').describe(`Where this thought came from (${SOURCE_FORMAT_DESCRIPTION})`),
```

- [ ] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit`

Expected: Remaining errors only in `lambdas/rest-api/server.ts` (fixed next task).

- [ ] **Step 4: Commit**

```bash
git add lambdas/mcp-server/server.ts
git commit -m "feat: replace z.enum source validation with z.string().regex() in MCP server"
```

---

### Task 4: Update REST API validation

**Files:**
- Modify: `lambdas/rest-api/server.ts:13-23,196-198`

- [ ] **Step 1: Update import**

In `lambdas/rest-api/server.ts`, replace the import block (lines 13-23). Remove `VALID_SOURCES` from the import, add `isValidSource` and `SOURCE_FORMAT_DESCRIPTION`:

```typescript
// old:
import {
  MAX_TEXT_LENGTH,
  MAX_QUERY_LENGTH,
  MAX_LIST_LIMIT,
  MAX_SEARCH_LIMIT,
  UUID_REGEX,
  DATE_REGEX,
  VALID_THOUGHT_TYPES,
  VALID_SOURCES,
  MAX_PROJECT_LENGTH,
} from '../../types/validation';
```

With:

```typescript
import {
  MAX_TEXT_LENGTH,
  MAX_QUERY_LENGTH,
  MAX_LIST_LIMIT,
  MAX_SEARCH_LIMIT,
  UUID_REGEX,
  DATE_REGEX,
  VALID_THOUGHT_TYPES,
  isValidSource,
  SOURCE_FORMAT_DESCRIPTION,
  MAX_PROJECT_LENGTH,
} from '../../types/validation';
```

- [ ] **Step 2: Replace validation check**

In `lambdas/rest-api/server.ts`, replace lines 196-198:

```typescript
// old:
    if (req.body.source && !VALID_SOURCES.includes(req.body.source)) {
      return res.status(400).json({ error: `Invalid source. Must be one of: ${VALID_SOURCES.join(', ')}` });
    }
```

With:

```typescript
    if (req.body.source && !isValidSource(req.body.source)) {
      return res.status(400).json({ error: `Invalid source. Format: ${SOURCE_FORMAT_DESCRIPTION}` });
    }
```

- [ ] **Step 3: Verify build compiles cleanly**

Run: `npx tsc --noEmit`

Expected: No errors. All `VALID_SOURCES` references are now removed.

- [ ] **Step 4: Commit**

```bash
git add lambdas/rest-api/server.ts
git commit -m "feat: replace VALID_SOURCES.includes() with isValidSource() in REST API"
```

---

### Task 5: Clean up redundant type casts

**Files:**
- Modify: `lambdas/process-thought/index.ts:39`
- Modify: `lambdas/enrich-thought/index.ts:47`

- [ ] **Step 1: Remove cast in process-thought**

In `lambdas/process-thought/index.ts`, replace line 39:

```typescript
// old:
        source: (event.source as ProcessThoughtInput['source']) || 'api',
```

With:

```typescript
        source: event.source || 'api',
```

- [ ] **Step 2: Remove cast in enrich-thought**

In `lambdas/enrich-thought/index.ts`, replace line 47:

```typescript
// old:
    source: source as ThoughtMetadata['source'],
```

With:

```typescript
    source,
```

- [ ] **Step 3: Verify build compiles cleanly**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add lambdas/process-thought/index.ts lambdas/enrich-thought/index.ts
git commit -m "chore: remove redundant ThoughtSource type casts"
```

---

### Task 6: Build and verify deployment readiness

- [ ] **Step 1: Full build**

Run: `npm run build`

Expected: Clean build, no errors.

- [ ] **Step 2: CDK synth**

Run: `npm run synth`

Expected: CloudFormation templates generate successfully. No changes to infrastructure (this is a code-only change).

- [ ] **Step 3: Commit any build artifacts if needed**

Only if `dist/` is tracked (check `.gitignore` first).

---

### Task 7: Final verification

- [ ] **Step 1: Grep for any remaining VALID_SOURCES references**

Run: `grep -r "VALID_SOURCES" --include="*.ts" --exclude-dir=node_modules .`

Expected: No matches.

- [ ] **Step 2: Grep for any remaining ThoughtSource union patterns**

Run: `grep -rn "| 'mcp'" --include="*.ts" --exclude-dir=node_modules .`

Expected: No matches.

- [ ] **Step 3: Squash commits and push**

Squash the task commits into a single feature commit if desired, or push the commit series as-is.
