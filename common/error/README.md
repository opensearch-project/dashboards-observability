# Error classification & surfacing (`common/error`)

A small, **framework-agnostic** layer that turns opaque failures (the classic
`HTTP 500 {"message":"An internal error occurred"}`) into a **classified,
sanitized** result with a stable category, code, user-facing title/message,
remediation, retryability, and a correlation id — so both features (SLOs and
the unified alerts view) surface a clear cause instead of a generic wall.

The core is pure TypeScript: **no** imports from OpenSearch Dashboards, Kibana,
React, or EUI. Rendering (toasts/callouts) and i18n resolution live in
framework-specific adapters. This is what lets the whole `common/error/`
directory drop into a downstream fork unchanged; the fork only re-implements
the thin adapters and registers its own extras.

## Taxonomy

Provider-neutral categories (`ErrorCategory`):

| Category | Meaning |
|---|---|
| `VALIDATION` | The request was rejected as invalid (bad input, invalid query). |
| `NOT_FOUND` | The target resource does not exist. |
| `CONFLICT` | The request conflicts with current state (e.g. "already exists"). |
| `PERMISSION_DENIED` | Not authenticated (`AUTH_REQUIRED`) or not allowed (`PERMISSION_DENIED`). |
| `UPSTREAM_UNAVAILABLE` | A backend could not be reached / did not complete. |
| `TIMEOUT` | The request did not finish in time / was aborted. |
| `RATE_LIMITED` | The backend is throttling requests. |
| `PRECONDITION_FAILED` | The resource changed since it was loaded. |
| `PARTIAL_STATE` | A successful response in an unusable state (missing rule groups, unknown routing status). |
| `UNKNOWN` | Unmatched — surfaced with a **redacted** message, never a raw one. |

`code` narrows a category to a specific, actionable situation (e.g.
`RULE_GROUP_CONFLICT`, `RULE_BACKEND_UNAVAILABLE`, `RULE_CONFIG_INVALID`,
`RULES_MISSING`). Wording for each code lives in `messages.ts`.

## Pipeline

```
RawErrorContext ──▶ classifyError() ──▶ ClassifiedError ──▶ toClientPayload() ──▶ wire
                     (highest-priority        (resolved,        (exposure policy)
                      matching classifier)     localized)
```

- `classifyError(ctx)` picks the highest-`priority` classifier whose `match`
  returns true (else the `UNKNOWN` fallback), resolves wording from the catalog
  (or the classifier's inline overrides) through the registered `Translator`,
  runs any enrichers, and echoes the correlation id.
- `toClientPayload(err, { exposeSensitive })` enforces the exposure policy
  before anything reaches the browser.

## The three-tier exposure guarantee

Raw upstream text can leak deployment topology, so exposure is tiered:

1. **Server logs** — the full, un-redacted detail is always logged with the
   correlation id at the server boundary. Never dropped.
2. **`safe` details** — a **redacted** excerpt (`redactForDisplay`) is attached
   and shown by default (toast text / "View details" callout).
3. **`sensitive` details** — verbatim upstream text. **Stripped from client
   payloads by default.** Revealed only when opted in:
   - an operator sets `observability.errors.exposeSensitiveErrorDetail: true`, or
   - a downstream `ErrorDetailEnricher` opts in.

**Invariant:** the browser never receives raw upstream text unless explicitly
opted in. Even `UNKNOWN` surfaces only a redacted message.

`redactForDisplay` scrubs URLs, hostnames, IPs, ARNs, UUIDs, long opaque ids,
account-number-like runs, and long mixed tokens. It is best-effort
defense-in-depth, not a security boundary — the exposure gate above is. Known
gaps: a **single-label** hostname with no port and no dotted TLD (e.g. a bare
`cortex-ruler`) can pass through; a forker that needs stricter scrubbing should
add rules via its own enricher rather than editing core.

## Extension model — registration only, no core edits

A downstream fork extends behavior **at startup**, touching no file in
`common/error/`:

```ts
import {
  registerDefaultClassifiers,
  registerErrorClassifier,
  registerErrorDetailEnricher,
  setTranslator,
} from 'common/error';

registerDefaultClassifiers();               // core defaults
setTranslator(myFrameworkTranslate);        // @osd/i18n here, @kbn/i18n in the fork

// (a) higher-priority classifier overrides a default and can inline its own wording
registerErrorClassifier({
  name: 'myenv.ruleBackendUnavailable',
  priority: 200,                            // > any core priority (max 100)
  match: (ctx) => ctx.operation === 'rule.create.metric' && ctx.upstreamCode === 'RULER_UNREACHABLE',
  classify: () => ({
    category: 'UPSTREAM_UNAVAILABLE',
    code: 'MYENV_RULE_BACKEND_UNAVAILABLE',
    retryable: true,
    messages: { title: { id: '…', defaultMessage: '…' }, message: { id: '…', defaultMessage: '…' } },
  }),
});

// (b) enricher adds environment-specific detail (safe values are re-redacted;
//     it cannot remove safety guarantees)
registerErrorDetailEnricher({
  name: 'myenv.supportHint',
  enrich: (err) => ({ ...err, details: [...(err.details ?? []), /* … */] }),
});
```

A complete, provider-neutral example lives in
`examples/example_downstream_registration.ts` (exercised by
`__tests__/downstream_registration.test.ts`). Provider-specific names,
endpoints, ids, and phrasing belong **only** in a fork's registered
classifiers/enrichers — never in this open-source tree.

## Adapters in this repo

- **Server** — `server/routes/alerting/classified_error.ts`:
  `classifyToHandlerResult(e, { operation, logger })` builds the neutral
  context, classifies, logs full detail with a correlation id, applies the
  exposure policy, and returns a body that keeps the legacy `error` string and
  adds a structured `errorDetail` + `correlationId` (backward compatible).
- **Client** — `public/components/common/error/`:
  `extractClassifiedError(httpError)`, `showClassifiedErrorToast(...)`, and
  `<ClassifiedErrorCallout />`. These localize the wording via `@osd/i18n` and
  render safe/sensitive details appropriately.

## Portability checklist (Kibana fork)

- **Imports unchanged:** copy `common/error/` verbatim.
- **Register at startup:** `setTranslator(kbnTranslate)`, `registerDefaultClassifiers()`,
  plus the fork's own classifiers/enrichers.
- **Re-implement only the adapters:** the toast/callout components and the
  `contextFromError` boundary mapping, against the fork's HTTP/i18n APIs.
- **Do not change:** the core, the taxonomy, or the redaction defaults.
- **Priority scale:** core classifiers occupy **0–100** (state 90, ruler 80,
  timeout 60, http-status 40; upstream-wrapped 100). Downstream classifiers
  should use **200+** so they always outrank core and never collide with it.
- **Shared test harnesses:** `registerDefaultClassifiers()` is idempotent via a
  module `defaultsRegistered` flag. A harness that registers into the same
  process more than once (or wants to re-register after a reset) must call
  `__resetRegistryForTests()` + `__resetDefaultsFlagForTests()` first.
