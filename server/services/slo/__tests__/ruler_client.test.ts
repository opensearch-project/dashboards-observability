/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Ruler client tests — pins the DirectQuery contract:
 *   - Path shape:  /_plugins/_directquery/_resources/{encoded-dqName}/api/v1/rules/{encoded-ns}[/{group}]
 *   - HTTP method: POST for upsert, DELETE for delete
 *   - Body shape:  POST body is YAML serializing the GeneratedRuleGroup
 *   - Error surface: SloRulerError with stable code + upstream status + raw body
 *   - No retry: transport.request called exactly once on failure
 */

import { dump as yamlDump, load as yamlLoad } from 'js-yaml';
import { DirectQueryRulerClient, ruleGroupToYaml } from '../ruler_client';
import { SloRulerError } from '../../../../common/slo/slo_errors';
import type { AlertingOSClient, Datasource, Logger } from '../../../../common/types/alerting';
import type { GeneratedRuleGroup } from '../../../../common/slo/slo_types';

function noopLogger(): Logger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

function mockClient(
  handler?: (params: unknown) => Promise<unknown>
): {
  client: AlertingOSClient;
  requestMock: jest.Mock;
} {
  const requestMock = jest.fn(async (params: unknown) => {
    if (handler) return handler(params);
    return { statusCode: 200, body: {} };
  });
  return {
    client: ({ transport: { request: requestMock } } as unknown) as AlertingOSClient,
    requestMock,
  };
}

function promDatasource(overrides: Partial<Datasource> = {}): Datasource {
  return {
    id: 'ds-1',
    name: 'my Cortex',
    type: 'prometheus',
    url: '',
    enabled: true,
    directQueryName: 'my-cortex-connection',
    ...overrides,
  };
}

function sampleGroup(): GeneratedRuleGroup {
  return {
    groupName: 'slo:checkout_api_availability_a1b2c3d4',
    interval: 60,
    rules: [
      {
        type: 'recording',
        name: 'slo:sli_error:ratio_rate_5m:checkout_a1b2c3d4',
        expr: '1 - (sum(rate(m{s="a"}[5m])) / sum(rate(m{s="a"}[5m])))',
        labels: { slo_id: 'slo-1', slo_name: 'checkout', slo_window: '5m' },
        description: 'rec',
      },
      {
        type: 'alerting',
        name: 'SLO_BurnRate_PageQuick_checkout_a1b2c3d4',
        expr: 'foo{a="b"} > 0.5\nand\nbar > 0.5',
        for: '2m',
        labels: { slo_severity: 'critical', slo_alarm_type: 'burn_rate' },
        annotations: { summary: 'burn rate 14.4x' },
        description: 'alert',
      },
    ],
    yaml: '',
  };
}

describe('ruleGroupToYaml', () => {
  it('serializes to valid YAML that round-trips through js-yaml with the expected shape', () => {
    const yaml = ruleGroupToYaml(sampleGroup());
    const parsed = yamlLoad(yaml) as {
      name: string;
      interval: string;
      rules: Array<Record<string, unknown>>;
    };
    expect(parsed.name).toBe('slo:checkout_api_availability_a1b2c3d4');
    expect(parsed.interval).toBe('1m');
    expect(parsed.rules).toHaveLength(2);
    expect(parsed.rules[0]).toMatchObject({
      record: 'slo:sli_error:ratio_rate_5m:checkout_a1b2c3d4',
    });
    expect(parsed.rules[1]).toMatchObject({
      alert: 'SLO_BurnRate_PageQuick_checkout_a1b2c3d4',
      for: '2m',
    });
    expect((parsed.rules[0] as { expr: string }).expr).toContain('sum(rate(m{');
    // alerting rule preserves annotations
    expect((parsed.rules[1] as { annotations: Record<string, string> }).annotations.summary).toBe(
      'burn rate 14.4x'
    );
  });

  it('omits labels/annotations when empty so the YAML is tidy', () => {
    const group: GeneratedRuleGroup = {
      groupName: 'g1',
      interval: 60,
      rules: [
        {
          type: 'recording',
          name: 'r1',
          expr: 'vector(1)',
          labels: {},
          description: '',
        },
      ],
      yaml: '',
    };
    const yaml = ruleGroupToYaml(group);
    expect(yaml).not.toContain('labels:');
    expect(yaml).not.toContain('annotations:');
  });
});

describe('DirectQueryRulerClient.upsertRuleGroup', () => {
  it('POSTs to /_plugins/_directquery/_resources/{dqName}/api/v1/rules/{namespace} with YAML body', async () => {
    const { client, requestMock } = mockClient();
    const svc = new DirectQueryRulerClient(noopLogger());
    await svc.upsertRuleGroup(
      client,
      promDatasource({ directQueryName: 'my cortex' }), // space to force encoding
      'slo-generated-ws1',
      sampleGroup()
    );

    expect(requestMock).toHaveBeenCalledTimes(1);
    const call = requestMock.mock.calls[0][0] as {
      method: string;
      path: string;
      body: string;
    };
    expect(call.method).toBe('POST');
    expect(call.path).toBe(
      '/_plugins/_directquery/_resources/my%20cortex/api/v1/rules/slo-generated-ws1'
    );
    expect(typeof call.body).toBe('string');
    const parsed = yamlLoad(call.body) as { name: string; rules: unknown[] };
    expect(parsed.name).toBe('slo:checkout_api_availability_a1b2c3d4');
    expect(parsed.rules).toHaveLength(2);
  });

  it('throws if the datasource has no directQueryName', async () => {
    const { client } = mockClient();
    const svc = new DirectQueryRulerClient(noopLogger());
    await expect(
      svc.upsertRuleGroup(
        client,
        promDatasource({ directQueryName: undefined }),
        'ns',
        sampleGroup()
      )
    ).rejects.toThrow(/no directQueryName/);
  });
});

describe('DirectQueryRulerClient.deleteRuleGroup', () => {
  it('DELETEs to /_plugins/_directquery/_resources/{dqName}/api/v1/rules/{namespace}/{groupName}', async () => {
    const { client, requestMock } = mockClient();
    const svc = new DirectQueryRulerClient(noopLogger());
    await svc.deleteRuleGroup(client, promDatasource(), 'slo-generated-ws1', 'slo:group_abcd');

    expect(requestMock).toHaveBeenCalledTimes(1);
    const call = requestMock.mock.calls[0][0] as { method: string; path: string };
    expect(call.method).toBe('DELETE');
    expect(call.path).toBe(
      '/_plugins/_directquery/_resources/my-cortex-connection/api/v1/rules/slo-generated-ws1/slo%3Agroup_abcd'
    );
  });
});

describe('DirectQueryRulerClient error classification', () => {
  // Helper that rejects with a synthetic OpenSearch transport error.
  function rejectWith(err: unknown) {
    return mockClient(() => {
      return Promise.reject(err);
    });
  }

  it('400 → RULER_VALIDATION_FAILED preserves rawBody and httpStatus', async () => {
    const { client, requestMock } = rejectWith({
      statusCode: 400,
      body: { message: 'rule group exceeds maximum size' },
    });
    const svc = new DirectQueryRulerClient(noopLogger());
    await expect(
      svc.upsertRuleGroup(client, promDatasource(), 'ns', sampleGroup())
    ).rejects.toMatchObject({
      name: 'SloRulerError',
      code: 'RULER_VALIDATION_FAILED',
      httpStatus: 400,
      rawBody: expect.stringContaining('rule group exceeds maximum size'),
    });
    expect(requestMock).toHaveBeenCalledTimes(1); // no retry
  });

  it('401 → RULER_AUTH_FAILED', async () => {
    const { client } = rejectWith({ statusCode: 401, body: 'no org id' });
    const svc = new DirectQueryRulerClient(noopLogger());
    await expect(
      svc.upsertRuleGroup(client, promDatasource(), 'ns', sampleGroup())
    ).rejects.toMatchObject({
      name: 'SloRulerError',
      code: 'RULER_AUTH_FAILED',
      httpStatus: 401,
      rawBody: 'no org id',
    });
  });

  it('403 → RULER_AUTH_FAILED', async () => {
    const { client } = rejectWith({ statusCode: 403, body: 'forbidden' });
    const svc = new DirectQueryRulerClient(noopLogger());
    await expect(
      svc.upsertRuleGroup(client, promDatasource(), 'ns', sampleGroup())
    ).rejects.toMatchObject({ code: 'RULER_AUTH_FAILED', httpStatus: 403 });
  });

  it('503 → RULER_UNREACHABLE', async () => {
    const { client, requestMock } = rejectWith({
      statusCode: 503,
      body: 'upstream timeout',
    });
    const svc = new DirectQueryRulerClient(noopLogger());
    await expect(
      svc.upsertRuleGroup(client, promDatasource(), 'ns', sampleGroup())
    ).rejects.toMatchObject({ code: 'RULER_UNREACHABLE', httpStatus: 503 });
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it('network error (no statusCode) → RULER_UNREACHABLE', async () => {
    const netErr = Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' });
    const { client, requestMock } = rejectWith(netErr);
    const svc = new DirectQueryRulerClient(noopLogger());
    await expect(
      svc.upsertRuleGroup(client, promDatasource(), 'ns', sampleGroup())
    ).rejects.toMatchObject({
      code: 'RULER_UNREACHABLE',
      httpStatus: 0,
      rawBody: 'ECONNREFUSED',
    });
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it('extracts status from error.meta.statusCode when top-level absent', async () => {
    const { client } = rejectWith({
      message: 'wrapped',
      meta: { statusCode: 400, body: { reason: 'invalid PromQL' } },
    });
    const svc = new DirectQueryRulerClient(noopLogger());
    await expect(
      svc.upsertRuleGroup(client, promDatasource(), 'ns', sampleGroup())
    ).rejects.toBeInstanceOf(SloRulerError);
    await expect(
      svc.upsertRuleGroup(client, promDatasource(), 'ns', sampleGroup())
    ).rejects.toMatchObject({
      code: 'RULER_VALIDATION_FAILED',
      httpStatus: 400,
      rawBody: expect.stringContaining('invalid PromQL'),
    });
  });

  it('deleteRuleGroup classifies auth failures the same way', async () => {
    const { client, requestMock } = rejectWith({ statusCode: 401, body: 'unauth' });
    const svc = new DirectQueryRulerClient(noopLogger());
    await expect(
      svc.deleteRuleGroup(client, promDatasource(), 'ns', 'group-1')
    ).rejects.toMatchObject({ code: 'RULER_AUTH_FAILED', httpStatus: 401 });
    expect(requestMock).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Ruler probe (getRuleGroup, listRuleGroups, 404-tolerant delete)
// ============================================================================

/**
 * Build a transport handler that inspects the requested path/method and
 * returns/rejects accordingly. Mirrors `mockClient` but with a richer matcher
 * so probe tests can assert the exact path + method in one place.
 */
function rejectWithStatus(statusCode: number, body: unknown) {
  return { statusCode, body };
}

describe('DirectQueryRulerClient.getRuleGroup', () => {
  /**
   * getRuleGroup delegates to listRuleGroups + filter — a GET on
   * `{ns}/{groupName}` returns HTTP 405 via the SQL plugin's resource router,
   * so we cannot probe single groups directly. See ruler_client.ts for the
   * upstream trace.
   */

  it('delegates to listRuleGroups (Prometheus envelope) and filters by groupName', async () => {
    const { client, requestMock } = mockClient(async () => ({
      statusCode: 200,
      body: {
        status: 'success',
        data: {
          groups: [
            {
              file: 'slo-generated-ws1',
              name: 'slo:group_aaa',
              interval: '1m',
              rules: [{ record: 'rec_a', expr: 'vector(1)' }],
            },
            {
              file: 'slo-generated-ws1',
              name: 'slo:group_bbb',
              interval: '2m',
              rules: [{ alert: 'Alert_b', expr: 'vector(2)', for: '5m' }],
            },
          ],
        },
      },
    }));
    const svc = new DirectQueryRulerClient(noopLogger());

    const parsed = await svc.getRuleGroup(
      client,
      promDatasource(),
      'slo-generated-ws1',
      'slo:group_bbb'
    );

    expect(requestMock).toHaveBeenCalledTimes(1);
    const call = requestMock.mock.calls[0][0] as { method: string; path: string };
    expect(call.method).toBe('GET');
    // Hit the namespace-list path, not the single-group path.
    expect(call.path).toBe(
      '/_plugins/_directquery/_resources/my-cortex-connection/api/v1/rules/slo-generated-ws1'
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.groupName).toBe('slo:group_bbb');
    expect(parsed!.interval).toBe(120);
    expect(parsed!.rules[0]).toMatchObject({ type: 'alerting', name: 'Alert_b', for: '5m' });
  });

  it('returns null when the group is absent from an otherwise-populated namespace', async () => {
    const { client } = mockClient(async () => ({
      statusCode: 200,
      body: {
        data: {
          groups: [
            {
              name: 'slo:group_aaa',
              interval: '1m',
              rules: [{ record: 'rec_a', expr: 'vector(1)' }],
            },
          ],
        },
      },
    }));
    const svc = new DirectQueryRulerClient(noopLogger());

    const result = await svc.getRuleGroup(client, promDatasource(), 'ns', 'slo:group_missing');
    expect(result).toBeNull();
  });

  it('empty namespace (upstream 404) → resolves to null', async () => {
    const { client } = mockClient(() =>
      Promise.reject(rejectWithStatus(404, 'namespace not found'))
    );
    const svc = new DirectQueryRulerClient(noopLogger());

    const result = await svc.getRuleGroup(client, promDatasource(), 'ns', 'slo:group');
    expect(result).toBeNull();
  });

  it('empty namespace wrapped by SQL plugin as HTTP 400 "no rule groups found" → resolves to null', async () => {
    const { client } = mockClient(() =>
      Promise.reject(
        rejectWithStatus(400, {
          status: 400,
          error: {
            type: 'PrometheusClientException',
            reason: 'Invalid Request',
            details: 'Ruler request failed with code: 404. Error details: no rule groups found\n',
          },
        })
      )
    );
    const svc = new DirectQueryRulerClient(noopLogger());

    const result = await svc.getRuleGroup(client, promDatasource(), 'ns', 'slo:group');
    expect(result).toBeNull();
  });

  it('500 → throws SloRulerError with RULER_UNREACHABLE', async () => {
    const { client } = mockClient(() =>
      Promise.reject(rejectWithStatus(500, 'internal server error'))
    );
    const svc = new DirectQueryRulerClient(noopLogger());

    await expect(
      svc.getRuleGroup(client, promDatasource(), 'ns', 'group-1')
    ).rejects.toMatchObject({ name: 'SloRulerError', code: 'RULER_UNREACHABLE', httpStatus: 500 });
  });

  it('401 → throws SloRulerError with RULER_AUTH_FAILED', async () => {
    const { client } = mockClient(() => Promise.reject(rejectWithStatus(401, 'no org id')));
    const svc = new DirectQueryRulerClient(noopLogger());

    await expect(
      svc.getRuleGroup(client, promDatasource(), 'ns', 'group-1')
    ).rejects.toMatchObject({ name: 'SloRulerError', code: 'RULER_AUTH_FAILED', httpStatus: 401 });
  });
});

describe('DirectQueryRulerClient.listRuleGroups', () => {
  it('GETs /_plugins/_directquery/_resources/{dqName}/api/v1/rules/{namespace}', async () => {
    const { client, requestMock } = mockClient(async () => ({ statusCode: 200, body: '' }));
    const svc = new DirectQueryRulerClient(noopLogger());

    await svc.listRuleGroups(client, promDatasource(), 'slo-generated-ws1');

    expect(requestMock).toHaveBeenCalledTimes(1);
    const call = requestMock.mock.calls[0][0] as { method: string; path: string };
    expect(call.method).toBe('GET');
    expect(call.path).toBe(
      '/_plugins/_directquery/_resources/my-cortex-connection/api/v1/rules/slo-generated-ws1'
    );
  });

  it('Cortex namespace-keyed envelope → returns all groups parsed', async () => {
    const yamlEnvelope = yamlDump({
      'slo-generated-ws1': [
        {
          name: 'slo:group_aaa',
          interval: '1m',
          rules: [{ record: 'rec_a', expr: 'vector(1)', labels: { slo_id: 'slo-a' } }],
        },
        {
          name: 'slo:group_bbb',
          interval: '2m',
          rules: [
            { alert: 'SLO_Burn_b', expr: 'vector(2)', for: '5m', annotations: { summary: 'x' } },
          ],
        },
      ],
    });
    const { client, requestMock } = mockClient(async () => ({
      statusCode: 200,
      body: yamlEnvelope,
    }));
    const svc = new DirectQueryRulerClient(noopLogger());

    const groups = await svc.listRuleGroups(client, promDatasource(), 'slo-generated-ws1');

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      groupName: 'slo:group_aaa',
      interval: 60,
      rules: [
        expect.objectContaining({
          type: 'recording',
          name: 'rec_a',
          labels: { slo_id: 'slo-a' },
        }),
      ],
    });
    expect(groups[1]).toMatchObject({
      groupName: 'slo:group_bbb',
      interval: 120,
      rules: [
        expect.objectContaining({
          type: 'alerting',
          name: 'SLO_Burn_b',
          for: '5m',
          annotations: { summary: 'x' },
        }),
      ],
    });
  });

  it('200 with empty-object body → returns []', async () => {
    const { client } = mockClient(async () => ({ statusCode: 200, body: {} }));
    const svc = new DirectQueryRulerClient(noopLogger());

    const groups = await svc.listRuleGroups(client, promDatasource(), 'slo-generated-ws1');
    expect(groups).toEqual([]);
  });

  it('404 → resolves to [] (namespace exists but empty / not yet created)', async () => {
    const { client, requestMock } = mockClient(() =>
      Promise.reject(rejectWithStatus(404, 'namespace not found'))
    );
    const svc = new DirectQueryRulerClient(noopLogger());

    const groups = await svc.listRuleGroups(client, promDatasource(), 'slo-generated-ws-empty');
    expect(groups).toEqual([]);
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it('Prometheus response envelope { data: { groups: [...] } } → flattens into groups', async () => {
    const { client } = mockClient(async () => ({
      statusCode: 200,
      body: {
        status: 'success',
        data: {
          groups: [
            {
              file: 'slo-generated-ws1',
              name: 'slo:group_aaa',
              interval: '1m',
              rules: [{ record: 'rec_a', expr: 'vector(1)', labels: { slo_id: 'slo-a' } }],
            },
            {
              file: 'slo-generated-ws1',
              name: 'slo:group_bbb',
              interval: '30s',
              rules: [{ alert: 'Alert_b', expr: 'vector(2)' }],
            },
          ],
        },
      },
    }));
    const svc = new DirectQueryRulerClient(noopLogger());

    const groups = await svc.listRuleGroups(client, promDatasource(), 'slo-generated-ws1');
    expect(groups).toHaveLength(2);
    expect(groups[0].groupName).toBe('slo:group_aaa');
    expect(groups[0].interval).toBe(60);
    expect(groups[1].groupName).toBe('slo:group_bbb');
    expect(groups[1].interval).toBe(30);
  });

  it('SQL plugin wrapped-404 envelope ("no rule groups found" at HTTP 400) → []', async () => {
    const { client } = mockClient(() =>
      Promise.reject(
        rejectWithStatus(400, {
          status: 400,
          error: {
            type: 'PrometheusClientException',
            reason: 'Invalid Request',
            details: 'Ruler request failed with code: 404. Error details: no rule groups found\n',
          },
        })
      )
    );
    const svc = new DirectQueryRulerClient(noopLogger());

    const groups = await svc.listRuleGroups(client, promDatasource(), 'slo-generated-ws-empty');
    expect(groups).toEqual([]);
  });

  it('HTTP 400 without the wrapped-404 marker → still throws RULER_VALIDATION_FAILED', async () => {
    const { client } = mockClient(() =>
      Promise.reject(rejectWithStatus(400, { error: { details: 'malformed namespace' } }))
    );
    const svc = new DirectQueryRulerClient(noopLogger());

    await expect(svc.listRuleGroups(client, promDatasource(), 'ns')).rejects.toMatchObject({
      name: 'SloRulerError',
      code: 'RULER_VALIDATION_FAILED',
      httpStatus: 400,
    });
  });

  // Regression: a 400 whose body simply echoes user-supplied text containing
  // the marker substrings must NOT be classified as an empty namespace. The
  // structured-envelope classifier requires `error.type` ending in
  // `ClientException` AND a `code: 404` group inside `error.details`.
  it('HTTP 400 with reflected user input mentioning "no rule groups found" → throws, not coerced to []', async () => {
    const { client } = mockClient(() =>
      Promise.reject(
        rejectWithStatus(400, {
          message:
            'Validation failed for input "no rule groups found {ruler request failed with code: 404}"',
        })
      )
    );
    const svc = new DirectQueryRulerClient(noopLogger());

    await expect(svc.listRuleGroups(client, promDatasource(), 'ns')).rejects.toMatchObject({
      name: 'SloRulerError',
      code: 'RULER_VALIDATION_FAILED',
      httpStatus: 400,
    });
  });

  it('500 → throws SloRulerError with RULER_UNREACHABLE', async () => {
    const { client, requestMock } = mockClient(() =>
      Promise.reject(rejectWithStatus(500, 'upstream gone'))
    );
    const svc = new DirectQueryRulerClient(noopLogger());

    await expect(svc.listRuleGroups(client, promDatasource(), 'ns')).rejects.toMatchObject({
      name: 'SloRulerError',
      code: 'RULER_UNREACHABLE',
      httpStatus: 500,
    });
    expect(requestMock).toHaveBeenCalledTimes(1);
  });
});

describe('DirectQueryRulerClient.deleteRuleGroup — 404 tolerance', () => {
  it('404 → resolves successfully (target already gone)', async () => {
    const { client, requestMock } = mockClient(() =>
      Promise.reject(rejectWithStatus(404, 'rule group not found'))
    );
    const svc = new DirectQueryRulerClient(noopLogger());

    await expect(
      svc.deleteRuleGroup(client, promDatasource(), 'ns', 'group-already-gone')
    ).resolves.toBeUndefined();

    expect(requestMock).toHaveBeenCalledTimes(1);
    const call = requestMock.mock.calls[0][0] as { method: string; path: string };
    expect(call.method).toBe('DELETE');
    expect(call.path).toBe(
      '/_plugins/_directquery/_resources/my-cortex-connection/api/v1/rules/ns/group-already-gone'
    );
  });

  it('500 still throws RULER_UNREACHABLE (only 404 is tolerated)', async () => {
    const { client, requestMock } = mockClient(() =>
      Promise.reject(rejectWithStatus(500, 'upstream crashed'))
    );
    const svc = new DirectQueryRulerClient(noopLogger());

    await expect(
      svc.deleteRuleGroup(client, promDatasource(), 'ns', 'group-1')
    ).rejects.toMatchObject({
      name: 'SloRulerError',
      code: 'RULER_UNREACHABLE',
      httpStatus: 500,
    });
    expect(requestMock).toHaveBeenCalledTimes(1);
  });
});
