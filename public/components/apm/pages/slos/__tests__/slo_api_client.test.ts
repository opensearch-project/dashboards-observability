/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HttpStart } from '../../../../../../../../src/core/public';
import {
  extractRulerErrorEnvelope,
  RepairResponse,
  RuleHealthResponse,
  SloApiClient,
} from '../slo_api_client';

describe('extractRulerErrorEnvelope', () => {
  it('returns null for non-error inputs', () => {
    expect(extractRulerErrorEnvelope(null)).toBeNull();
    expect(extractRulerErrorEnvelope(undefined)).toBeNull();
    expect(extractRulerErrorEnvelope('oops')).toBeNull();
    expect(extractRulerErrorEnvelope(new Error('network'))).toBeNull();
  });

  it('returns null when attributes is absent or unrecognized', () => {
    expect(extractRulerErrorEnvelope({ body: { message: 'oops' } })).toBeNull();
    expect(
      extractRulerErrorEnvelope({
        body: { message: 'oops', attributes: { code: 'SOME_OTHER_CODE' } },
      })
    ).toBeNull();
  });

  it('extracts a RULER_VALIDATION_FAILED envelope from the OSD error body', () => {
    // Shape mirrors res.customError({ body: { message, attributes } }) →
    // IHttpFetchError.body = { message, attributes }.
    const err = {
      body: {
        message: 'Ruler rejected',
        attributes: {
          error: 'Ruler rejected',
          code: 'RULER_VALIDATION_FAILED',
          httpStatus: 400,
          rawBody: 'invalid PromQL: parse error at char 42',
        },
      },
    };
    expect(extractRulerErrorEnvelope(err)).toEqual({
      error: 'Ruler rejected',
      code: 'RULER_VALIDATION_FAILED',
      httpStatus: 400,
      rawBody: 'invalid PromQL: parse error at char 42',
    });
  });

  it('extracts RULER_AUTH_FAILED and RULER_UNREACHABLE variants', () => {
    const auth = {
      body: {
        attributes: {
          error: 'auth',
          code: 'RULER_AUTH_FAILED',
          httpStatus: 401,
          rawBody: 'no org id',
        },
      },
    };
    const unreachable = {
      body: {
        attributes: {
          error: 'unreachable',
          code: 'RULER_UNREACHABLE',
          httpStatus: 0,
          rawBody: 'connection refused',
        },
      },
    };
    expect(extractRulerErrorEnvelope(auth)?.code).toBe('RULER_AUTH_FAILED');
    expect(extractRulerErrorEnvelope(unreachable)?.code).toBe('RULER_UNREACHABLE');
  });

  it('defaults missing optional fields', () => {
    const env = extractRulerErrorEnvelope({
      body: { attributes: { code: 'RULER_VALIDATION_FAILED' } },
    });
    expect(env).toEqual({
      error: 'Ruler dual-write failed',
      code: 'RULER_VALIDATION_FAILED',
      httpStatus: 0,
      rawBody: '',
    });
  });
});

/** Minimal HttpStart stub: only the verbs the client uses here. */
function makeHttpMock() {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
}

describe('SloApiClient.repair', () => {
  const ruleHealth: RuleHealthResponse = {
    sloId: 'slo-1',
    state: 'ok',
    expectedGroups: ['slo-1-group'],
    presentGroups: ['slo-1-group'],
    missingGroups: [],
    computedAt: '2026-04-28T00:00:00Z',
  };

  it('POSTs to /api/observability/v1/slos/{id}/repair and resolves with the mocked body', async () => {
    const http = makeHttpMock();
    const body: RepairResponse = { sloId: 'slo-1', repaired: true, health: ruleHealth };
    http.post.mockResolvedValueOnce(body);

    const client = new SloApiClient((http as unknown) as HttpStart);
    const res = await client.repair('slo-1');

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith('/api/observability/v1/slos/slo-1/repair');
    expect(res).toEqual(body);
  });

  it('URL-encodes ids that contain slashes and spaces', async () => {
    const http = makeHttpMock();
    http.post.mockResolvedValueOnce({ sloId: 'foo/bar baz', repaired: false, health: ruleHealth });

    const client = new SloApiClient((http as unknown) as HttpStart);
    await client.repair('foo/bar baz');

    expect(http.post).toHaveBeenCalledWith('/api/observability/v1/slos/foo%2Fbar%20baz/repair');
  });

  it('surfaces a ruler envelope from a thrown http error via extractRulerErrorEnvelope', async () => {
    const http = makeHttpMock();
    const thrown = {
      body: {
        message: 'Ruler rejected',
        attributes: {
          error: 'Ruler rejected',
          code: 'RULER_VALIDATION_FAILED',
          httpStatus: 400,
          rawBody: 'invalid PromQL',
        },
      },
    };
    http.post.mockRejectedValueOnce(thrown);

    const client = new SloApiClient((http as unknown) as HttpStart);
    const err = await client.repair('slo-1').catch((e) => e);

    expect(extractRulerErrorEnvelope(err)).toEqual({
      error: 'Ruler rejected',
      code: 'RULER_VALIDATION_FAILED',
      httpStatus: 400,
      rawBody: 'invalid PromQL',
    });
  });

  it('bubbles up non-ruler http errors unchanged', async () => {
    const http = makeHttpMock();
    const thrown = { body: { message: 'boom' } };
    http.post.mockRejectedValueOnce(thrown);

    const client = new SloApiClient((http as unknown) as HttpStart);
    const err = await client.repair('slo-1').catch((e) => e);

    expect(err).toBe(thrown);
    expect(extractRulerErrorEnvelope(err)).toBeNull();
  });
});

describe('SloApiClient.getRuleHealth', () => {
  const health: RuleHealthResponse = {
    sloId: 'slo-1',
    state: 'rules_missing',
    expectedGroups: ['slo-1-group'],
    presentGroups: [],
    missingGroups: ['slo-1-group'],
    computedAt: '2026-04-28T00:00:00Z',
  };

  it('GETs /api/observability/v1/slos/{id}/rule_health and resolves with the mocked body', async () => {
    const http = makeHttpMock();
    http.get.mockResolvedValueOnce(health);

    const client = new SloApiClient((http as unknown) as HttpStart);
    const res = await client.getRuleHealth('slo-1');

    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith('/api/observability/v1/slos/slo-1/rule_health');
    expect(res).toEqual(health);
  });

  it('URL-encodes ids that contain slashes and spaces', async () => {
    const http = makeHttpMock();
    http.get.mockResolvedValueOnce(health);

    const client = new SloApiClient((http as unknown) as HttpStart);
    await client.getRuleHealth('foo/bar baz');

    expect(http.get).toHaveBeenCalledWith('/api/observability/v1/slos/foo%2Fbar%20baz/rule_health');
  });

  it('surfaces a ruler envelope from a thrown http error via extractRulerErrorEnvelope', async () => {
    const http = makeHttpMock();
    const thrown = {
      body: {
        message: 'Ruler unreachable',
        attributes: {
          error: 'Ruler unreachable',
          code: 'RULER_UNREACHABLE',
          httpStatus: 0,
          rawBody: 'connection refused',
        },
      },
    };
    http.get.mockRejectedValueOnce(thrown);

    const client = new SloApiClient((http as unknown) as HttpStart);
    const err = await client.getRuleHealth('slo-1').catch((e) => e);

    expect(extractRulerErrorEnvelope(err)).toEqual({
      error: 'Ruler unreachable',
      code: 'RULER_UNREACHABLE',
      httpStatus: 0,
      rawBody: 'connection refused',
    });
  });

  it('bubbles up non-ruler http errors unchanged', async () => {
    const http = makeHttpMock();
    const thrown = new Error('network');
    http.get.mockRejectedValueOnce(thrown);

    const client = new SloApiClient((http as unknown) as HttpStart);
    const err = await client.getRuleHealth('slo-1').catch((e) => e);

    expect(err).toBe(thrown);
    expect(extractRulerErrorEnvelope(err)).toBeNull();
  });
});
