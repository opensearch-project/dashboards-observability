/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared schema validators for alerting route path / query parameters.
 *
 * Every value from here ends up interpolated into an upstream URL (either
 * the OpenSearch Alerting REST API or the DirectQuery Prometheus resource
 * path). Restricting the shape at the schema layer rejects malformed IDs
 * before they reach the transport, and is a lightweight defense against
 * path-traversal attempts (`..`, `/`, `%2F`) that could otherwise cross
 * route boundaries on the upstream side.
 */
import { schema } from '@osd/config-schema';

/**
 * Pattern for monitor / alert / rule IDs emitted by the OpenSearch Alerting
 * plugin (base64-ish random strings) and for Saved-Object IDs (UUIDs).
 * Allows `A-Z a-z 0-9 _ -`, length 1..128. Disallows `.`, `/`, `:`, etc.
 */
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const ID_MAX_LENGTH = 512;

/**
 * Validate a path-interpolated ID. Rejects empty strings, strings longer
 * than 512 chars, and anything outside the `[A-Za-z0-9_-]` charset.
 * Prometheus rule IDs use format {dsId}-{groupName}-{ruleName} which can
 * exceed 128 chars with long metric names.
 *
 * NOTE: Length checks are done inside `validate` because @osd/config-schema
 * with joi v17 only executes the last custom rule when both minLength/maxLength
 * and validate are specified.
 */
export const alertingIdSchema = schema.string({
  validate: (value: string) => {
    if (value.length < 1) return `value has length [0] but it must have a minimum length of [1].`;
    if (value.length > ID_MAX_LENGTH)
      return `value has length [${value.length}] but it must have a maximum length of [${ID_MAX_LENGTH}].`;
    if (!ID_PATTERN.test(value)) return 'must match /^[A-Za-z0-9_-]+$/';
  },
});

/**
 * Pattern for the composite rule id the detail route receives:
 * `{dsId}-{groupName}-{ruleName}`. Prometheus SLO rule groups and rules use
 * the `slo:rec:` / `slo:alerts:` naming convention, so the id legitimately
 * contains colons — `ID_PATTERN` would reject it (see the "contains colon"
 * case in schema_helpers.test.ts, which still applies to `alertingIdSchema`).
 *
 * `:` is the only extra character allowed over `ID_PATTERN`. Slash, dot, and
 * the rest stay disallowed so the path-traversal guard is unchanged — and the
 * composite id is only used for in-memory equality matching against the
 * fetched rule list (`getPromRuleDetail`), never interpolated into an upstream
 * URL, so even the colon never reaches a transport path.
 */
const RULE_ID_PATTERN = /^[A-Za-z0-9_:-]+$/;

export const alertingRuleIdSchema = schema.string({
  maxLength: ID_MAX_LENGTH,
  minLength: 1,
  validate: (value: string) =>
    RULE_ID_PATTERN.test(value) ? undefined : 'must match /^[A-Za-z0-9_:-]+$/',
});

/** Prometheus label name — `[a-zA-Z_:][a-zA-Z0-9_:]*`, bounded. */
const LABEL_NAME_PATTERN = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL_NAME_MAX_LENGTH = 256;

export const prometheusLabelNameSchema = schema.string({
  validate: (value: string) => {
    if (value.length < 1) return `value has length [0] but it must have a minimum length of [1].`;
    if (value.length > LABEL_NAME_MAX_LENGTH)
      return `value has length [${value.length}] but it must have a maximum length of [${LABEL_NAME_MAX_LENGTH}].`;
    if (!LABEL_NAME_PATTERN.test(value)) return 'must match /^[a-zA-Z_:][a-zA-Z0-9_:]*$/';
  },
});
