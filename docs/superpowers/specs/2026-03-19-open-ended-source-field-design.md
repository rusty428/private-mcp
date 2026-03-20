# Design: Open-Ended Source Field

**Date:** 2026-03-19
**Status:** Approved
**Scope:** `types/validation.ts`, `types/thought.ts`, `lambdas/mcp-server/server.ts`, `lambdas/rest-api/server.ts`, `lambdas/process-thought/index.ts`, `lambdas/enrich-thought/index.ts`, docs

## Problem

`VALID_SOURCES` is a hardcoded allowlist of 6 strings in `types/validation.ts`. Every new capture client (OpenClaw, Cursor, Windsurf, etc.) requires a code change and deploy just to add a string to this list. The source field is primarily metadata used for filtering, display, and stats aggregation. The API key is the trust boundary, not the source field. While two places reference specific source values — `stripFraming.ts` checks `source === 'user-prompt'` and `buildPrompt.ts` provides source-specific LLM guidance — these are best-effort hints, not gatekeeping logic. Unknown sources fall through gracefully (no stripping, generic classification guidance).

Additionally, `ThoughtSource` in `types/thought.ts` is a separate union type that is already out of sync with `VALID_SOURCES` (it includes `memory-seed`, the array does not).

## Design

Replace the fixed allowlist with a format constraint.

### Format Constraint

- Alphanumeric characters (mixed case) and hyphens only
- 1-50 characters
- No leading or trailing hyphens

Regex: `/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,48}[a-zA-Z0-9])?$/`

Case is preserved as-is — `OpenClaw`, `mcp`, `RustyNations` are all valid. This supports human-friendly display names for a future multi-user scenario.

### Default Value

`'mcp'` remains the default when source is omitted (unchanged).

## Changes

### 1. `types/validation.ts`

- Remove `VALID_SOURCES` array
- Add `SOURCE_REGEX` constant with the format regex
- Add `SOURCE_FORMAT_DESCRIPTION` string constant for human-readable error messages (shared between MCP and REST API): "alphanumeric and hyphens, 1-50 chars, no leading/trailing hyphens"
- Add `isValidSource(value: string): boolean` helper function

### 2. `types/thought.ts`

- Change `ThoughtSource` from a union type to a type alias: `type ThoughtSource = string`
- Preserves semantic intent in function signatures while allowing any valid source string
- This resolves the existing sync issue with `memory-seed`

### 3. `lambdas/mcp-server/server.ts`

- Replace `z.enum(VALID_SOURCES as unknown as [string, ...string[]])` with `z.string().regex(SOURCE_REGEX)`
- Keep `.optional().default('mcp')`
- Update the `.describe()` text to explain the format constraint instead of listing values

### 4. `lambdas/rest-api/server.ts`

- Replace `VALID_SOURCES.includes(req.body.source)` with `isValidSource(req.body.source)`
- Update the error message from listing valid values to describing the format (alphanumeric + hyphens, 1-50 chars)
- Remove `VALID_SOURCES` from imports

### 5. `lambdas/process-thought/index.ts`

- Remove the no-op cast `(event.source as ProcessThoughtInput['source'])` — with `ThoughtSource` as `string`, this cast is redundant

### 6. `lambdas/enrich-thought/index.ts`

- Remove the no-op cast `source as ThoughtMetadata['source']` — same reason

### 7. Documentation

- Update `CLAUDE.md` MCP Tools table if it references valid source values
- Update any inline comments that reference the fixed list

## What Does Not Change

- **DynamoDB schema / GSIs / S3 Vectors metadata** — source is already stored as a plain string
- **UI** — all charts, tables, and filters already render source values dynamically
- **`triageThought`** — receives source but does not branch on it
- **Daily summary / reports** — aggregate by `bySource` dynamically using `Object.entries()`
- **Default value** — `'mcp'` remains the default

## Migration

None required. All existing source values match the new regex:

| Value | Matches? |
|---|---|
| `mcp` | Yes |
| `slack` | Yes |
| `api` | Yes |
| `session-summary` | Yes |
| `session-hook` | Yes |
| `user-prompt` | Yes |
| `memory-seed` | Yes |

## Risks

- **Typo and case fragmentation**: A client sending `OpenClaw` vs `openclaw` vs `open-claw` would create separate source entries in stats. Mitigation: this is a documentation/convention problem, not a validation problem. The format constraint prevents truly garbage values (spaces, special chars, empty strings). If case-insensitive grouping is needed later, normalize at the query/aggregation layer.
- **Unbounded cardinality**: If many distinct sources appear, UI charts could get noisy. Mitigation: current UI already handles dynamic source counts. If this becomes an issue later, the UI can group low-count sources — that's a presentation concern, not a data model concern.
- **No source-specific enrichment guidance for new sources**: `buildPrompt.ts` gives the LLM classifier hints like "mcp source: intentional capture, likely high quality." New sources like `openclaw` get no specific guidance — the classifier treats them generically. This is acceptable; the hints are best-effort and the classifier works without them.
