/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Proves the registration-only extension model: a downstream-style
 * registration overrides a default classifier and adds `safe` detail, using
 * only generic placeholder content — touching no core file.
 */

import { __resetDefaultsFlagForTests, registerDefaultClassifiers } from '../index';
import { __resetRegistryForTests, classifyError, toClientPayload } from '../registry';
import { registerExampleDownstreamExtensions } from '../examples/example_downstream_registration';

const ctx = {
  operation: 'rule.create.metric',
  upstreamCode: 'RULER_UNREACHABLE',
  httpStatus: 503,
};

describe('downstream registration', () => {
  beforeEach(() => {
    __resetRegistryForTests();
    __resetDefaultsFlagForTests();
    registerDefaultClassifiers();
  });

  it('default (no downstream) classifies with core wording', () => {
    const out = classifyError(ctx);
    expect(out.code).toBe('RULE_BACKEND_UNAVAILABLE');
    expect(out.title).toBe('Rule service unavailable');
  });

  it('downstream override wins and supplies its own wording + safe detail', () => {
    registerExampleDownstreamExtensions();
    const out = classifyError(ctx);

    // The higher-priority classifier overrides the default code + wording.
    expect(out.code).toBe('EXAMPLE_RULE_BACKEND_UNAVAILABLE');
    expect(out.title).toBe('Rule service is temporarily unavailable');
    expect(out.message).toContain('<namespace>');

    // Its safe detail is present...
    const hint = out.details?.find((d) => d.key === 'upstreamStatus');
    expect(hint?.value).toContain('<namespace>');

    // ...and the enricher appended a further safe breadcrumb.
    const support = out.details?.find((d) => d.key === 'exampleSupportHint');
    expect(support?.value).toContain('<namespace>');

    // Safe details survive the default (sensitive-stripping) client payload.
    const payload = toClientPayload(out);
    expect(payload.details?.some((d) => d.key === 'exampleSupportHint')).toBe(true);
  });
});
