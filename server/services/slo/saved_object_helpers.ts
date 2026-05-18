/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Cross-store helpers for inspecting SavedObjectsClient errors. Both
 * `slo_saved_object_store.ts` and `slo_rule_ref_store.ts` need to
 * distinguish 404 / 409 outcomes from genuine failures; sniffing the
 * `output.statusCode` / `statusCode` shape avoids depending on Boom
 * internals which are awkward to construct in unit-test mocks.
 */

export function isSavedObjectNotFound(err: unknown): boolean {
  const e = err as { output?: { statusCode?: number }; statusCode?: number } | undefined;
  return e?.output?.statusCode === 404 || e?.statusCode === 404;
}

export function isSavedObjectConflict(err: unknown): boolean {
  const e = err as { output?: { statusCode?: number }; statusCode?: number } | undefined;
  return e?.output?.statusCode === 409 || e?.statusCode === 409;
}
