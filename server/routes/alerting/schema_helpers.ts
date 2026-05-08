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
const ID_MAX_LENGTH = 128;

/**
 * Validate a path-interpolated ID. Rejects empty strings, strings longer
 * than 128 chars, and anything outside the `[A-Za-z0-9_-]` charset.
 */
export const alertingIdSchema = schema.string({
  maxLength: ID_MAX_LENGTH,
  minLength: 1,
  validate: (value: string) =>
    ID_PATTERN.test(value) ? undefined : 'must match /^[A-Za-z0-9_-]+$/',
});

/** Prometheus label name — `[a-zA-Z_:][a-zA-Z0-9_:]*`, bounded. */
const LABEL_NAME_PATTERN = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL_NAME_MAX_LENGTH = 256;

export const prometheusLabelNameSchema = schema.string({
  maxLength: LABEL_NAME_MAX_LENGTH,
  minLength: 1,
  validate: (value: string) =>
    LABEL_NAME_PATTERN.test(value) ? undefined : 'must match /^[a-zA-Z_:][a-zA-Z0-9_:]*$/',
});
