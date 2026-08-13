/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  buildDetectorRules,
  buildRulePayload,
  formFromAdResource,
  shouldAutoStartCreatedRule,
  validateForm,
} from '../create_ad_rule_flyout';

const feature = {
  featureId: 'feature-1',
  featureName: 'cpu',
  featureEnabled: true,
  anomalyDirection: 'below',
  aggregationBy: 'sum',
  aggregationOf: 'cpu.value',
};

const detectorForm = {
  name: 'detector',
  description: 'description',
  datasourceId: 'ds-1',
  indices: ['metrics-*'],
  timeField: '@timestamp',
  filterQuery: '{"term":{"host_name":"new-host"}}',
  customResultIndexEnabled: false,
  resultIndex: '',
  resultIndexMinAge: '',
  resultIndexMinSize: '',
  resultIndexTtl: '',
  customResultIndexLifecycleEnabled: false,
  flattenCustomResultIndex: false,
  categoryFieldEnabled: false,
  categoryField: [],
  features: [feature],
  shingleSize: 8,
  interval: 10,
  frequency: 10,
  windowDelay: 1,
  history: 40,
  horizon: 24,
  startAfterCreate: true,
};

const existingDetector = {
  id: 'detector-1',
  name: 'detector',
  seq_no: 4,
  primary_term: 2,
  schema_version: 7,
  recency_emphasis: 128,
  category_field: ['host_name'],
  result_index: 'opensearch-ad-plugin-result-old-results',
  filter_query: { term: { host_name: 'old-host' } },
  ui_metadata: {
    visualEditorState: { mode: 'advanced' },
    filters: [{ field: 'service', operator: 'is', value: 'api' }],
    features: {
      cpu: {
        aggregationBy: 'sum',
        aggregationOf: 'cpu.value',
        displayOptions: { precision: 3 },
      },
    },
  },
  feature_attributes: [
    {
      feature_id: 'feature-1',
      feature_name: 'cpu',
      feature_enabled: true,
      aggregation_query: { cpu_feature_query: { sum: { field: 'cpu.value' } } },
      imputation_method: 'ZERO',
    },
  ],
  rules: [
    {
      action: 'IGNORE_ANOMALY',
      conditions: [
        {
          feature_name: 'cpu',
          threshold_type: 'ACTUAL_OVER_EXPECTED_RATIO',
          operator: 'LTE',
          value: 0.2,
        },
      ],
    },
    {
      action: 'IGNORE_ANOMALY',
      conditions: [
        {
          feature_name: 'deleted-feature',
          threshold_type: 'ACTUAL_OVER_EXPECTED_RATIO',
          operator: 'LTE',
          value: 0.3,
        },
      ],
    },
    {
      action: 'IGNORE_ANOMALY',
      conditions: [
        {
          feature_name: 'cpu',
          threshold_type: 'ACTUAL_IS_BELOW_EXPECTED',
        },
      ],
    },
  ],
};

describe('AD rule payload serialization', () => {
  it('preserves unmodeled settings while emitting only canonical configuration keys', () => {
    const payload = buildRulePayload('detector', detectorForm, {
      existingResource: existingDetector,
    }) as Record<string, unknown>;
    const serialized = JSON.parse(JSON.stringify(payload));

    expect(serialized).toEqual(
      expect.objectContaining({
        seqNo: 4,
        primaryTerm: 2,
        schemaVersion: 7,
        recencyEmphasis: 128,
        filterQuery: { term: { host_name: 'new-host' } },
      })
    );
    expect(serialized).not.toHaveProperty('schema_version');
    expect(serialized).not.toHaveProperty('filter_query');
    expect(serialized).not.toHaveProperty('categoryField');
    expect(serialized).not.toHaveProperty('category_field');
    expect(serialized).not.toHaveProperty('resultIndex');
    expect(serialized).not.toHaveProperty('result_index');
    expect(serialized.featureAttributes[0].aggregationQuery).toEqual({
      cpu_feature_query: { sum: { field: 'cpu.value' } },
    });
    expect(serialized.featureAttributes[0].imputationMethod).toBe('ZERO');
    expect(serialized.uiMetadata).toEqual(
      expect.objectContaining({
        visualEditorState: { mode: 'advanced' },
        filters: [{ field: 'service', operator: 'is', value: 'api' }],
      })
    );
    expect(serialized.uiMetadata.features.cpu.displayOptions).toEqual({ precision: 3 });
  });

  it('preserves suppression rules, replaces direction rules, and removes deleted-feature rules', () => {
    const rules = buildDetectorRules([feature], existingDetector);

    expect(rules).toEqual([
      {
        action: 'IGNORE_ANOMALY',
        conditions: [
          {
            featureName: 'cpu',
            thresholdType: 'ACTUAL_OVER_EXPECTED_RATIO',
            operator: 'LTE',
            value: 0.2,
          },
        ],
      },
      {
        action: 'IGNORE_ANOMALY',
        conditions: [
          {
            featureName: 'cpu',
            thresholdType: 'ACTUAL_IS_OVER_EXPECTED',
          },
        ],
      },
    ]);
  });

  it('loads an existing direction rule into the feature form', () => {
    const form = formFromAdResource('detector', existingDetector, 'ds-1');
    expect(form.features[0].anomalyDirection).toBe('above');
  });

  it('validates detector history and forecaster horizon ranges', () => {
    expect(validateForm({ ...detectorForm, history: 5 }, { ruleType: 'detector' })).toHaveProperty(
      'history'
    );
    expect(
      validateForm({ ...detectorForm, history: 40, horizon: 181 }, { ruleType: 'forecaster' })
    ).toHaveProperty('horizon');
  });

  it('serializes forecasting storage settings using the forecasting result index prefix', () => {
    const payload = buildRulePayload('forecaster', {
      ...detectorForm,
      customResultIndexEnabled: true,
      resultIndex: 'capacity-forecast',
      resultIndexMinAge: 7,
      resultIndexMinSize: 1000,
      resultIndexTtl: 30,
      customResultIndexLifecycleEnabled: true,
      flattenCustomResultIndex: true,
    });

    expect(payload).toEqual(
      expect.objectContaining({
        resultIndex: 'opensearch-forecast-result-capacity-forecast',
        resultIndexMinAge: 7,
        resultIndexMinSize: 1000,
        resultIndexTtl: 30,
        flattenCustomResultIndex: true,
      })
    );
  });

  it('omits forecasting storage settings when the default result index is selected', () => {
    const payload = JSON.parse(
      JSON.stringify(
        buildRulePayload('forecaster', {
          ...detectorForm,
          customResultIndexEnabled: false,
          resultIndex: '',
        })
      )
    );

    expect(payload).not.toHaveProperty('resultIndex');
    expect(payload).not.toHaveProperty('resultIndexMinAge');
    expect(payload).not.toHaveProperty('resultIndexMinSize');
    expect(payload).not.toHaveProperty('resultIndexTtl');
    expect(payload).not.toHaveProperty('flattenCustomResultIndex');
  });

  it('uses indicator terminology when validating a forecaster', () => {
    const errors = validateForm(
      {
        ...detectorForm,
        features: [{ ...feature, featureName: '', aggregationOf: '' }],
      },
      { ruleType: 'forecaster' }
    );

    expect(errors['features.0.featureName']).toBe('Indicator name is required.');
    expect(errors['features.0.aggregationOf']).toBe('Indicator field is required.');
  });

  it('always auto-starts a newly created forecaster', () => {
    expect(shouldAutoStartCreatedRule('forecaster', false)).toBe(true);
    expect(shouldAutoStartCreatedRule('detector', false)).toBe(false);
    expect(shouldAutoStartCreatedRule('detector', true)).toBe(true);
  });
});
