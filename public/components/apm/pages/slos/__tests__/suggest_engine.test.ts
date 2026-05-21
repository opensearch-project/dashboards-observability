/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  PrometheusSli,
  SingleSli,
  SloCreateInput,
} from '../../../../../../common/slo/slo_types';
import type { PromRule, PromRuleGroup } from '../../../../../../common/types/alerting';
import {
  generateSuggestionsForServices,
  generateSuggestionsFromServices,
  metricsToProbe,
} from '../suggest_engine';

function getPromSli(
  sli: SingleSli | { type: string; definition?: { backend: string } }
): PrometheusSli {
  if (
    'type' in sli &&
    sli.type === 'single' &&
    'definition' in sli &&
    sli.definition &&
    sli.definition.backend === 'prometheus'
  ) {
    return sli.definition as PrometheusSli;
  }
  throw new Error(`expected single + prometheus SLI, got ${JSON.stringify(sli)}`);
}

function getSpec(input: SloCreateInput) {
  return input.spec;
}

function makeRecordingRule(
  name: string,
  query: string,
  labels: Record<string, string> = {}
): PromRule {
  return { type: 'recording', name, query, labels, health: 'ok' };
}

function makeGroup(name: string, rules: PromRule[]): PromRuleGroup {
  return { name, file: 'slo-generated.yaml', interval: 60, rules };
}

describe('generateSuggestionsFromServices (back-compat alias)', () => {
  // The page's original call shape — only datasourceId + services. No OTel
  // metadata, so no OTel detectors fire.
  it('emits two drafts per service (availability + latency) with the expected keys', () => {
    const out = generateSuggestionsFromServices({
      datasourceId: 'ds-2',
      services: [
        { serviceName: 'checkout', environment: 'generic:default' },
        { serviceName: 'cart' },
      ],
    });
    expect(out).toHaveLength(4);
    expect(out.map((s) => s.key).sort()).toEqual([
      'apm-avail:cart',
      'apm-avail:checkout',
      'apm-lat:cart',
      'apm-lat:checkout',
    ]);
  });

  it('returns an empty list when there are no services', () => {
    expect(generateSuggestionsFromServices({ datasourceId: 'ds-2', services: [] })).toEqual([]);
  });

  it('skips entries with an empty serviceName', () => {
    const out = generateSuggestionsFromServices({
      datasourceId: 'ds-2',
      services: [{ serviceName: '' }, { serviceName: 'checkout' }],
    });
    expect(out).toHaveLength(2);
    expect(out.every((s) => s.input.spec.service === 'checkout')).toBe(true);
  });

  it('builds custom-PromQL SLIs with the service scoped to span-derived (server-side) metrics', () => {
    const [avail, latency] = generateSuggestionsFromServices({
      datasourceId: 'ds-2',
      services: [{ serviceName: 'checkout' }],
    });

    const availDef = getPromSli(avail.input.spec.sli);
    expect(availDef.type).toBe('custom');
    const availExpr =
      availDef.customExpr?.mode === 'events'
        ? availDef.customExpr
        : ((undefined as never) as { goodQuery: string; totalQuery: string });
    expect(availExpr.goodQuery).toContain('request{service="checkout"');
    expect(availExpr.goodQuery).toContain('fault{service="checkout"');
    expect(availExpr.goodQuery).toContain('remoteService=""');
    expect(availExpr.goodQuery).toContain('namespace="span_derived"');

    // Latency draft uses the native latency_threshold SLI type so the
    // generator wraps each side of the ratio in sum(rate(...)[<window>]) per
    // recording window — the custom-events path otherwise substitutes raw
    // sums of a counter and produces NaN when the source metric is idle.
    const latDef = getPromSli(latency.input.spec.sli);
    expect(latDef.type).toBe('latency_threshold');
    expect(latDef.metric).toBe('latency_seconds_bucket');
    expect(latDef.latencyThresholdUnit).toBe('seconds');
    expect(latency.input.spec.objectives[0].latencyThreshold).toBe(0.5);
    expect(latency.input.spec.objectives[0].target).toBe(0.95);
    const dimsByName = Object.fromEntries(
      (latency.input.spec.sli.type === 'single'
        ? latency.input.spec.sli.dimensions
        : []
      ).map((d) => [d.name, d.value])
    );
    expect(dimsByName.service).toBe('checkout');
    expect(dimsByName.namespace).toBe('span_derived');
    // remoteService="" scopes to server-side spans (Data Prepper convention).
    expect(dimsByName.remoteService).toBe('');
  });

  it('propagates environment into the `detected` map when present', () => {
    const [avail] = generateSuggestionsFromServices({
      datasourceId: 'ds-2',
      services: [{ serviceName: 'checkout', environment: 'generic:default' }],
    });
    expect(avail.detected).toEqual({ service: 'checkout', environment: 'generic:default' });
  });

  it('omits environment from `detected` when the service has no environment', () => {
    const [avail] = generateSuggestionsFromServices({
      datasourceId: 'ds-2',
      services: [{ serviceName: 'checkout' }],
    });
    expect(avail.detected).toEqual({ service: 'checkout' });
  });

  it('defaults targets to 99% availability and 95% latency', () => {
    const [avail, latency] = generateSuggestionsFromServices({
      datasourceId: 'ds-2',
      services: [{ serviceName: 'checkout' }],
    });
    expect(avail.input.spec.objectives[0].target).toBeCloseTo(0.99, 5);
    expect(latency.input.spec.objectives[0].target).toBeCloseTo(0.95, 5);
  });
});

describe('generateSuggestionsForServices — OTel HTTP detector', () => {
  it('emits HTTP availability + latency drafts when the service_name label matches', () => {
    const out = generateSuggestionsForServices({
      datasourceId: 'ds-2',
      services: [{ serviceName: 'checkout' }],
      metricNames: [
        'http_server_request_duration_seconds_count',
        'http_server_request_duration_seconds_bucket',
      ],
      labelValuesByMetric: {
        http_server_request_duration_seconds_count: { service_name: ['checkout', 'cart'] },
        http_server_request_duration_seconds_bucket: { service_name: ['checkout', 'cart'] },
      },
    });
    const keys = out.map((s) => s.key).sort();
    expect(keys).toEqual([
      'apm-avail:checkout',
      'apm-lat:checkout',
      'http-avail:checkout',
      'http-lat:checkout',
    ]);

    const httpAvail = out.find((s) => s.key === 'http-avail:checkout')!;
    expect(httpAvail.kindId).toBe('http-availability');
    const httpAvailSli = getPromSli(httpAvail.input.spec.sli);
    expect(httpAvailSli.metric).toBe('http_server_request_duration_seconds_count');
    expect(httpAvailSli.goodEventsFilter).toContain('http_response_status_code');
    // Dimension should prefer service_name.
    expect(getSpec(httpAvail.input).sli).toMatchObject({
      dimensions: [{ name: 'service_name', value: 'checkout' }],
    });
  });

  it('falls back to the job label when service_name is not in the metric labels', () => {
    const out = generateSuggestionsForServices({
      datasourceId: 'ds-2',
      services: [{ serviceName: 'flagd' }],
      metricNames: ['http_server_request_duration_seconds_count'],
      labelValuesByMetric: {
        http_server_request_duration_seconds_count: {
          job: ['opentelemetry-demo/flagd', 'opentelemetry-demo/other'],
        },
      },
    });
    const httpAvail = out.find((s) => s.kindId === 'http-availability');
    expect(httpAvail).toBeDefined();
    expect(getSpec(httpAvail!.input).sli).toMatchObject({
      dimensions: [{ name: 'job', value: 'opentelemetry-demo/flagd' }],
    });
  });

  it('skips services that do not appear in the metric labels', () => {
    const out = generateSuggestionsForServices({
      datasourceId: 'ds-2',
      services: [{ serviceName: 'unused-service' }],
      metricNames: ['http_server_request_duration_seconds_count'],
      labelValuesByMetric: {
        http_server_request_duration_seconds_count: { service_name: ['checkout'] },
      },
    });
    // Still gets APM drafts, but no http drafts.
    expect(out.some((s) => s.kindId === 'http-availability')).toBe(false);
    expect(out.some((s) => s.kindId === 'apm-availability')).toBe(true);
  });

  it('no-ops when the HTTP metric family is absent', () => {
    const out = generateSuggestionsForServices({
      datasourceId: 'ds-2',
      services: [{ serviceName: 'checkout' }],
      metricNames: ['some_unrelated_metric'],
    });
    expect(out.some((s) => s.kindId === 'http-availability')).toBe(false);
    expect(out.some((s) => s.kindId === 'http-latency')).toBe(false);
  });
});

describe('generateSuggestionsForServices — OTel RPC detector', () => {
  it('emits RPC drafts only for services present in the rpc_service label', () => {
    const out = generateSuggestionsForServices({
      datasourceId: 'ds-2',
      services: [{ serviceName: 'checkout' }, { serviceName: 'cart' }],
      metricNames: ['rpc_server_duration_seconds_count', 'rpc_server_duration_seconds_bucket'],
      labelValuesByMetric: {
        rpc_server_duration_seconds_count: { rpc_service: ['checkout'] },
        rpc_server_duration_seconds_bucket: { rpc_service: ['checkout'] },
      },
    });
    const rpcKeys = out
      .filter((s) => s.kindId === 'rpc-availability' || s.kindId === 'rpc-latency')
      .map((s) => s.key)
      .sort();
    expect(rpcKeys).toEqual(['rpc-avail:checkout', 'rpc-lat:checkout']);

    const avail = out.find((s) => s.key === 'rpc-avail:checkout')!;
    const availSli = getPromSli(avail.input.spec.sli);
    expect(availSli.metric).toBe('rpc_server_duration_seconds_count');
    expect(availSli.goodEventsFilter).toContain('rpc_grpc_status_code');
  });
});

describe('generateSuggestionsForServices — OTel DB, messaging, GenAI detectors', () => {
  it('emits DB latency drafts keyed off the bucket metric', () => {
    const out = generateSuggestionsForServices({
      datasourceId: 'ds-2',
      services: [{ serviceName: 'checkout' }],
      metricNames: ['db_client_operation_duration_seconds_bucket'],
      labelValuesByMetric: {
        db_client_operation_duration_seconds_bucket: { service_name: ['checkout'] },
      },
    });
    const db = out.find((s) => s.kindId === 'db-latency');
    expect(db).toBeDefined();
    const sli = getPromSli(db!.input.spec.sli);
    expect(sli.metric).toBe('db_client_operation_duration_seconds_bucket');
    expect(db!.input.spec.objectives[0].latencyThreshold).toBeCloseTo(0.1, 5);
  });

  it('emits messaging latency drafts keyed off the bucket metric', () => {
    const out = generateSuggestionsForServices({
      datasourceId: 'ds-2',
      services: [{ serviceName: 'checkout' }],
      metricNames: ['messaging_process_duration_seconds_bucket'],
      labelValuesByMetric: {
        messaging_process_duration_seconds_bucket: { service_name: ['checkout'] },
      },
    });
    const msg = out.find((s) => s.kindId === 'messaging-latency');
    expect(msg).toBeDefined();
    expect(msg!.input.spec.objectives[0].latencyThreshold).toBeCloseTo(1, 5);
  });

  it('emits GenAI availability drafts keyed off the count metric', () => {
    const out = generateSuggestionsForServices({
      datasourceId: 'ds-2',
      services: [{ serviceName: 'llm-proxy' }],
      metricNames: ['gen_ai_client_operation_duration_seconds_count'],
      labelValuesByMetric: {
        gen_ai_client_operation_duration_seconds_count: { service_name: ['llm-proxy'] },
      },
    });
    const genai = out.find((s) => s.kindId === 'genai-availability');
    expect(genai).toBeDefined();
    expect(getPromSli(genai!.input.spec.sli).goodEventsFilter).toBe('error_type=""');
  });
});

describe('generateSuggestionsForServices — APM + OTel coexistence', () => {
  it('returns APM and OTel drafts side by side without deduping', () => {
    const out = generateSuggestionsForServices({
      datasourceId: 'ds-2',
      services: [{ serviceName: 'checkout' }],
      metricNames: [
        'http_server_request_duration_seconds_count',
        'http_server_request_duration_seconds_bucket',
      ],
      labelValuesByMetric: {
        http_server_request_duration_seconds_count: { service_name: ['checkout'] },
        http_server_request_duration_seconds_bucket: { service_name: ['checkout'] },
      },
    });
    expect(out.map((s) => s.kindId).sort()).toEqual([
      'apm-availability',
      'apm-latency',
      'http-availability',
      'http-latency',
    ]);
  });
});

describe('generateSuggestionsForServices — existing-rule reuse (category 1)', () => {
  it('flags drafts covered by a recording rule with matching slo_service label', () => {
    const existingRuleGroups: PromRuleGroup[] = [
      makeGroup('slo-checkout-availability', [
        makeRecordingRule(
          'slo:sli_error:ratio_rate_5m:checkout_availability',
          'sum(rate(http_server_request_duration_seconds_count{service_name="checkout"}[5m]))',
          { slo_id: 'slo-abc', slo_service: 'checkout' }
        ),
      ]),
    ];
    const out = generateSuggestionsForServices({
      datasourceId: 'ds-2',
      services: [{ serviceName: 'checkout' }],
      metricNames: ['http_server_request_duration_seconds_count'],
      labelValuesByMetric: {
        http_server_request_duration_seconds_count: { service_name: ['checkout'] },
      },
      existingRuleGroups,
    });

    const httpAvail = out.find((s) => s.key === 'http-avail:checkout')!;
    expect(httpAvail.existingRuleMatch).toEqual({
      groupName: 'slo-checkout-availability',
      ruleName: 'slo:sli_error:ratio_rate_5m:checkout_availability',
      sloId: 'slo-abc',
    });
  });

  it('does not flag drafts for services the existing rule does not cover', () => {
    const existingRuleGroups: PromRuleGroup[] = [
      makeGroup('other', [
        makeRecordingRule(
          'slo:sli_error:ratio_rate_5m:cart_availability',
          'sum(rate(http_server_request_duration_seconds_count{service_name="cart"}[5m]))',
          { slo_id: 'slo-xyz', slo_service: 'cart' }
        ),
      ]),
    ];
    const out = generateSuggestionsForServices({
      datasourceId: 'ds-2',
      services: [{ serviceName: 'checkout' }, { serviceName: 'cart' }],
      metricNames: ['http_server_request_duration_seconds_count'],
      labelValuesByMetric: {
        http_server_request_duration_seconds_count: { service_name: ['checkout', 'cart'] },
      },
      existingRuleGroups,
    });
    expect(out.find((s) => s.key === 'http-avail:cart')?.existingRuleMatch).toBeTruthy();
    expect(out.find((s) => s.key === 'http-avail:checkout')?.existingRuleMatch).toBeUndefined();
  });

  it('flags drafts using expression-based service extraction when labels are missing', () => {
    // A user-authored rule without slo_service — fallback regex picks up the
    // service="checkout" selector inside the PromQL. The rule computes an APM
    // availability signal (request + fault), so only apm-availability is flagged.
    const existingRuleGroups: PromRuleGroup[] = [
      makeGroup('hand-authored', [
        makeRecordingRule(
          'checkout:availability:ratio_rate_5m',
          '(sum(rate(request{service="checkout"}[5m])) - sum(rate(fault{service="checkout"}[5m]))) / sum(rate(request{service="checkout"}[5m]))'
        ),
      ]),
    ];
    const out = generateSuggestionsForServices({
      datasourceId: 'ds-2',
      services: [{ serviceName: 'checkout' }],
      existingRuleGroups,
    });
    expect(out.find((s) => s.key === 'apm-avail:checkout')?.existingRuleMatch).toBeTruthy();
    // APM latency uses latency_seconds_bucket, which the rule doesn't reference,
    // so it stays uncovered.
    expect(out.find((s) => s.key === 'apm-lat:checkout')?.existingRuleMatch).toBeUndefined();
  });

  it('distinguishes HTTP latency vs HTTP availability rules by their metric family', () => {
    const existingRuleGroups: PromRuleGroup[] = [
      makeGroup('latency-rules', [
        makeRecordingRule(
          'checkout:http_latency:p95',
          'histogram_quantile(0.95, sum by (le)(rate(http_server_request_duration_seconds_bucket{service_name="checkout"}[5m])))'
        ),
      ]),
    ];
    const out = generateSuggestionsForServices({
      datasourceId: 'ds-2',
      services: [{ serviceName: 'checkout' }],
      metricNames: [
        'http_server_request_duration_seconds_count',
        'http_server_request_duration_seconds_bucket',
      ],
      labelValuesByMetric: {
        http_server_request_duration_seconds_count: { service_name: ['checkout'] },
        http_server_request_duration_seconds_bucket: { service_name: ['checkout'] },
      },
      existingRuleGroups,
    });
    // Only http-latency should be marked covered; availability uses _count and
    // the existing rule only references _bucket.
    expect(out.find((s) => s.key === 'http-lat:checkout')?.existingRuleMatch).toBeTruthy();
    expect(out.find((s) => s.key === 'http-avail:checkout')?.existingRuleMatch).toBeUndefined();
  });

  it('ignores alerting rules — only recording rules count as reuse candidates', () => {
    const alertingRule: PromRule = {
      type: 'alerting',
      name: 'CheckoutErrorBudgetBurnFast',
      query: 'slo:sli_error:ratio_rate_5m{slo_service="checkout"} > 0.1',
      labels: { slo_service: 'checkout' },
      annotations: {},
      alerts: [],
      health: 'ok',
      state: 'inactive',
    } as PromRule;
    const existingRuleGroups: PromRuleGroup[] = [makeGroup('alerts', [alertingRule])];
    const out = generateSuggestionsForServices({
      datasourceId: 'ds-2',
      services: [{ serviceName: 'checkout' }],
      existingRuleGroups,
    });
    expect(out.find((s) => s.key === 'apm-avail:checkout')?.existingRuleMatch).toBeUndefined();
  });
});

describe('metricsToProbe', () => {
  it('returns no probes when none of the expected metric families are present', () => {
    expect(metricsToProbe(['unrelated_metric'])).toEqual([]);
  });

  it('emits probe entries for every OTel family actually present', () => {
    const probes = metricsToProbe([
      'http_server_request_duration_seconds_count',
      'rpc_server_duration_seconds_bucket',
      'db_client_operation_duration_seconds_bucket',
    ]);
    const metrics = probes.map((p) => p.metric).sort();
    expect(metrics).toEqual([
      'db_client_operation_duration_seconds_bucket',
      'http_server_request_duration_seconds_count',
      'rpc_server_duration_seconds_bucket',
    ]);
  });
});
