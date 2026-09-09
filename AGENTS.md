# AGENTS.md

Guidance for AI coding and review agents working in **dashboards-observability** (the OpenSearch
Dashboards Observability plugin). Human contributors should read `DEVELOPER_GUIDE.md` and
`CONTRIBUTING.md`; this file encodes the additional conventions this repo expects agents to follow.

Applies to the whole repo. A more specific `AGENTS.md` deeper in the tree, or an explicit user
instruction, overrides anything here.

---

## 1. Repo shape

This is a **plugin that lives inside OpenSearch Dashboards (OSD)**. It is checked out at
`OpenSearch-Dashboards/plugins/dashboards-observability` and almost every script shells out to the
OSD root (`../../scripts/...`, `../../node_modules/...`). You cannot build or test it standalone.

```
common/     code shared between server/ and public/ (types, constants, utils, query_manager, slo)
public/     browser code (React, redux, components, application pages)
server/     Node code (routes, adaptors, services)
common/ (per-component)   e.g. public/components/apm/common, trace_analytics/.../common
.cypress/   Cypress e2e specs
test/       jest config
```

Key top-level docs already present: `DEVELOPER_GUIDE.md`, `CONTRIBUTING.md`, `MAINTAINERS.md`.

---

## 2. Build, test, lint

Use the correct Node version first: OSD pins it in `.node-version` at the OSD root (use `nvm`).

- **Bootstrap** (from the OSD root, not here): `yarn osd bootstrap`
- **Unit tests**: `yarn test` (jest, config `./test/jest.config.js`). To run a single suite, invoke
  jest directly with a path, e.g. `../../node_modules/.bin/jest --config ./test/jest.config.js <path>`.
- **Lint**: `yarn lint` (eslint). Fix lint before finishing.
- **Build**: `yarn build` (`plugin-helpers build`).
- **Cypress (e2e)**: `yarn cypress:run` / `yarn cypress:open`. These run against a **real** backend
  (see §4, Tests).

Do not hand-edit `yarn.lock`. Regenerate it through the OSD bootstrap flow. Transitive-dependency
CVE fixes go through a `resolutions` entry in `package.json`, then re-bootstrap.

---

## 3. Conventions for DEV agents (writing code)

These are the house rules. Violating them is what review will flag, so build to them:

1. **Feature flags must be airtight.** Code gated by a flag must be fully inert when the flag is
   off, on BOTH the server and public sides. No behavior, request, or UI may leak before/after the
   flag boundary.
2. **Constants and types live in a `common/` folder.** Anything shared between `server/` and
   `public/` goes in the top-level `common/`. Otherwise co-locate under
   `public/components/<component>/common` (or `service/<component>/common`) per existing convention.
   Do not scatter shared constants/types into component files.
3. **No new dependencies without a clear reason.** Any change to `package.json` /
   `opensearch_dashboards.json` gets extra scrutiny. Prefer what's already in the tree.
4. **No new backend query routes.** Do not add server routes that query OpenSearch or Prometheus
   for search. Those MUST go through the query-enhancements API in core. Log/trace queries use
   **datasets**; datasources always come from **saved objects** (never a raw OpenSearch client, a
   custom Prometheus client, or a hardcoded index/cluster regex).
5. **No new saved-object types unless unavoidable.** A new SO is a long-term migration/removal
   burden. If you must add one, the schema has to be deliberate and forward-compatible, and it must
   actually be used correctly.
6. **Logging is deliberate.** No stray `console.log` / `console.debug` in public or server code.
   `console.error` inside a `try/catch` on the public side is acceptable when the error is also
   surfaced to the user.
7. **Every error surfaces.** Errors reach the user as a toast or an inline warning/callout, and are
   distinguished from empty/no-data states. Never silently swallow (a bare `catch` that only logs,
   or an empty result standing in for a failed query, is a bug).
8. **Bound anything data-intensive.** Queries, API calls, and tables must paginate or cap where
   possible. Flag/avoid anything that can blow up with large data. When component state gets heavy,
   reach for redux or a `useReducer`, not a pile of `useState`.
9. **Prefer OUI components; use echarts for charts.** Custom UI only when it genuinely improves UX.
   **Do not** introduce vega or legacy elastic-charts.
10. **New filter UI matches the APM services / application-map filter-sidebar paradigm** (search,
    select all / clear all, capped list with `+N more`, truncation with hover tooltip, scroll when
    expanded). Mirror the existing Attributes/Environment filters rather than inventing a new look.
11. **Tests ship with the code.** New component logic needs full unit coverage. Cypress tests must
    exercise a **real** backend — a Cypress test backed by mocked APIs is no better than a unit test
    and will be flagged. Wire `data-test-subj` hooks for anything a functional test needs.

---

## 4. Conventions for REVIEW agents

When reviewing a PR in this repo, follow this exact process.

### Scope — the single most important rule

**Scope ONLY to `gh pr diff <pr> --name-only`. NEVER derive scope from `git diff main` /
`upstream/main` / a `merge-base` against main.** These PRs are routinely stacked on a large feature
branch that is not yet in local `main`, so diffing against main reports HUNDREDS of unrelated files
(phantom new saved objects, dependency bumps, server services) and produces false findings. This
trap has bitten real reviews. The authoritative file list is `gh pr diff --name-only`, full stop.
Read the PR head (`gh pr diff` / check out `pull/<pr>/head`) for context, but scope is the diff.

### Verify before asserting

Read the actual files at the PR head and ground every finding in `file:line`. Do not flag from a
diff hunk alone when surrounding code changes the answer. Confirm the PR's own claims (tests added,
flag behavior, "no API impact") against the code. If you can't verify it, drop it.

### What to check

Walk the dev conventions in §3 as a checklist, highest-signal first: feature-flag leaks →
`common/` placement → new deps → new query routes / datasources-from-saved-objects → logging
hygiene → unbounded/pagination → error surfacing → new saved objects → OUI/echarts (no vega) →
filter-sidebar parity → test coverage (unit + real-backend Cypress).

### Priority tags and tone

- Use `p0` / `p1` / `p2` tags. `p0` = must-fix/broken; `p1` = should-fix; `p2` = nit/optional.
  Don't use words like "blocking", "issue", "risk" as the label.
- Markdown headings start at `h3` (`###`) and heading text is lowercase.
- No emojis. No em-dashes.
- Phrase findings as concrete, actionable suggestions, often as a question. Credit what's done well.
  Note when something is pre-existing (out of scope) rather than introduced by the PR.

### How a review is delivered

A posted review is **a summary review body + individually posted inline comments** — never one
bundled review with the findings crammed into a `comments[]` array.

- Each finding is its own inline comment anchored to `commit_id` + `path` + `line` + `side=RIGHT`
  via `POST /repos/<owner>/<repo>/pulls/<pr>/comments`.
- The summary (overall verdict + headline findings) is posted separately as a review body via
  `POST /repos/<owner>/<repo>/pulls/<pr>/reviews` with `event: COMMENT` and `body` only.
- Inline anchors MUST land on an **added (`+`) line** of the diff or GitHub returns 422. Verify each
  anchor against the parsed diff before posting.
- Anchor everything to the PR **head SHA**, and re-check the head hasn't moved before posting (abort
  and re-verify if it did).
- **Never post without explicit human approval**, and never `APPROVE` / `REQUEST_CHANGES` unless the
  human explicitly asks for that event. Default to showing the draft and waiting.

---

## 5. General agent etiquette

- Match the surrounding code's style, naming, and comment density.
- Prefer editing existing files over adding new ones; don't create docs unless asked.
- Report outcomes honestly: if tests fail, say so with the output; if a step was skipped, say that.
- Confirm before hard-to-reverse or outward-facing actions (pushing, posting, deleting).
