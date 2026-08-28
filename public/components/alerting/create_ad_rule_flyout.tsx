/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alerts Manager-native creation flow for AD-backed resources.
 *
 * The AD and Forecasting apps own their full multi-page wizards, but those
 * pages depend on app-local Redux/context. This flyout mirrors the core
 * create payload shape in an OUI/EUI workflow so users can create anomaly
 * detection and forecasting rules without leaving Alerts Manager.
 */
import React, { ReactElement, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCallOut,
  EuiComboBoxOptionOption,
  EuiCheckbox,
  EuiComboBox,
  EuiFieldNumber,
  EuiFieldText,
  EuiFormRow,
  EuiSelect,
  EuiTextArea,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiHorizontalRule,
  EuiLink,
  EuiLoadingSpinner,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiOverlayMask,
  EuiPanel,
  EuiRadio,
  EuiRadioGroup,
  EuiSmallButton,
  EuiSmallButtonEmpty,
  EuiSpacer,
  EuiSteps,
  EuiSwitch,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import {
  ADDetector,
  ADForecaster,
  Datasource,
  MonitorStatus,
  UnifiedRuleSummary,
} from '../../../common/types/alerting';
import { coreRefs } from '../../framework/core_refs';
import { toAdApiDataSourceId, withAdApiDataSource } from './utils/ad_api_paths';
import { useIndexMappings } from './hooks/use_index_mappings';
import { useIndices } from './hooks/use_indices';
import { useRuleDetail } from './hooks/use_rule_detail';
import { isAdResourceRunning, isStandardOpenSearchDatasource } from './shared_constants';

export type CreateAdRuleType = 'detector' | 'forecaster';
type AdRuleFlyoutMode = 'create' | 'edit';
type EditInitialStep = 'define' | 'model';

interface CreateAdRuleFlyoutEditTarget {
  id: string;
  datasourceId: string;
  initialStep?: EditInitialStep;
}

export interface CreateAdRuleFlyoutProps {
  ruleType: CreateAdRuleType;
  datasources: Datasource[];
  selectedDsIds?: string[];
  mode?: AdRuleFlyoutMode;
  editTarget?: CreateAdRuleFlyoutEditTarget;
  onCancel: () => void;
  onCreated?: () => void;
  onUpdated?: () => void;
}

type NumericFormValue = number | '';
type SuggestDialogStep = 'config' | 'loading' | 'error' | 'result';
type EditLifecycleBlocker = 'detector-running' | 'forecaster-active' | 'forecaster-test';

interface CreateAdFeatureFormState {
  featureId?: string;
  featureName: string;
  featureEnabled: boolean;
  anomalyDirection: string;
  aggregationBy: string;
  aggregationOf: string;
}

interface CreateAdRuleFormState {
  name: string;
  description: string;
  datasourceId: string;
  indices: string[];
  timeField: string;
  filterQuery: string;
  customResultIndexEnabled: boolean;
  resultIndex: string;
  resultIndexMinAge: NumericFormValue;
  resultIndexMinSize: NumericFormValue;
  resultIndexTtl: NumericFormValue;
  customResultIndexLifecycleEnabled: boolean;
  flattenCustomResultIndex: boolean;
  categoryFieldEnabled: boolean;
  categoryField: string[];
  features: CreateAdFeatureFormState[];
  shingleSize: number;
  interval: NumericFormValue;
  frequency: NumericFormValue;
  windowDelay: NumericFormValue;
  history: NumericFormValue;
  horizon: NumericFormValue;
  startAfterCreate: boolean;
}

interface ApiResponse<T = { id?: string; detectorId?: string; forecasterId?: string }> {
  ok?: boolean;
  response?: T;
  error?: string;
  message?: string;
}

interface DetectorSuggestionPeriod {
  period?: {
    interval?: number;
  };
}

interface DetectorSuggestionResponse {
  exception?: string;
  detectionInterval?: DetectorSuggestionPeriod;
  interval?: DetectorSuggestionPeriod;
  frequency?: DetectorSuggestionPeriod;
  history?: number;
  windowDelay?: DetectorSuggestionPeriod;
}

const AD_DETECTOR_API = '/api/anomaly_detectors/detectors';
const FORECASTER_API = '/api/forecasting/forecasters';
const OPENSEARCH_SERVERLESS_ENGINE_TYPE = 'OpenSearch Serverless';
const OPENSEARCH_SERVERLESS_SIGV4_SERVICE = 'aoss';
const DETECTOR_RUNNING_STATE = 'Running';
const DETECTOR_INITIALIZING_STATE = 'Initializing';
const FORECASTER_RUNNING_STATE = 'Running';
const FORECASTER_INITIALIZING_FORECAST_STATE = 'Initializing forecast';
const FORECASTER_AWAITING_DATA_TO_INIT_STATE = 'Awaiting data to init';
const FORECASTER_AWAITING_DATA_TO_RESTART_STATE = 'Awaiting data to restart';
const FORECASTER_INIT_TEST_STATE = 'Initializing test';
const FORECASTER_FORECAST_FAILURE_STATE = 'Forecast failure';
const MINUTES_UNIT = 'Minutes';
const SIMPLE_FEATURE_TYPE = 'simple_aggs';
const CUSTOM_FEATURE_TYPE = 'custom_aggs';
const AD_DOCS_LINK = 'https://opensearch.org/docs/latest/observing-your-data/ad/index/';
const FORECASTER_DOCS_LINK =
  'https://opensearch.org/docs/latest/observing-your-data/forecast/index/';
const CUSTOM_AD_RESULT_INDEX_PREFIX = 'opensearch-ad-plugin-result-';
const CUSTOM_FORECASTER_RESULT_INDEX_PREFIX = 'opensearch-forecast-result-';

const AGGREGATION_OPTIONS = [
  { value: 'avg', text: 'average()' },
  { value: 'value_count', text: 'count()' },
  { value: 'sum', text: 'sum()' },
  { value: 'min', text: 'min()' },
  { value: 'max', text: 'max()' },
];

const FEATURE_TYPE_OPTIONS = [
  { value: SIMPLE_FEATURE_TYPE, text: 'Field value' },
  { value: CUSTOM_FEATURE_TYPE, text: 'Custom expression' },
];

const FEATURE_DIRECTION_OPTIONS = [
  { value: 'both', text: 'Deviation in any direction (default)' },
  { value: 'above', text: 'Rise above expected value' },
  { value: 'below', text: 'Drop below expected value' },
];

const NUMBER_TYPES = [
  'integer',
  'long',
  'short',
  'byte',
  'double',
  'float',
  'half_float',
  'scaled_float',
];
const COUNTABLE_TYPES = [...NUMBER_TYPES, 'keyword', 'text', 'boolean', 'date', 'date_nanos'];
const CATEGORY_TYPES = ['keyword', 'ip'];
const MAX_FEATURE_NUM = 5;

export const shouldAutoStartCreatedRule = (
  ruleType: CreateAdRuleType,
  startAfterCreate: boolean
): boolean => ruleType === 'forecaster' || startAfterCreate;

const createInitialFeature = (): CreateAdFeatureFormState => ({
  featureId: undefined,
  featureName: '',
  featureEnabled: true,
  anomalyDirection: 'both',
  aggregationBy: 'sum',
  aggregationOf: '',
});

const resetFeatureFieldSelections = (
  features: CreateAdFeatureFormState[]
): CreateAdFeatureFormState[] => features.map((feature) => ({ ...feature, aggregationOf: '' }));

const createInitialForm = (datasourceId: string): CreateAdRuleFormState => ({
  name: '',
  description: '',
  datasourceId,
  indices: [],
  timeField: '',
  filterQuery: '',
  customResultIndexEnabled: false,
  resultIndex: '',
  resultIndexMinAge: '',
  resultIndexMinSize: '',
  resultIndexTtl: '',
  customResultIndexLifecycleEnabled: false,
  flattenCustomResultIndex: false,
  categoryFieldEnabled: false,
  categoryField: [],
  features: [createInitialFeature()],
  shingleSize: 8,
  interval: '',
  frequency: '',
  windowDelay: '',
  history: '',
  horizon: 24,
  startAfterCreate: true,
});

const isServerlessDataSource = async (dsId: string): Promise<boolean> => {
  const normalized = toAdApiDataSourceId(dsId);
  if (!normalized || !coreRefs.savedObjectsClient) return false;

  try {
    const dataSource = await coreRefs.savedObjectsClient.get('data-source', normalized);
    const attributes = dataSource.attributes as {
      auth?: {
        credentials?: {
          service?: string;
        };
      };
      dataSourceEngineType?: string;
      endpoint?: string;
    };
    return (
      attributes.dataSourceEngineType === OPENSEARCH_SERVERLESS_ENGINE_TYPE ||
      attributes.auth?.credentials?.service === OPENSEARCH_SERVERLESS_SIGV4_SERVICE ||
      attributes.endpoint?.includes('.aoss.amazonaws.com') === true
    );
  } catch {
    return false;
  }
};

const toPositiveInt = (value: NumericFormValue, fallback: number): number => {
  if (value === '') return fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
};

const parsePositiveInt = (value: NumericFormValue): number | undefined => {
  if (value === '') return undefined;
  if (!Number.isFinite(value)) return undefined;
  const next = Math.floor(value);
  return next > 0 ? next : undefined;
};

const parseNonNegativeInt = (value: NumericFormValue): number | undefined => {
  if (value === '') return undefined;
  if (!Number.isFinite(value)) return undefined;
  const next = Math.floor(value);
  return next >= 0 ? next : undefined;
};

const parseNumberInputValue = (value: string): NumericFormValue =>
  value === '' ? '' : Number(value);

const toSnakeCase = (value: string): string => {
  const normalized = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return normalized || 'feature_1';
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const stringValue = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const numberValue = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const booleanValue = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const getField = (record: Record<string, unknown>, snakeKey: string, camelKey: string): unknown =>
  record[snakeKey] !== undefined ? record[snakeKey] : record[camelKey];

const getPeriodInterval = (
  resource: Record<string, unknown>,
  snakeKey: string,
  camelKey: string
): NumericFormValue => {
  const period = asRecord(asRecord(getField(resource, snakeKey, camelKey)).period);
  return numberValue(period.interval) ?? '';
};

const stripResultIndexPrefix = (value: unknown, prefix: string): string => {
  const resultIndex = stringValue(value);
  return resultIndex.startsWith(prefix) ? resultIndex.slice(prefix.length) : resultIndex;
};

const isMatchAllFilter = (filterQuery: Record<string, unknown>): boolean => {
  const keys = Object.keys(filterQuery);
  return keys.length === 0 || (keys.length === 1 && !!filterQuery.match_all);
};

const formatFilterQueryForForm = (value: unknown): string => {
  const filterQuery = asRecord(value);
  return isMatchAllFilter(filterQuery) ? '' : JSON.stringify(filterQuery, null, 2);
};

const formatCategoryField = (form: CreateAdRuleFormState): string[] | undefined =>
  form.categoryFieldEnabled && form.categoryField.length ? form.categoryField : undefined;

const parseFilterQuery = (value: string): Record<string, unknown> => {
  const trimmed = value.trim();
  return trimmed ? JSON.parse(trimmed) : { match_all: {} };
};

export const getCreateAdRuleDatasources = (datasources: Datasource[]): Datasource[] =>
  datasources.filter(isStandardOpenSearchDatasource);

export const getInitialDatasourceId = (
  datasources: Datasource[],
  selectedDsIds?: string[]
): string => {
  const openSearchDatasources = getCreateAdRuleDatasources(datasources);
  const selected = selectedDsIds
    ?.map((id) => openSearchDatasources.find((datasource) => datasource.id === id))
    .find(Boolean);
  return selected?.id ?? '';
};

const DIRECTION_THRESHOLD_TYPES = new Set(['ACTUAL_IS_BELOW_EXPECTED', 'ACTUAL_IS_OVER_EXPECTED']);

const toCamelCaseKey = (key: string): string =>
  key.replace(/_([a-z0-9])/g, (_match, character: string) => character.toUpperCase());

const mapKeysToCamelCase = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(mapKeysToCamelCase);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      toCamelCaseKey(key),
      mapKeysToCamelCase(nestedValue),
    ])
  );
};

const normalizeFeatureForUpdate = (value: unknown): Record<string, unknown> => {
  const feature = asRecord(value);
  const aggregationQuery = getField(feature, 'aggregation_query', 'aggregationQuery');
  const normalized = mapKeysToCamelCase(
    Object.fromEntries(
      Object.entries(feature).filter(
        ([key]) => key !== 'aggregation_query' && key !== 'aggregationQuery'
      )
    )
  ) as Record<string, unknown>;
  return {
    ...normalized,
    ...(aggregationQuery !== undefined ? { aggregationQuery } : {}),
  };
};

const normalizeExistingResourceForUpdate = (
  resource?: ADDetector | ADForecaster
): Record<string, unknown> => {
  const stripped = stripReadOnlyResourceFields(resource);
  const filterQuery = getField(stripped, 'filter_query', 'filterQuery');
  const uiMetadata = getField(stripped, 'ui_metadata', 'uiMetadata');
  const featureAttributes = getField(stripped, 'feature_attributes', 'featureAttributes');
  const genericFields = Object.fromEntries(
    Object.entries(stripped).filter(
      ([key]) =>
        ![
          'filter_query',
          'filterQuery',
          'ui_metadata',
          'uiMetadata',
          'feature_attributes',
          'featureAttributes',
        ].includes(key)
    )
  );

  return {
    ...(mapKeysToCamelCase(genericFields) as Record<string, unknown>),
    ...(filterQuery !== undefined ? { filterQuery } : {}),
    ...(uiMetadata !== undefined ? { uiMetadata } : {}),
    ...(featureAttributes !== undefined
      ? { featureAttributes: asArray(featureAttributes).map(normalizeFeatureForUpdate) }
      : {}),
  };
};

const getRuleConditions = (rule: unknown): unknown[] => asArray(asRecord(rule).conditions);

const getConditionFeatureName = (condition: unknown): string =>
  stringValue(getField(asRecord(condition), 'feature_name', 'featureName'));

const getConditionThresholdType = (condition: unknown): string =>
  stringValue(getField(asRecord(condition), 'threshold_type', 'thresholdType'));

const isDirectionRule = (rule: unknown): boolean => {
  const conditions = getRuleConditions(rule);
  return (
    conditions.length === 1 &&
    DIRECTION_THRESHOLD_TYPES.has(getConditionThresholdType(conditions[0]))
  );
};

const inferFeatureDirection = (
  resource: Record<string, unknown>,
  featureName: string
): CreateAdFeatureFormState['anomalyDirection'] => {
  const directionCondition = asArray(resource.rules)
    .filter(isDirectionRule)
    .flatMap(getRuleConditions)
    .find((condition) => getConditionFeatureName(condition) === featureName);
  const thresholdType = getConditionThresholdType(directionCondition);
  if (thresholdType === 'ACTUAL_IS_BELOW_EXPECTED') return 'above';
  if (thresholdType === 'ACTUAL_IS_OVER_EXPECTED') return 'below';
  return 'both';
};

export const buildDetectorRules = (
  features: CreateAdFeatureFormState[],
  resource?: ADDetector | ADForecaster
): unknown[] => {
  const retainedFeatureNames = new Set(
    features.map((feature) => feature.featureName.trim()).filter(Boolean)
  );
  const preservedRules = asArray(asRecord(resource).rules)
    .filter((rule) => !isDirectionRule(rule))
    .filter((rule) => {
      const referencedFeatures = getRuleConditions(rule)
        .map(getConditionFeatureName)
        .filter(Boolean);
      return referencedFeatures.every((featureName) => retainedFeatureNames.has(featureName));
    })
    .map(mapKeysToCamelCase);
  const directionRules = features
    .filter((feature) => feature.featureName.trim() && feature.anomalyDirection !== 'both')
    .map((feature) => ({
      action: 'IGNORE_ANOMALY',
      conditions: [
        {
          featureName: feature.featureName.trim(),
          thresholdType:
            feature.anomalyDirection === 'above'
              ? 'ACTUAL_IS_BELOW_EXPECTED'
              : 'ACTUAL_IS_OVER_EXPECTED',
        },
      ],
    }));
  return [...preservedRules, ...directionRules];
};

const getUiMetadataFeatures = (resource: Record<string, unknown>): Record<string, unknown> =>
  asRecord(asRecord(getField(resource, 'ui_metadata', 'uiMetadata')).features);

const getFeatureMetadata = (
  resource: Record<string, unknown>,
  featureName: string
): Record<string, unknown> => asRecord(getUiMetadataFeatures(resource)[featureName]);

const getAggregationFromQuery = (
  feature: Record<string, unknown>
): Pick<CreateAdFeatureFormState, 'aggregationBy' | 'aggregationOf'> => {
  const query = asRecord(getField(feature, 'aggregation_query', 'aggregationQuery'));
  const aggregationName = Object.keys(query)[0];
  const aggregation = asRecord(query[aggregationName]);
  const aggregationBy = Object.keys(aggregation)[0];
  const aggregationDefinition = asRecord(aggregation[aggregationBy]);

  return {
    aggregationBy: aggregationBy || 'sum',
    aggregationOf: stringValue(aggregationDefinition.field),
  };
};

const buildFeatureFormState = (
  resource: Record<string, unknown>,
  rawFeature: unknown
): CreateAdFeatureFormState => {
  const feature = asRecord(rawFeature);
  const featureName =
    stringValue(getField(feature, 'feature_name', 'featureName')) ||
    stringValue(getField(feature, 'feature_id', 'featureId'));
  const metadata = getFeatureMetadata(resource, featureName);
  const queryAggregation = getAggregationFromQuery(feature);

  return {
    featureId: stringValue(getField(feature, 'feature_id', 'featureId')) || undefined,
    featureName,
    featureEnabled: booleanValue(getField(feature, 'feature_enabled', 'featureEnabled'), true),
    anomalyDirection: inferFeatureDirection(resource, featureName),
    aggregationBy: stringValue(metadata.aggregationBy) || queryAggregation.aggregationBy,
    aggregationOf: stringValue(metadata.aggregationOf) || queryAggregation.aggregationOf,
  };
};

const getFeatureForms = (resource: Record<string, unknown>): CreateAdFeatureFormState[] => {
  const features = asArray(getField(resource, 'feature_attributes', 'featureAttributes')).map(
    (feature) => buildFeatureFormState(resource, feature)
  );
  return features.length > 0 ? features : [createInitialFeature()];
};

const buildFeatureMetadata = (
  features: CreateAdFeatureFormState[],
  existingResource?: ADDetector | ADForecaster
) => {
  const existingFeatures = getUiMetadataFeatures(asRecord(existingResource));
  return features.reduce<Record<string, Record<string, unknown>>>((metadata, feature) => {
    const featureName = feature.featureName.trim();
    if (!featureName) return metadata;
    metadata[featureName] = {
      ...asRecord(existingFeatures[featureName]),
      featureType: SIMPLE_FEATURE_TYPE,
      aggregationBy: feature.aggregationBy,
      aggregationOf: feature.aggregationOf.trim(),
    };
    return metadata;
  }, {});
};

const buildUiMetadata = (
  features: CreateAdFeatureFormState[],
  existingResource?: ADDetector | ADForecaster
) => {
  const existingUiMetadata = asRecord(
    getField(asRecord(existingResource), 'ui_metadata', 'uiMetadata')
  );
  return {
    ...existingUiMetadata,
    features: buildFeatureMetadata(features, existingResource),
    filters: asArray(existingUiMetadata.filters),
  };
};

const buildFeatureAttributes = (
  features: CreateAdFeatureFormState[],
  existingResource?: ADDetector | ADForecaster
) => {
  const resource = asRecord(existingResource);
  const existingFeatures = asArray(getField(resource, 'feature_attributes', 'featureAttributes'));

  return features
    .filter((feature) => feature.featureName.trim())
    .map((feature) => {
      const featureName = feature.featureName.trim();
      const existingFeature = existingFeatures.find((candidate) => {
        const record = asRecord(candidate);
        const id = stringValue(getField(record, 'feature_id', 'featureId'));
        const name = stringValue(getField(record, 'feature_name', 'featureName'));
        return (feature.featureId && id === feature.featureId) || name === featureName;
      });
      const normalizedExistingFeature = normalizeFeatureForUpdate(existingFeature);
      const previousForm = existingFeature
        ? buildFeatureFormState(resource, existingFeature)
        : undefined;
      const aggregationUnchanged =
        previousForm?.aggregationBy === feature.aggregationBy &&
        previousForm?.aggregationOf === feature.aggregationOf;
      const aggregationQuery = aggregationUnchanged
        ? normalizedExistingFeature.aggregationQuery
        : {
            [toSnakeCase(featureName)]: {
              [feature.aggregationBy]: { field: feature.aggregationOf.trim() },
            },
          };

      return {
        ...normalizedExistingFeature,
        ...(feature.featureId ? { featureId: feature.featureId } : {}),
        featureName,
        featureEnabled: feature.featureEnabled,
        importance: normalizedExistingFeature.importance ?? 1,
        aggregationQuery,
      };
    });
};

const getCategoryFieldFromResource = (resource: Record<string, unknown>): string[] =>
  asArray(getField(resource, 'category_field', 'categoryField'))
    .map((field) => stringValue(field))
    .filter(Boolean);

const getConcurrencyFields = (resource: Record<string, unknown>): Record<string, number> => {
  const seqNo = numberValue(resource.seqNo ?? resource.seq_no);
  const primaryTerm = numberValue(resource.primaryTerm ?? resource.primary_term);
  return {
    ...(seqNo !== undefined ? { seqNo } : {}),
    ...(primaryTerm !== undefined ? { primaryTerm } : {}),
  };
};

const normalizeStateValue = (value: unknown): string => stringValue(value).trim();

const stateMatches = (state: string, values: string[]): boolean =>
  values.some((value) => state === value || state.toUpperCase() === value);

const getResourceState = (resource?: ADDetector | ADForecaster): string =>
  normalizeStateValue(getField(asRecord(resource), 'cur_state', 'curState'));

const getTaskState = (resource?: ADDetector | ADForecaster): string =>
  normalizeStateValue(getField(asRecord(resource), 'task_state', 'taskState'));

/**
 * Normalize a raw `curState` into the human-readable `MonitorStatus` domain that
 * {@link isAdResourceRunning} keys its Sets on. A real forecaster/detector
 * `cur_state` is the backend UPPER_SNAKE enum (`RUNNING`, `INITIALIZING_FORECAST`,
 * `AWAITING_DATA_TO_INIT`), while the shared predicate compares against the
 * prose form (`Running`, `Initializing forecast`, …). For every AD/forecaster
 * state the prose form is exactly the enum humanized — lowercase, `_`→space,
 * first letter capitalized — so normalizing here lets the shared predicate
 * actually engage instead of comparing an enum against prose (which never
 * matched). Values already in prose form are unchanged (idempotent).
 */
const toMonitorStatus = (rawState: string): MonitorStatus => {
  const spaced = rawState.trim().toLowerCase().replace(/_+/g, ' ');
  if (!spaced) return rawState as MonitorStatus;
  return (spaced.charAt(0).toUpperCase() + spaced.slice(1)) as MonitorStatus;
};

const getDetectorJob = (resource?: ADDetector | ADForecaster): Record<string, unknown> =>
  asRecord(getField(asRecord(resource), 'anomaly_detector_job', 'anomalyDetectorJob'));

const isDetectorRuntimeStateRunning = (resource?: ADDetector | ADForecaster): boolean => {
  const runningStates = [
    DETECTOR_RUNNING_STATE,
    DETECTOR_INITIALIZING_STATE,
    'RUNNING',
    'INIT',
    'CREATED',
  ];
  return [getResourceState(resource), getTaskState(resource)].some((state) =>
    stateMatches(state, runningStates)
  );
};

const isDetectorRealTimeJobRunning = (resource?: ADDetector | ADForecaster): boolean => {
  const jobEnabled = getField(getDetectorJob(resource), 'enabled', 'enabled');
  if (typeof jobEnabled === 'boolean') return jobEnabled;

  const topLevelEnabled = getField(asRecord(resource), 'enabled', 'enabled');
  if (typeof topLevelEnabled === 'boolean') return topLevelEnabled;

  return isDetectorRuntimeStateRunning(resource);
};

const isDetectorHistoricalJobRunning = (resource?: ADDetector | ADForecaster): boolean => {
  const taskState = getTaskState(resource);
  return stateMatches(taskState, [
    DETECTOR_RUNNING_STATE,
    DETECTOR_INITIALIZING_STATE,
    'RUNNING',
    'INIT',
  ]);
};

const getDetectorRunningJobsLabel = (resource?: ADDetector | ADForecaster): string => {
  const realTimeRunning = isDetectorRealTimeJobRunning(resource);
  const historicalRunning = isDetectorHistoricalJobRunning(resource);
  if (realTimeRunning && historicalRunning) return 'detector and historical analysis';
  if (realTimeRunning) return 'detector';
  if (historicalRunning) return 'historical analysis';
  return 'detector';
};

const isForecasterTestInitializing = (resource?: ADDetector | ADForecaster): boolean => {
  const state = getResourceState(resource);
  // Match both the prose form and the backend enum forms a real `curState` carries
  // (`INIT_TEST` / `INITIALIZING_TEST`) so the test-initializing state routes to the
  // dedicated "forecaster-test" blocker whether or not it was humanized upstream.
  return stateMatches(state, [FORECASTER_INIT_TEST_STATE, 'INIT_TEST', 'INITIALIZING_TEST']);
};

/**
 * Adapts a raw forecaster resource into the minimal `UnifiedRuleSummary` shape that
 * `isAdResourceRunning` reads (`status` + `enabled` + resource kind).
 *
 * The raw `curState`/`cur_state` is the backend UPPER_SNAKE enum, not the
 * human-readable `MonitorStatus` the shared status Sets are keyed on, so it is
 * run through {@link toMonitorStatus} first — otherwise `isAdResourceRunning`
 * would compare an enum against prose and never match (it would silently fall
 * back to `enabled`), defeating the point of sharing the predicate.
 *
 * The parameter type is the broad `ADDetector | ADForecaster` only because the single
 * caller (`isForecasterActiveForEdit`) holds that union; this adapter is forecaster-only
 * and intentionally hardcodes the `'forecaster'` kind (detectors use a different edit
 * lifecycle and never reach this path).
 */
const asForecasterRunningInput = (resource?: ADDetector | ADForecaster): UnifiedRuleSummary =>
  ({
    monitorType: 'forecaster',
    definitionType: 'forecaster',
    status: toMonitorStatus(getResourceState(resource)),
    enabled: booleanValue(getField(asRecord(resource), 'enabled', 'enabled'), false),
  }) as unknown as UnifiedRuleSummary;

const isForecasterActiveForEdit = (resource?: ADDetector | ADForecaster): boolean => {
  // This gate is a deliberate SUPERSET of `isAdResourceRunning` (the predicate the
  // detail flyout uses to show its Stop button) — the two do NOT fully agree, by design:
  //   - It reuses `isAdResourceRunning` (via `asForecasterRunningInput`, which
  //     normalizes the raw enum into the prose MonitorStatus domain) to block every
  //     running/initializing state — including the generic "Initializing" this gate
  //     used to miss, the gap that let the backend reject the update with a raw
  //     "Job is running: forecast-<id>" error.
  //   - It additionally blocks an enabled forecaster and the failure states (e.g.
  //     `FORECAST_FAILURE`) that `isAdResourceRunning` classifies as *not* running but
  //     that still can't be edited in place. The `stateMatches` list below (which also
  //     compares the uppercase enum form) is retained as defense-in-depth.
  if (isAdResourceRunning(asForecasterRunningInput(resource))) return true;
  const state = getResourceState(resource);
  return (
    booleanValue(getField(asRecord(resource), 'enabled', 'enabled'), false) ||
    stateMatches(state, [
      FORECASTER_RUNNING_STATE,
      FORECASTER_INITIALIZING_FORECAST_STATE,
      FORECASTER_AWAITING_DATA_TO_INIT_STATE,
      FORECASTER_AWAITING_DATA_TO_RESTART_STATE,
      FORECASTER_FORECAST_FAILURE_STATE,
      'RUNNING',
      'INITIALIZING_FORECAST',
      'AWAITING_DATA_TO_INIT',
      'AWAITING_DATA_TO_RESTART',
      'FORECAST_FAILURE',
    ])
  );
};

export const getEditLifecycleBlocker = (
  ruleType: CreateAdRuleType,
  resource: ADDetector | ADForecaster | undefined,
  hasStoppedForEdit: boolean
): EditLifecycleBlocker | null => {
  if (!resource || hasStoppedForEdit) return null;
  if (ruleType === 'detector') {
    return isDetectorRealTimeJobRunning(resource) || isDetectorHistoricalJobRunning(resource)
      ? 'detector-running'
      : null;
  }
  if (isForecasterTestInitializing(resource)) return 'forecaster-test';
  return isForecasterActiveForEdit(resource) ? 'forecaster-active' : null;
};

const stripReadOnlyResourceFields = (
  resource?: ADDetector | ADForecaster
): Record<string, unknown> => {
  const readonlyFields = new Set([
    'id',
    'primaryTerm',
    'primary_term',
    'seqNo',
    'seq_no',
    'lastUpdateTime',
    'last_update_time',
    'enabled',
    'enabledTime',
    'enabled_time',
    'disabledTime',
    'disabled_time',
    'curState',
    'cur_state',
    'stateError',
    'state_error',
    'initProgress',
    'init_progress',
    'anomaly_detector_job',
    'anomalyDetectorJob',
    'forecaster_job',
    'forecasterJob',
    'realtime_task',
    'realtimeTask',
    'run_once_task',
    'runOnceTask',
    'task_id',
    'taskId',
    'task_state',
    'taskState',
    'task_progress',
    'taskProgress',
    'task_error',
    'taskError',
  ]);

  return Object.fromEntries(
    Object.entries(asRecord(resource)).filter(([key]) => !readonlyFields.has(key))
  );
};

export const formFromAdResource = (
  ruleType: CreateAdRuleType,
  resource: ADDetector | ADForecaster,
  datasourceId: string
): CreateAdRuleFormState => {
  const rawResource = asRecord(resource);
  const categoryField = getCategoryFieldFromResource(rawResource);
  const resultIndex = stripResultIndexPrefix(
    getField(rawResource, 'result_index', 'resultIndex'),
    ruleType === 'detector' ? CUSTOM_AD_RESULT_INDEX_PREFIX : CUSTOM_FORECASTER_RESULT_INDEX_PREFIX
  );
  const resultIndexMinAge =
    numberValue(getField(rawResource, 'result_index_min_age', 'resultIndexMinAge')) ?? '';
  const resultIndexMinSize =
    numberValue(getField(rawResource, 'result_index_min_size', 'resultIndexMinSize')) ?? '';
  const resultIndexTtl =
    numberValue(getField(rawResource, 'result_index_ttl', 'resultIndexTtl')) ?? '';
  const interval =
    ruleType === 'detector'
      ? getPeriodInterval(rawResource, 'detection_interval', 'detectionInterval')
      : getPeriodInterval(rawResource, 'forecast_interval', 'forecastInterval');
  const frequency = getPeriodInterval(rawResource, 'frequency', 'frequency');

  return {
    ...createInitialForm(datasourceId),
    name: stringValue(rawResource.name),
    description: stringValue(rawResource.description),
    datasourceId,
    indices: asArray(rawResource.indices)
      .map((index) => stringValue(index))
      .filter(Boolean),
    timeField: stringValue(getField(rawResource, 'time_field', 'timeField')),
    filterQuery: formatFilterQueryForForm(getField(rawResource, 'filter_query', 'filterQuery')),
    customResultIndexEnabled: !!resultIndex,
    resultIndex,
    resultIndexMinAge,
    resultIndexMinSize,
    resultIndexTtl,
    customResultIndexLifecycleEnabled:
      resultIndexMinAge !== '' || resultIndexMinSize !== '' || resultIndexTtl !== '',
    flattenCustomResultIndex: booleanValue(
      getField(rawResource, 'flatten_custom_result_index', 'flattenCustomResultIndex'),
      false
    ),
    categoryFieldEnabled: categoryField.length > 0,
    categoryField,
    features: getFeatureForms(rawResource),
    shingleSize: numberValue(getField(rawResource, 'shingle_size', 'shingleSize')) ?? 8,
    interval,
    frequency: ruleType === 'detector' && frequency === '' ? interval : frequency,
    windowDelay: getPeriodInterval(rawResource, 'window_delay', 'windowDelay'),
    history: numberValue(rawResource.history) ?? '',
    horizon: numberValue(rawResource.horizon) ?? 24,
  };
};

export const buildRulePayload = (
  ruleType: CreateAdRuleType,
  form: CreateAdRuleFormState,
  options: {
    customResultIndexRequired?: boolean;
    existingResource?: ADDetector | ADForecaster;
  } = {}
) => {
  const existingResource = asRecord(options.existingResource);
  const commonPayload = {
    ...normalizeExistingResourceForUpdate(options.existingResource),
    ...getConcurrencyFields(existingResource),
    name: form.name.trim(),
    description: form.description.trim(),
    indices: form.indices,
    filterQuery: parseFilterQuery(form.filterQuery),
    uiMetadata: buildUiMetadata(form.features, options.existingResource),
    featureAttributes: buildFeatureAttributes(form.features, options.existingResource),
    timeField: form.timeField,
    windowDelay: {
      period: { interval: toPositiveInt(form.windowDelay, 0), unit: MINUTES_UNIT },
    },
    shingleSize: toPositiveInt(form.shingleSize, 8),
    categoryField: formatCategoryField(form),
  };

  if (ruleType === 'detector') {
    const shouldIncludeResultIndex =
      form.customResultIndexEnabled || options.customResultIndexRequired;
    const detectorInterval = Math.max(1, toPositiveInt(form.interval, 1));
    const detectorFrequency = parsePositiveInt(form.frequency) ?? detectorInterval;
    return {
      ...commonPayload,
      resultIndex: undefined,
      ...(shouldIncludeResultIndex && form.resultIndex.trim()
        ? {
            resultIndex: `${CUSTOM_AD_RESULT_INDEX_PREFIX}${form.resultIndex.trim()}`,
          }
        : {}),
      detectionInterval: {
        period: { interval: detectorInterval, unit: MINUTES_UNIT },
      },
      frequency: {
        period: { interval: detectorFrequency, unit: MINUTES_UNIT },
      },
      history: Math.max(1, toPositiveInt(form.history, 40)),
      rules: buildDetectorRules(form.features, options.existingResource),
    };
  }

  return {
    ...commonPayload,
    resultIndex: undefined,
    resultIndexMinAge: undefined,
    resultIndexMinSize: undefined,
    resultIndexTtl: undefined,
    flattenCustomResultIndex: undefined,
    ...(form.customResultIndexEnabled && form.resultIndex.trim()
      ? {
          resultIndex: `${CUSTOM_FORECASTER_RESULT_INDEX_PREFIX}${form.resultIndex.trim()}`,
          resultIndexMinAge: form.customResultIndexLifecycleEnabled
            ? parsePositiveInt(form.resultIndexMinAge)
            : undefined,
          resultIndexMinSize: form.customResultIndexLifecycleEnabled
            ? parsePositiveInt(form.resultIndexMinSize)
            : undefined,
          resultIndexTtl: form.customResultIndexLifecycleEnabled
            ? parsePositiveInt(form.resultIndexTtl)
            : undefined,
          flattenCustomResultIndex: form.flattenCustomResultIndex,
        }
      : {}),
    forecastInterval: {
      period: { interval: Math.max(1, toPositiveInt(form.interval, 1)), unit: MINUTES_UNIT },
    },
    horizon: Math.max(1, toPositiveInt(form.horizon, 24)),
    history: Math.max(1, toPositiveInt(form.history, 40)),
  };
};

const buildDetectorSuggestionPayload = (form: CreateAdRuleFormState, intervalOverride?: number) => {
  const categoryField = formatCategoryField(form);
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    indices: form.indices,
    filterQuery: parseFilterQuery(form.filterQuery),
    uiMetadata: {
      features: buildFeatureMetadata(form.features),
      filters: [],
    },
    featureAttributes: buildFeatureAttributes(form.features),
    timeField: form.timeField,
    shingleSize: toPositiveInt(form.shingleSize, 8),
    ...(categoryField ? { categoryField } : {}),
    ...(intervalOverride !== undefined
      ? {
          detectionInterval: {
            period: { interval: intervalOverride, unit: MINUTES_UNIT },
          },
        }
      : {}),
  };
};

const extractCreatedId = (response: ApiResponse): string | undefined => {
  const payload = response.response;
  return payload?.id || payload?.detectorId || payload?.forecasterId;
};

const buildErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return i18n.translate('observability.alerting.createAdRuleFlyout.unknownError', {
    defaultMessage: 'Unknown error',
  });
};

/**
 * The AD/forecasting backend rejects updates to a running resource with a raw
 * `Job is running: forecast-<id>` (or `detector-<id>`) string that leaks an internal
 * job id and offers no guidance. Detect that rejection and swap in actionable copy.
 */
const RUNNING_JOB_ERROR_PATTERN = /job is running/i;

export const humanizeAdUpdateError = (rawMessage: string, ruleType: CreateAdRuleType): string => {
  if (!RUNNING_JOB_ERROR_PATTERN.test(rawMessage)) return rawMessage;
  return ruleType === 'detector'
    ? i18n.translate('observability.alerting.createAdRuleFlyout.detectorRunningUpdateGuidance', {
        defaultMessage:
          'Stop the detector before editing its configuration, then restart it after your changes are saved.',
      })
    : i18n.translate('observability.alerting.createAdRuleFlyout.forecasterRunningUpdateGuidance', {
        defaultMessage:
          'Stop the forecaster before editing its configuration, then restart it after your changes are saved.',
      });
};

const featureErrorKey = (
  index: number,
  field: 'featureName' | 'aggregationOf' | 'featureLimit'
): string => `features.${index}.${field}`;

export const validateForm = (
  form: CreateAdRuleFormState,
  options: { customResultIndexRequired?: boolean; ruleType: CreateAdRuleType }
): Record<string, string> => {
  const errors: Record<string, string> = {};
  if (!form.name.trim()) {
    errors.name = i18n.translate('observability.alerting.createAdRuleFlyout.nameRequired', {
      defaultMessage: 'Rule name is required.',
    });
  }
  if (!form.datasourceId) {
    errors.datasourceId = i18n.translate(
      'observability.alerting.createAdRuleFlyout.datasourceRequired',
      {
        defaultMessage: 'OpenSearch datasource is required.',
      }
    );
  }
  if (form.indices.length === 0) {
    errors.indices = i18n.translate('observability.alerting.createAdRuleFlyout.indicesRequired', {
      defaultMessage: 'Select at least one index, alias, or pattern.',
    });
  }
  if (!form.timeField.trim()) {
    errors.timeField = i18n.translate(
      'observability.alerting.createAdRuleFlyout.timeFieldRequired',
      {
        defaultMessage: 'Time field is required.',
      }
    );
  }
  if (
    (form.customResultIndexEnabled || options.customResultIndexRequired) &&
    !form.resultIndex.trim()
  ) {
    errors.resultIndex = i18n.translate(
      'observability.alerting.createAdRuleFlyout.resultIndexRequired',
      {
        defaultMessage: 'Result index name is required.',
      }
    );
  }
  if (form.features.length === 0) {
    errors[featureErrorKey(0, 'featureName')] =
      options.ruleType === 'detector'
        ? i18n.translate('observability.alerting.createAdRuleFlyout.featureRequired', {
            defaultMessage: 'Add at least one feature.',
          })
        : i18n.translate('observability.alerting.createAdRuleFlyout.indicatorRequired', {
            defaultMessage: 'Add an indicator.',
          });
  }
  if (form.features.length > MAX_FEATURE_NUM) {
    errors[featureErrorKey(0, 'featureLimit')] = i18n.translate(
      'observability.alerting.createAdRuleFlyout.featureLimit',
      {
        defaultMessage: 'You can add up to 5 features.',
      }
    );
  }
  const featureNameCounts = form.features.reduce<Record<string, number>>((counts, feature) => {
    const featureName = feature.featureName.trim().toLowerCase();
    if (!featureName) return counts;
    counts[featureName] = (counts[featureName] ?? 0) + 1;
    return counts;
  }, {});
  form.features.forEach((feature, index) => {
    const featureName = feature.featureName.trim();
    if (!featureName) {
      errors[featureErrorKey(index, 'featureName')] =
        options.ruleType === 'detector'
          ? i18n.translate('observability.alerting.createAdRuleFlyout.featureNameRequired', {
              defaultMessage: 'Feature name is required.',
            })
          : i18n.translate('observability.alerting.createAdRuleFlyout.indicatorNameRequired', {
              defaultMessage: 'Indicator name is required.',
            });
    } else if (featureNameCounts[featureName.toLowerCase()] > 1) {
      errors[featureErrorKey(index, 'featureName')] =
        options.ruleType === 'detector'
          ? i18n.translate('observability.alerting.createAdRuleFlyout.featureNameDuplicate', {
              defaultMessage: 'Duplicate feature name.',
            })
          : i18n.translate('observability.alerting.createAdRuleFlyout.indicatorNameDuplicate', {
              defaultMessage: 'Duplicate indicator name.',
            });
    }
    if (!feature.aggregationOf.trim()) {
      errors[featureErrorKey(index, 'aggregationOf')] =
        options.ruleType === 'detector'
          ? i18n.translate('observability.alerting.createAdRuleFlyout.aggregationFieldRequired', {
              defaultMessage: 'Feature field is required.',
            })
          : i18n.translate('observability.alerting.createAdRuleFlyout.indicatorFieldRequired', {
              defaultMessage: 'Indicator field is required.',
            });
    }
  });
  if (form.categoryFieldEnabled && form.categoryField.length === 0) {
    errors.categoryField = i18n.translate(
      'observability.alerting.createAdRuleFlyout.categoryFieldRequired',
      {
        defaultMessage: 'Select at least one categorical field.',
      }
    );
  }
  if (form.categoryField.length > 2) {
    errors.categoryField = i18n.translate(
      'observability.alerting.createAdRuleFlyout.categoryFieldMax',
      {
        defaultMessage: 'Select no more than two categorical fields.',
      }
    );
  }
  if (form.filterQuery.trim()) {
    try {
      JSON.parse(form.filterQuery);
    } catch {
      errors.filterQuery = i18n.translate(
        'observability.alerting.createAdRuleFlyout.filterQueryInvalid',
        {
          defaultMessage: 'Filter query must be valid JSON.',
        }
      );
    }
  }
  const intervalValue = parsePositiveInt(form.interval);
  const frequencyValue = parsePositiveInt(form.frequency);
  const windowDelayValue = parseNonNegativeInt(form.windowDelay);
  const historyValue = parsePositiveInt(form.history);
  const horizonValue = parsePositiveInt(form.horizon);
  const resultIndexMinAgeValue = parsePositiveInt(form.resultIndexMinAge);
  const resultIndexMinSizeValue = parsePositiveInt(form.resultIndexMinSize);
  const resultIndexTtlValue = parsePositiveInt(form.resultIndexTtl);

  if (intervalValue === undefined) {
    errors.interval = i18n.translate('observability.alerting.createAdRuleFlyout.intervalInvalid', {
      defaultMessage: 'Interval must be at least 1 minute.',
    });
  }
  if (form.frequency !== '' && frequencyValue === undefined) {
    errors.frequency = i18n.translate(
      'observability.alerting.createAdRuleFlyout.frequencyInvalid',
      {
        defaultMessage: 'Frequency must be at least 1 minute.',
      }
    );
  }
  if (
    frequencyValue !== undefined &&
    intervalValue !== undefined &&
    frequencyValue % intervalValue !== 0
  ) {
    errors.frequency = i18n.translate(
      'observability.alerting.createAdRuleFlyout.frequencyMultipleInvalid',
      {
        defaultMessage: 'Frequency must be a multiple of interval.',
      }
    );
  }
  if (form.windowDelay !== '' && windowDelayValue === undefined) {
    errors.windowDelay = i18n.translate(
      'observability.alerting.createAdRuleFlyout.windowDelayInvalid',
      {
        defaultMessage: 'Window delay must be a non-negative integer.',
      }
    );
  }
  if (historyValue === undefined || historyValue < 40 || historyValue > 10000) {
    errors.history = i18n.translate('observability.alerting.createAdRuleFlyout.historyInvalid', {
      defaultMessage: 'History must be an integer between 40 and 10,000.',
    });
  }
  if (
    options.ruleType === 'forecaster' &&
    (horizonValue === undefined || horizonValue < 1 || horizonValue > 180)
  ) {
    errors.horizon = i18n.translate('observability.alerting.createAdRuleFlyout.horizonInvalid', {
      defaultMessage: 'Horizon must be an integer between 1 and 180.',
    });
  }
  if (
    options.ruleType === 'forecaster' &&
    form.customResultIndexEnabled &&
    form.customResultIndexLifecycleEnabled
  ) {
    if (form.resultIndexMinAge !== '' && resultIndexMinAgeValue === undefined) {
      errors.resultIndexMinAge = i18n.translate(
        'observability.alerting.createAdRuleFlyout.resultIndexMinAgeInvalid',
        { defaultMessage: 'Minimum index age must be a positive integer.' }
      );
    }
    if (
      form.resultIndexMinSize !== '' &&
      (resultIndexMinSizeValue === undefined || resultIndexMinSizeValue < 1000)
    ) {
      errors.resultIndexMinSize = i18n.translate(
        'observability.alerting.createAdRuleFlyout.resultIndexMinSizeInvalid',
        { defaultMessage: 'Minimum index size must be at least 1,000 MB.' }
      );
    }
    if (form.resultIndexTtl !== '' && resultIndexTtlValue === undefined) {
      errors.resultIndexTtl = i18n.translate(
        'observability.alerting.createAdRuleFlyout.resultIndexTtlInvalid',
        { defaultMessage: 'Index TTL must be a positive integer.' }
      );
    }
  }
  if (form.shingleSize < 1 || form.shingleSize > 128) {
    errors.shingleSize = i18n.translate(
      'observability.alerting.createAdRuleFlyout.shingleInvalid',
      {
        defaultMessage: 'Shingle size must be between 1 and 128.',
      }
    );
  }
  return errors;
};

const errorsForStep = (
  errors: Record<string, string>,
  step: number,
  ruleType: CreateAdRuleType
): Record<string, string> => {
  let stepFields: string[];
  if (ruleType === 'detector') {
    stepFields =
      step === 0
        ? ['name', 'datasourceId', 'indices', 'timeField', 'filterQuery', 'resultIndex']
        : step === 1
          ? [
              'features',
              'categoryField',
              'interval',
              'frequency',
              'windowDelay',
              'history',
              'shingleSize',
            ]
          : step === 2
            ? []
            : Object.keys(errors);
  } else {
    stepFields =
      step === 0
        ? [
            'name',
            'datasourceId',
            'indices',
            'timeField',
            'filterQuery',
            'features',
            'categoryField',
          ]
        : step === 1
          ? [
              'interval',
              'windowDelay',
              'history',
              'horizon',
              'shingleSize',
              'resultIndex',
              'resultIndexMinAge',
              'resultIndexMinSize',
              'resultIndexTtl',
            ]
          : Object.keys(errors);
  }

  return Object.fromEntries(
    Object.entries(errors).filter(
      ([key]) =>
        stepFields.includes(key) || (stepFields.includes('features') && key.startsWith('features.'))
    )
  );
};

const AdLearnMore: React.FC = () => (
  <EuiLink href={AD_DOCS_LINK} target="_blank">
    {i18n.translate('observability.alerting.createAdRuleFlyout.learnMore', {
      defaultMessage: 'Learn more',
    })}
  </EuiLink>
);

const AdContentPanel: React.FC<{
  title: string | ReactNode;
  subTitle?: ReactNode;
  children?: ReactNode;
  hideBody?: boolean;
}> = ({ title, subTitle, children, hideBody }) => {
  const hasTitle = typeof title === 'string' ? title !== '' : true;

  return (
    <EuiPanel style={{ padding: 20 }}>
      <EuiFlexGroup style={{ padding: 0 }} justifyContent="spaceBetween" alignItems="center">
        <EuiFlexItem>
          {typeof title === 'string' ? (
            <EuiTitle data-test-subj="contentPanelTitle" size="s">
              <h3>{title}</h3>
            </EuiTitle>
          ) : (
            title
          )}
          {subTitle && (
            <EuiFlexGroup>
              <EuiFlexItem
                className="content-panel-subTitle"
                style={{ lineHeight: 'normal', maxWidth: '75%' }}
              >
                {subTitle}
              </EuiFlexItem>
            </EuiFlexGroup>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
      {hasTitle && !hideBody && (
        <div>
          <EuiHorizontalRule margin="s" />
          <div style={{ padding: '10px 0px' }}>{children}</div>
        </div>
      )}
    </EuiPanel>
  );
};

const AdFormattedFormRow: React.FC<{
  title?: string;
  formattedTitle?: ReactNode;
  hint?: string | string[] | ReactNode | ReactNode[];
  isInvalid?: boolean;
  error?: ReactNode;
  fullWidth?: boolean;
  helpText?: string;
  rowStyle?: React.CSSProperties;
  children: ReactElement;
}> = ({ title, formattedTitle, hint, children, rowStyle, ...formRowProps }) => {
  const hints = hint
    ? (Array.isArray(hint) ? hint : [hint]).map((hintItem, index) => (
        <EuiText key={index} className="sublabel" style={{ maxWidth: 400 }}>
          {hintItem}
        </EuiText>
      ))
    : null;

  return (
    <EuiFormRow
      label={
        <div style={{ lineHeight: '8px' }}>
          {formattedTitle || <p>{title}</p>}
          <br />
          {hints}
        </div>
      }
      style={rowStyle}
      {...formRowProps}
    >
      {children}
    </EuiFormRow>
  );
};

const AdIndexPicker: React.FC<{
  dsId: string;
  selected: string[];
  onChange: (next: string[]) => void;
  isInvalid?: boolean;
  error?: string;
}> = ({ dsId, selected, onChange, isInvalid, error }) => {
  const [search, setSearch] = useState('');
  const { options: discovered, isLoading, error: discoveryError } = useIndices({ dsId, search });

  const selectedOptions: EuiComboBoxOptionOption[] = selected.map((label) => ({ label }));
  const discoveredOptions: EuiComboBoxOptionOption[] = discovered
    .filter((option) => !selected.includes(option.label))
    .map((option) => ({
      label: option.label,
      append: option.aliasFor
        ? i18n.translate('observability.alerting.createAdRuleFlyout.aliasBadge', {
            defaultMessage: 'alias -> {target}',
            values: { target: option.aliasFor },
          })
        : undefined,
    }));

  const discoveryErrorMessage = discoveryError
    ? i18n.translate('observability.alerting.createAdRuleFlyout.indexDiscoveryError', {
        defaultMessage: 'Could not load indices: {message}',
        values: { message: discoveryError.message || 'unknown error' },
      })
    : undefined;

  return (
    <AdFormattedFormRow
      title={i18n.translate('observability.alerting.createAdRuleFlyout.indexLabel', {
        defaultMessage: 'Index',
      })}
      hint={i18n.translate('observability.alerting.createAdRuleFlyout.indexHint', {
        defaultMessage: 'Choose an index, index pattern or alias as the data source.',
      })}
      helpText={i18n.translate('observability.alerting.createAdRuleFlyout.indexHelp', {
        defaultMessage: 'You can use a wildcard (*) in your index pattern.',
      })}
      isInvalid={isInvalid || !!discoveryErrorMessage}
      error={error || discoveryErrorMessage}
    >
      <EuiComboBox
        async
        isLoading={isLoading}
        isClearable={false}
        isDisabled={!dsId}
        options={discoveredOptions}
        selectedOptions={selectedOptions}
        onSearchChange={setSearch}
        onCreateOption={(raw) => {
          const trimmed = raw.trim();
          if (trimmed && !selected.includes(trimmed)) onChange([...selected, trimmed]);
        }}
        onChange={(options) => onChange(options.map((option) => option.label))}
        placeholder={i18n.translate('observability.alerting.createAdRuleFlyout.indexPlaceholder', {
          defaultMessage: 'Find indices',
        })}
        data-test-subj="alertManagerCreateAdRuleIndex"
      />
    </AdFormattedFormRow>
  );
};

const AdTimestampSelector: React.FC<{
  dsId: string;
  indices: string[];
  value: string;
  onChange: (next: string) => void;
  isInvalid?: boolean;
  error?: string;
}> = ({ dsId, indices, value, onChange, isInvalid, error }) => {
  const { fieldsByType, isLoading } = useIndexMappings({ dsId, indices });

  const timeStampFieldOptions = useMemo(() => {
    const fields = new Set<string>();
    (fieldsByType.date ?? []).forEach((field) => fields.add(field));
    (fieldsByType.date_nanos ?? []).forEach((field) => fields.add(field));
    return Array.from(fields)
      .sort()
      .map((field) => ({ label: field }));
  }, [fieldsByType]);

  const selectedOptions: EuiComboBoxOptionOption[] = value ? [{ label: value }] : [];

  return (
    <AdFormattedFormRow
      title={i18n.translate('observability.alerting.createAdRuleFlyout.timestampFieldLabel', {
        defaultMessage: 'Timestamp field',
      })}
      hint={i18n.translate('observability.alerting.createAdRuleFlyout.timestampFieldHint', {
        defaultMessage: 'Choose the time field you want to use for time filter.',
      })}
      isInvalid={isInvalid}
      error={error}
    >
      <EuiComboBox
        singleSelection={{ asPlainText: true }}
        isClearable={false}
        isDisabled={indices.length === 0}
        isLoading={isLoading}
        options={timeStampFieldOptions}
        selectedOptions={selectedOptions}
        onCreateOption={(raw) => {
          const trimmed = raw.trim();
          if (trimmed) onChange(trimmed);
        }}
        onChange={(options) => onChange(options[0]?.label ?? '')}
        placeholder={i18n.translate(
          'observability.alerting.createAdRuleFlyout.timestampFieldPlaceholder',
          {
            defaultMessage: 'Find timestamp',
          }
        )}
        data-test-subj="alertManagerCreateAdRuleTimestamp"
      />
    </AdFormattedFormRow>
  );
};

const FeatureFieldSelector: React.FC<{
  dsId: string;
  indices: string[];
  aggregationBy: string;
  value: string;
  onChange: (next: string) => void;
  isInvalid?: boolean;
  error?: string;
  dataTestSubj?: string;
}> = ({ dsId, indices, aggregationBy, value, onChange, isInvalid, error, dataTestSubj }) => {
  const { fieldsByType, isLoading } = useIndexMappings({ dsId, indices });

  const fieldOptions = useMemo(() => {
    const allowedTypes = aggregationBy === 'value_count' ? COUNTABLE_TYPES : NUMBER_TYPES;
    const seen = new Set<string>();
    allowedTypes.forEach((type) => {
      (fieldsByType[type] ?? []).forEach((field) => seen.add(field));
    });
    return Array.from(seen)
      .sort()
      .map((field) => ({ label: field }));
  }, [aggregationBy, fieldsByType]);

  const selectedOptions: EuiComboBoxOptionOption[] = value ? [{ label: value }] : [];

  return (
    <EuiFormRow
      label={i18n.translate('observability.alerting.createAdRuleFlyout.featureFieldLabel', {
        defaultMessage: 'Field',
      })}
      isInvalid={isInvalid}
      error={error}
    >
      <EuiComboBox
        singleSelection={{ asPlainText: true }}
        isClearable
        isDisabled={!dsId || indices.length === 0}
        isLoading={isLoading}
        isInvalid={isInvalid}
        options={fieldOptions}
        selectedOptions={selectedOptions}
        onChange={(picked) => onChange(picked[0]?.label ?? '')}
        onCreateOption={(raw) => {
          const trimmed = raw.trim();
          if (trimmed) onChange(trimmed);
        }}
        placeholder={i18n.translate(
          'observability.alerting.createAdRuleFlyout.featureFieldPlaceholder',
          {
            defaultMessage: 'Select field',
          }
        )}
        data-test-subj={dataTestSubj ?? 'alertManagerCreateAdRuleFeatureField'}
      />
    </EuiFormRow>
  );
};

const CategoryFieldSelector: React.FC<{
  dsId: string;
  indices: string[];
  ruleType: CreateAdRuleType;
  enabled: boolean;
  selected: string[];
  onEnabledChange: (next: boolean) => void;
  onChange: (next: string[]) => void;
  isInvalid?: boolean;
  error?: string;
}> = ({
  dsId,
  indices,
  ruleType,
  enabled,
  selected,
  onEnabledChange,
  onChange,
  isInvalid,
  error,
}) => {
  const { fieldsByType, isLoading } = useIndexMappings({ dsId, indices });

  const categoryOptions = useMemo(() => {
    const seen = new Set<string>();
    CATEGORY_TYPES.forEach((type) => {
      (fieldsByType[type] ?? []).forEach((field) => seen.add(field));
    });
    return Array.from(seen)
      .sort()
      .map((field) => ({ label: field }));
  }, [fieldsByType]);

  const selectedOptions = selected.map((field) => ({ label: field }));
  const noCategoryFields = !isLoading && categoryOptions.length === 0;

  return (
    <AdContentPanel
      title={
        <EuiTitle size="s" id="categoryFieldTitle">
          <h2>
            {i18n.translate('observability.alerting.createAdRuleFlyout.detectorCategoryTitle', {
              defaultMessage: 'Categorical fields',
            })}
          </h2>
        </EuiTitle>
      }
      subTitle={
        <EuiText className="content-panel-subTitle" style={{ lineHeight: 'normal' }}>
          {ruleType === 'detector'
            ? i18n.translate('observability.alerting.createAdRuleFlyout.detectorCategoryHelp', {
                defaultMessage:
                  'Split a single time series into multiple time series based on categorical fields. You can select up to 2.',
              })
            : i18n.translate('observability.alerting.createAdRuleFlyout.forecasterCategoryHelp', {
                defaultMessage:
                  'Split time series using categorical fields. You can select up to 2.',
              })}{' '}
          <AdLearnMore />
        </EuiText>
      }
    >
      {noCategoryFields && (
        <>
          <EuiCallOut
            color="warning"
            iconType="alert"
            size="s"
            title={i18n.translate('observability.alerting.createAdRuleFlyout.noCategoryFields', {
              defaultMessage: 'There are no available category fields for the selected index',
            })}
          />
          <EuiSpacer size="m" />
        </>
      )}
      <EuiFlexGroup direction="column">
        <EuiFlexItem>
          <EuiCheckbox
            id="categoryFieldCheckbox"
            label={
              ruleType === 'detector'
                ? i18n.translate(
                    'observability.alerting.createAdRuleFlyout.enableDetectorCategory',
                    {
                      defaultMessage: 'Enable categorical fields',
                    }
                  )
                : i18n.translate(
                    'observability.alerting.createAdRuleFlyout.enableForecasterCategory',
                    {
                      defaultMessage: 'Split time series using categorical fields',
                    }
                  )
            }
            checked={enabled}
            disabled={noCategoryFields || !dsId || indices.length === 0}
            onChange={(e) => {
              const checked = e.target.checked;
              onEnabledChange(checked);
              if (!checked) onChange([]);
            }}
          />
        </EuiFlexItem>
        {enabled && ruleType === 'detector' && (
          <EuiFlexItem>
            <EuiCallOut
              color="warning"
              iconType="alert"
              size="s"
              title={i18n.translate(
                'observability.alerting.createAdRuleFlyout.categoryReadonlyWarning',
                {
                  defaultMessage:
                    "You can't change the category fields after you create the detector. Make sure that you only select the fields necessary for your use case.",
                }
              )}
            />
          </EuiFlexItem>
        )}
        {enabled && !noCategoryFields && (
          <EuiFlexItem>
            <EuiFormRow
              label={
                ruleType === 'detector'
                  ? i18n.translate('observability.alerting.createAdRuleFlyout.categoryFieldLabel', {
                      defaultMessage: 'Field',
                    })
                  : i18n.translate(
                      'observability.alerting.createAdRuleFlyout.forecasterCategoryFieldLabel',
                      {
                        defaultMessage: 'Categorical fields',
                      }
                    )
              }
              helpText={i18n.translate(
                'observability.alerting.createAdRuleFlyout.categoryFieldHelp',
                {
                  defaultMessage:
                    "You can only apply the categorical fields to the 'ip' and 'keyword' OpenSearch data types.",
                }
              )}
              isInvalid={isInvalid}
              error={error}
            >
              <EuiComboBox
                isClearable
                isLoading={isLoading}
                isInvalid={isInvalid}
                options={categoryOptions}
                selectedOptions={selectedOptions}
                onChange={(options) => {
                  onChange(options.slice(0, 2).map((option) => option.label));
                }}
                placeholder={i18n.translate(
                  'observability.alerting.createAdRuleFlyout.categoryFieldPlaceholder',
                  {
                    defaultMessage: 'Select your categorical fields',
                  }
                )}
                data-test-subj="alertManagerCreateAdRuleCategoryField"
              />
            </EuiFormRow>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </AdContentPanel>
  );
};

const SuggestParametersDialog: React.FC<{
  form: CreateAdRuleFormState;
  onClose: () => void;
  onUseSuggestedParameters: (values: {
    interval: number;
    frequency: number;
    history: number;
    windowDelay: number;
  }) => void;
}> = ({ form, onClose, onUseSuggestedParameters }) => {
  const [suggestMode, setSuggestMode] = useState<'all' | 'provided'>('all');
  const [providedInterval, setProvidedInterval] = useState<string>(
    String(parsePositiveInt(form.interval) ?? 10)
  );
  const [step, setStep] = useState<SuggestDialogStep>('config');
  const [errorMsg, setErrorMsg] = useState<string | undefined>();
  const [suggestedInterval, setSuggestedInterval] = useState<number | undefined>();
  const [suggestedHistory, setSuggestedHistory] = useState<number | undefined>();
  const [suggestedWindowDelay, setSuggestedWindowDelay] = useState<number | undefined>();

  const radioOptions = [
    {
      id: 'all',
      label: i18n.translate('observability.alerting.createAdRuleFlyout.suggestAllParams', {
        defaultMessage: 'Suggest detection interval, frequency, history, and window delay',
      }),
    },
    {
      id: 'provided',
      label: i18n.translate(
        'observability.alerting.createAdRuleFlyout.suggestWithProvidedInterval',
        {
          defaultMessage: 'Suggest frequency, history, and window delay for the provided interval',
        }
      ),
    },
  ];

  const onGenerateSuggestions = async () => {
    setStep('loading');
    setErrorMsg(undefined);
    setSuggestedInterval(undefined);
    setSuggestedHistory(undefined);
    setSuggestedWindowDelay(undefined);

    const parsedInterval = Number(providedInterval);
    const intervalForSuggestion =
      suggestMode === 'all' || Number.isNaN(parsedInterval) ? undefined : parsedInterval;
    const suggestionParams =
      suggestMode === 'all' ? 'detection_interval,history,window_delay' : 'history,window_delay';

    try {
      const response = await coreRefs.http?.post<
        ApiResponse<DetectorSuggestionResponse> | DetectorSuggestionResponse
      >(withAdApiDataSource(`${AD_DETECTOR_API}/_suggest/${suggestionParams}`, form.datasourceId), {
        body: JSON.stringify(buildDetectorSuggestionPayload(form, intervalForSuggestion)),
      });
      const payload =
        response && 'response' in response
          ? (response.response as DetectorSuggestionResponse | undefined)
          : response;

      if (!payload) {
        setErrorMsg(
          i18n.translate('observability.alerting.createAdRuleFlyout.suggestEmptyResponse', {
            defaultMessage: 'Empty response from suggestDetector.',
          })
        );
        setStep('error');
        return;
      }

      if (payload.exception) {
        setErrorMsg(String(payload.exception));
        setStep('error');
        return;
      }

      const intervalValue =
        payload.detectionInterval?.period?.interval ?? payload.interval?.period?.interval;
      const frequencyValue = payload.frequency?.period?.interval;
      const derivedInterval =
        typeof intervalValue === 'number'
          ? intervalValue
          : typeof frequencyValue === 'number'
            ? frequencyValue
            : 10;

      const historyValue = payload.history;
      const windowDelayValue = payload.windowDelay?.period?.interval;

      setSuggestedInterval(derivedInterval);
      setSuggestedHistory(typeof historyValue === 'number' ? historyValue : 40);
      setSuggestedWindowDelay(typeof windowDelayValue === 'number' ? windowDelayValue : 1);
      setStep('result');
    } catch (error) {
      setErrorMsg(buildErrorMessage(error));
      setStep('error');
    }
  };

  const useSuggestedParameters = () => {
    const intervalToUse = suggestedInterval ?? 10;
    onUseSuggestedParameters({
      interval: intervalToUse,
      frequency: intervalToUse,
      history: suggestedHistory ?? 40,
      windowDelay: suggestedWindowDelay ?? 1,
    });
    onClose();
  };

  const isConfig = step === 'config';
  const isLoading = step === 'loading';
  const isError = step === 'error';
  const isResult = step === 'result';

  return (
    <EuiModal onClose={onClose} initialFocus="[name=radioGroup]">
      <EuiModalHeader>
        <EuiModalHeaderTitle data-test-subj="suggestParametersDialogTitle">
          <h2>
            {i18n.translate('observability.alerting.createAdRuleFlyout.suggestTitle', {
              defaultMessage: 'Suggest parameters',
            })}
          </h2>
        </EuiModalHeaderTitle>
      </EuiModalHeader>

      <EuiModalBody>
        {isConfig && (
          <>
            <EuiText>
              <p>
                {i18n.translate('observability.alerting.createAdRuleFlyout.suggestBody', {
                  defaultMessage:
                    'Based on your data source and current configuration, OpenSearch can recommend core parameters for your detector.',
                })}
              </p>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiRadioGroup
              name="radioGroup"
              options={radioOptions}
              idSelected={suggestMode}
              onChange={(optionId) => setSuggestMode(optionId as 'all' | 'provided')}
            />
            <EuiSpacer size="m" />
            {suggestMode === 'provided' && (
              <EuiFormRow
                label={i18n.translate(
                  'observability.alerting.createAdRuleFlyout.providedIntervalLabel',
                  {
                    defaultMessage: 'Detection interval',
                  }
                )}
                helpText={i18n.translate(
                  'observability.alerting.createAdRuleFlyout.providedIntervalHelp',
                  {
                    defaultMessage: 'A valid interval is from 1 minute to 30 days.',
                  }
                )}
              >
                <EuiFieldNumber
                  min={1}
                  max={43200}
                  value={providedInterval}
                  onChange={(e) => setProvidedInterval(e.target.value)}
                  append={i18n.translate(
                    'observability.alerting.createAdRuleFlyout.minutesAppend',
                    {
                      defaultMessage: 'minutes',
                    }
                  )}
                />
              </EuiFormRow>
            )}
          </>
        )}

        {isLoading && (
          <>
            <EuiLoadingSpinner size="m" />
            <EuiText size="s">
              <p>
                {i18n.translate('observability.alerting.createAdRuleFlyout.suggestLoading', {
                  defaultMessage: 'Calculating model parameters...',
                })}
              </p>
              <p>
                {i18n.translate('observability.alerting.createAdRuleFlyout.suggestLoadingHelp', {
                  defaultMessage:
                    'The calculation might take a few minutes. Do not close this window.',
                })}
              </p>
            </EuiText>
          </>
        )}

        {isError && (
          <EuiCallOut
            title={i18n.translate('observability.alerting.createAdRuleFlyout.suggestError', {
              defaultMessage: 'Error',
            })}
            color="danger"
            iconType="alert"
          >
            <p>{errorMsg}</p>
          </EuiCallOut>
        )}

        {isResult && (
          <EuiText data-test-subj="suggestedParametersResult">
            <p>
              {i18n.translate('observability.alerting.createAdRuleFlyout.suggestResultIntro', {
                defaultMessage: 'Based on your inputs, the suggested parameters are:',
              })}
            </p>
            <div className="eui-textLeft">
              <span>
                • Detection interval: {suggestedInterval} minutes
                <br />
              </span>
              <span>
                • Frequency: {suggestedInterval} minutes
                <br />
              </span>
              <span>
                • History: {suggestedHistory} intervals
                {suggestedInterval && suggestedHistory && (
                  <>
                    {' '}
                    ({Math.floor((suggestedHistory * suggestedInterval) / 60)} hours{' '}
                    {(suggestedHistory * suggestedInterval) % 60} minutes)
                  </>
                )}
                <br />
              </span>
              <span>• Window delay: {suggestedWindowDelay} minutes</span>
            </div>
          </EuiText>
        )}
      </EuiModalBody>

      <EuiModalFooter>
        <EuiSmallButtonEmpty onClick={onClose}>
          {i18n.translate('observability.alerting.createAdRuleFlyout.suggestCancel', {
            defaultMessage: 'Cancel',
          })}
        </EuiSmallButtonEmpty>
        {isConfig && (
          <EuiSmallButton
            fill
            iconType="arrowRight"
            iconSide="right"
            data-test-subj="generateSuggestionsButton"
            onClick={onGenerateSuggestions}
          >
            {i18n.translate('observability.alerting.createAdRuleFlyout.generateSuggestions', {
              defaultMessage: 'Generate suggestions',
            })}
          </EuiSmallButton>
        )}
        {(isLoading || isError || isResult) && (
          <EuiSmallButton iconType="arrowLeft" onClick={() => setStep('config')}>
            {i18n.translate('observability.alerting.createAdRuleFlyout.suggestBack', {
              defaultMessage: 'Back',
            })}
          </EuiSmallButton>
        )}
        {isResult && (
          <EuiSmallButton
            fill
            color="primary"
            onClick={useSuggestedParameters}
            data-test-subj="useSuggestedParametersButton"
          >
            {i18n.translate('observability.alerting.createAdRuleFlyout.useSuggestedParameters', {
              defaultMessage: 'Use suggested parameters',
            })}
          </EuiSmallButton>
        )}
      </EuiModalFooter>
    </EuiModal>
  );
};

export const CreateAdRuleFlyout: React.FC<CreateAdRuleFlyoutProps> = ({
  ruleType,
  datasources,
  selectedDsIds,
  mode = 'create',
  editTarget,
  onCancel,
  onCreated,
  onUpdated,
}) => {
  const isEdit = mode === 'edit' && !!editTarget;
  const openSearchDatasources = useMemo(
    () =>
      isEdit
        ? datasources.filter((datasource) => datasource.type === 'opensearch')
        : getCreateAdRuleDatasources(datasources),
    [datasources, isEdit]
  );
  const isDetectorSettingsEdit =
    isEdit && ruleType === 'detector' && editTarget?.initialStep !== 'model';
  const isDetectorModelEdit =
    isEdit && ruleType === 'detector' && editTarget?.initialStep === 'model';
  const isSingleDetectorEdit = isDetectorSettingsEdit || isDetectorModelEdit;
  const editValidationStep = isDetectorModelEdit ? 1 : 0;
  const getInitialStep = useCallback(() => 0, []);
  const [form, setForm] = useState<CreateAdRuleFormState>(() =>
    createInitialForm(
      isEdit && editTarget
        ? editTarget.datasourceId
        : getInitialDatasourceId(datasources, selectedDsIds)
    )
  );
  const [currentStep, setCurrentStep] = useState(getInitialStep);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showSuggestDialog, setShowSuggestDialog] = useState(false);
  const [isServerless, setIsServerless] = useState(false);
  const [hasLoadedEditForm, setHasLoadedEditForm] = useState(false);
  const [hasStoppedForEdit, setHasStoppedForEdit] = useState(false);
  const [shouldOfferStartDetectorAfterEdit, setShouldOfferStartDetectorAfterEdit] = useState(false);
  const [startAfterEditPrompt, setStartAfterEditPrompt] = useState<{
    detectorId: string;
    datasourceId: string;
  } | null>(null);
  const [showStopForEditModal, setShowStopForEditModal] = useState(false);
  const [isStoppingForEdit, setIsStoppingForEdit] = useState(false);
  const [isStartingEditedDetector, setIsStartingEditedDetector] = useState(false);
  const { data: editDetail, error: editDetailError } = useRuleDetail(
    editTarget?.datasourceId,
    editTarget?.id,
    isEdit ? ruleType : undefined
  );
  const existingResource = editDetail?.raw as ADDetector | ADForecaster | undefined;

  const isDetector = ruleType === 'detector';
  const customResultIndexRequired = isDetector && isServerless;
  const resultIndexEnabled = form.customResultIndexEnabled || customResultIndexRequired;
  const isEditFormReady = !isEdit || hasLoadedEditForm;
  const editLifecycleBlocker = isEdit
    ? getEditLifecycleBlocker(ruleType, existingResource, hasStoppedForEdit)
    : null;
  const title = isEdit
    ? isDetector
      ? i18n.translate('observability.alerting.createAdRuleFlyout.editDetectorTitle', {
          defaultMessage: 'Edit anomaly detection rule',
        })
      : i18n.translate('observability.alerting.createAdRuleFlyout.editForecasterTitle', {
          defaultMessage: 'Edit forecasting rule',
        })
    : isDetector
      ? i18n.translate('observability.alerting.createAdRuleFlyout.detectorTitle', {
          defaultMessage: 'Create anomaly detection rule',
        })
      : i18n.translate('observability.alerting.createAdRuleFlyout.forecasterTitle', {
          defaultMessage: 'Create forecasting rule',
        });
  const detectorStepTitles = isEdit
    ? [
        isDetectorModelEdit
          ? i18n.translate('observability.alerting.createAdRuleFlyout.editModelStep', {
              defaultMessage: 'Edit model configuration',
            })
          : i18n.translate('observability.alerting.createAdRuleFlyout.editDetectorSettingsStep', {
              defaultMessage: 'Edit detector settings',
            }),
      ]
    : [
        i18n.translate('observability.alerting.createAdRuleFlyout.defineDetectorStep', {
          defaultMessage: 'Define detector',
        }),
        i18n.translate('observability.alerting.createAdRuleFlyout.configureModelStep', {
          defaultMessage: 'Configure model',
        }),
        i18n.translate('observability.alerting.createAdRuleFlyout.detectorJobsStep', {
          defaultMessage: 'Set up detector jobs',
        }),
        i18n.translate('observability.alerting.createAdRuleFlyout.reviewStep', {
          defaultMessage: 'Review and create',
        }),
      ];
  const stepTitles = isDetector
    ? detectorStepTitles
    : [
        i18n.translate('observability.alerting.createAdRuleFlyout.defineForecasterStep', {
          defaultMessage: 'Define data source',
        }),
        i18n.translate('observability.alerting.createAdRuleFlyout.configureForecastStep', {
          defaultMessage: 'Add model parameters',
        }),
      ];
  const finalStep = stepTitles.length - 1;
  const allErrors = validateForm(form, { customResultIndexRequired, ruleType });
  const currentValidationStep = isSingleDetectorEdit ? editValidationStep : currentStep;
  const submitBlockingErrors = isEdit
    ? errorsForStep(allErrors, currentValidationStep, ruleType)
    : allErrors;
  const visibleErrors = hasSubmitted
    ? errorsForStep(allErrors, currentValidationStep, ruleType)
    : {};

  useEffect(() => {
    if (!isEdit || !editTarget) return;
    setHasLoadedEditForm(false);
    setForm(createInitialForm(editTarget.datasourceId));
    setCurrentStep(getInitialStep());
    setHasSubmitted(false);
    setSubmitError(null);
    setHasStoppedForEdit(false);
    setShouldOfferStartDetectorAfterEdit(false);
    setStartAfterEditPrompt(null);
    setShowStopForEditModal(false);
    setIsStoppingForEdit(false);
    setIsStartingEditedDetector(false);
  }, [editTarget, getInitialStep, isEdit]);

  useEffect(() => {
    if (!isEdit || hasLoadedEditForm || !editTarget || !existingResource) return;
    setForm(formFromAdResource(ruleType, existingResource, editTarget.datasourceId));
    setHasLoadedEditForm(true);
  }, [editTarget, existingResource, hasLoadedEditForm, isEdit, ruleType]);

  useEffect(() => {
    let cancelled = false;

    if (!isDetector) {
      setIsServerless(false);
      return () => {
        cancelled = true;
      };
    }

    isServerlessDataSource(form.datasourceId).then((result) => {
      if (!cancelled) setIsServerless(result);
    });

    return () => {
      cancelled = true;
    };
  }, [form.datasourceId, isDetector]);

  useEffect(() => {
    if (!customResultIndexRequired) return;

    setForm((prev) =>
      prev.customResultIndexEnabled ? prev : { ...prev, customResultIndexEnabled: true }
    );
  }, [customResultIndexRequired]);

  useEffect(() => {
    if (isEdit && isEditFormReady && editLifecycleBlocker && !showStopForEditModal) {
      setShowStopForEditModal(true);
    }
  }, [editLifecycleBlocker, isEdit, isEditFormReady, showStopForEditModal]);

  const updateForm = useCallback(
    <K extends keyof CreateAdRuleFormState>(key: K, value: CreateAdRuleFormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setSubmitError(null);
    },
    []
  );

  const updateFeature = useCallback(
    <K extends keyof CreateAdFeatureFormState>(
      index: number,
      key: K,
      value: CreateAdFeatureFormState[K]
    ) => {
      setForm((prev) => ({
        ...prev,
        features: prev.features.map((feature, featureIndex) =>
          featureIndex === index ? { ...feature, [key]: value } : feature
        ),
      }));
      setSubmitError(null);
    },
    []
  );

  const addFeature = useCallback(() => {
    setForm((prev) =>
      prev.features.length >= MAX_FEATURE_NUM
        ? prev
        : { ...prev, features: [...prev.features, createInitialFeature()] }
    );
    setSubmitError(null);
  }, []);

  const removeFeature = useCallback((index: number) => {
    setForm((prev) => ({
      ...prev,
      features:
        prev.features.length <= 1
          ? [createInitialFeature()]
          : prev.features.filter((_, featureIndex) => featureIndex !== index),
    }));
    setSubmitError(null);
  }, []);

  const updateDataSelection = useCallback(
    (next: Partial<Pick<CreateAdRuleFormState, 'datasourceId' | 'indices'>>) => {
      setForm((prev) => ({
        ...prev,
        ...next,
        timeField: '',
        categoryFieldEnabled: false,
        categoryField: [],
        features: resetFeatureFieldSelections(prev.features),
      }));
      setSubmitError(null);
    },
    []
  );

  const useSuggestedParameters = useCallback(
    (values: { interval: number; frequency: number; history: number; windowDelay: number }) => {
      setForm((prev) => ({
        ...prev,
        interval: values.interval,
        frequency: values.frequency,
        history: values.history,
        windowDelay: values.windowDelay,
      }));
      setSubmitError(null);
    },
    []
  );

  const handleStopForEditModalCancel = useCallback(() => {
    setShowStopForEditModal(false);
    onCancel();
  }, [onCancel]);

  const assertLifecycleActionResponse = useCallback(
    (response: ApiResponse | undefined, fallbackMessage: string) => {
      if (!response) throw new Error(fallbackMessage);
      if (response.ok === false) {
        throw new Error(response.error || response.message || fallbackMessage);
      }
    },
    []
  );

  const handleStartEditedDetector = useCallback(
    async (detectorId: string, datasourceId: string) => {
      const startErrorMessage = i18n.translate(
        'observability.alerting.createAdRuleFlyout.detectorStartAfterEditFailedMessage',
        { defaultMessage: 'There was a problem starting the detector' }
      );

      setIsStartingEditedDetector(true);
      setSubmitError(null);
      try {
        const response = await coreRefs.http?.post<ApiResponse>(
          withAdApiDataSource(
            `${AD_DETECTOR_API}/${encodeURIComponent(detectorId)}/start`,
            datasourceId
          )
        );
        assertLifecycleActionResponse(response, startErrorMessage);
        coreRefs.toasts?.addSuccess(
          i18n.translate(
            'observability.alerting.createAdRuleFlyout.detectorStartedAfterEditToast',
            {
              defaultMessage: 'Detector started successfully',
            }
          )
        );
        setStartAfterEditPrompt(null);
        onUpdated?.();
      } catch (error) {
        coreRefs.toasts?.addDanger({
          title: i18n.translate(
            'observability.alerting.createAdRuleFlyout.detectorStartAfterEditFailed',
            {
              defaultMessage: 'Failed to start detector',
            }
          ),
          text: buildErrorMessage(error),
        });
      } finally {
        setIsStartingEditedDetector(false);
      }
    },
    [assertLifecycleActionResponse, onUpdated]
  );

  const handleCloseAfterEditPrompt = useCallback(() => {
    setStartAfterEditPrompt(null);
    if (onUpdated) {
      onUpdated();
      return;
    }
    onCancel();
  }, [onCancel, onUpdated]);

  const handleStopAndProceedToEdit = useCallback(async () => {
    if (!isEdit || !editTarget || !existingResource || !editLifecycleBlocker) return;

    setIsStoppingForEdit(true);
    setSubmitError(null);
    try {
      if (ruleType === 'detector') {
        const runningJobsLabel = getDetectorRunningJobsLabel(existingResource);
        const stoppedRealTimeDetector = isDetectorRealTimeJobRunning(existingResource);
        const stopErrorMessage = i18n.translate(
          'observability.alerting.createAdRuleFlyout.detectorStopForEditFailedMessage',
          {
            defaultMessage: 'There was a problem stopping the {runningJobsLabel}',
            values: { runningJobsLabel },
          }
        );

        if (isDetectorRealTimeJobRunning(existingResource)) {
          const response = await coreRefs.http?.post<ApiResponse>(
            withAdApiDataSource(
              `${AD_DETECTOR_API}/${encodeURIComponent(editTarget.id)}/stop/false`,
              form.datasourceId
            )
          );
          assertLifecycleActionResponse(response, stopErrorMessage);
        }

        if (isDetectorHistoricalJobRunning(existingResource)) {
          const response = await coreRefs.http?.post<ApiResponse>(
            withAdApiDataSource(
              `${AD_DETECTOR_API}/${encodeURIComponent(editTarget.id)}/stop/true`,
              form.datasourceId
            )
          );
          assertLifecycleActionResponse(response, stopErrorMessage);
        }

        coreRefs.toasts?.addSuccess(
          i18n.translate('observability.alerting.createAdRuleFlyout.detectorStoppedForEditToast', {
            defaultMessage: 'Successfully stopped the {runningJobsLabel}',
            values: { runningJobsLabel },
          })
        );
        setShouldOfferStartDetectorAfterEdit(stoppedRealTimeDetector);
      } else {
        const response = await coreRefs.http?.post<ApiResponse>(
          withAdApiDataSource(
            `${FORECASTER_API}/${encodeURIComponent(editTarget.id)}/stop`,
            form.datasourceId
          )
        );
        assertLifecycleActionResponse(
          response,
          i18n.translate(
            'observability.alerting.createAdRuleFlyout.forecasterStopForEditFailedMessage',
            {
              defaultMessage: 'There was a problem stopping the forecast',
            }
          )
        );
        coreRefs.toasts?.addSuccess(
          i18n.translate(
            'observability.alerting.createAdRuleFlyout.forecasterStoppedForEditToast',
            {
              defaultMessage: 'Successfully stopped the forecast',
            }
          )
        );
        setShouldOfferStartDetectorAfterEdit(false);
      }

      setHasStoppedForEdit(true);
      setShowStopForEditModal(false);
    } catch (error) {
      const message = buildErrorMessage(error);
      setSubmitError(message);
      coreRefs.toasts?.addDanger({
        title:
          ruleType === 'detector'
            ? i18n.translate(
                'observability.alerting.createAdRuleFlyout.detectorStopForEditFailed',
                {
                  defaultMessage: 'Failed to stop detector',
                }
              )
            : i18n.translate(
                'observability.alerting.createAdRuleFlyout.forecasterStopForEditFailed',
                {
                  defaultMessage: 'Failed to stop forecast',
                }
              ),
        text: message,
      });
    } finally {
      setIsStoppingForEdit(false);
    }
  }, [
    assertLifecycleActionResponse,
    editLifecycleBlocker,
    editTarget,
    existingResource,
    form.datasourceId,
    isEdit,
    ruleType,
  ]);

  const handleNext = () => {
    if (editLifecycleBlocker) {
      setShowStopForEditModal(true);
      return;
    }
    setHasSubmitted(true);
    const stepErrors = errorsForStep(
      validateForm(form, { customResultIndexRequired, ruleType }),
      currentValidationStep,
      ruleType
    );
    if (Object.keys(stepErrors).length) return;
    setHasSubmitted(false);
    setCurrentStep((step) => Math.min(finalStep, step + 1));
  };

  const handlePrevious = () => {
    setHasSubmitted(false);
    setCurrentStep((step) => Math.max(0, step - 1));
  };

  const handleSubmit = useCallback(async () => {
    setHasSubmitted(true);
    if (isEdit && (!editTarget || !existingResource)) return;
    if (editLifecycleBlocker) {
      setShowStopForEditModal(true);
      coreRefs.toasts?.addDanger(
        ruleType === 'detector'
          ? i18n.translate(
              'observability.alerting.createAdRuleFlyout.detectorRunningUpdateBlocked',
              {
                defaultMessage: 'Detector cannot be updated while it is running',
              }
            )
          : i18n.translate(
              'observability.alerting.createAdRuleFlyout.forecasterActiveUpdateBlocked',
              {
                defaultMessage: 'Forecast cannot be updated while it is active',
              }
            )
      );
      return;
    }
    const validationErrors = validateForm(form, { customResultIndexRequired, ruleType });
    const blockingErrors = isEdit
      ? errorsForStep(validationErrors, currentValidationStep, ruleType)
      : validationErrors;
    if (Object.keys(blockingErrors).length || isSaving) return;
    setIsSaving(true);
    setSubmitError(null);
    try {
      const basePath = isDetector ? AD_DETECTOR_API : FORECASTER_API;
      const requestPath =
        isEdit && editTarget
          ? withAdApiDataSource(
              `${basePath}/${encodeURIComponent(editTarget.id)}`,
              form.datasourceId
            )
          : withAdApiDataSource(basePath, form.datasourceId);
      const requestBody = JSON.stringify(
        buildRulePayload(ruleType, form, {
          customResultIndexRequired,
          existingResource: isEdit ? existingResource : undefined,
        })
      );
      const response = isEdit
        ? await coreRefs.http?.put<ApiResponse>(requestPath, { body: requestBody })
        : await coreRefs.http?.post<ApiResponse>(requestPath, { body: requestBody });

      if (!response?.ok) {
        throw new Error(
          response?.error ||
            response?.message ||
            (isEdit ? 'Update request failed' : 'Create request failed')
        );
      }

      const createdId = extractCreatedId(response);
      let autoStartError: string | null = null;
      const shouldAutoStart = shouldAutoStartCreatedRule(ruleType, form.startAfterCreate);
      if (!isEdit && createdId && shouldAutoStart) {
        try {
          const startResponse = await coreRefs.http?.post<ApiResponse>(
            withAdApiDataSource(
              `${basePath}/${encodeURIComponent(createdId)}/start`,
              form.datasourceId
            )
          );
          if (!startResponse?.ok) {
            throw new Error(
              startResponse?.error || startResponse?.message || 'Start request failed'
            );
          }
        } catch (error) {
          autoStartError = buildErrorMessage(error);
        }
      }

      const successToastTitle = isEdit
        ? isDetector
          ? i18n.translate('observability.alerting.createAdRuleFlyout.detectorUpdatedToast', {
              defaultMessage: 'Anomaly detection rule updated successfully',
            })
          : i18n.translate('observability.alerting.createAdRuleFlyout.forecasterUpdatedToast', {
              defaultMessage: 'Forecasting rule updated successfully',
            })
        : isDetector
          ? i18n.translate('observability.alerting.createAdRuleFlyout.detectorCreatedToast', {
              defaultMessage: 'Anomaly detection rule created successfully',
            })
          : i18n.translate('observability.alerting.createAdRuleFlyout.forecasterCreatedToast', {
              defaultMessage: 'Forecasting rule created successfully',
            });

      if (isEdit && isDetector && shouldOfferStartDetectorAfterEdit && editTarget) {
        setStartAfterEditPrompt({
          detectorId: editTarget.id,
          datasourceId: form.datasourceId,
        });
        coreRefs.toasts?.addSuccess(successToastTitle);
        return;
      } else {
        coreRefs.toasts?.addSuccess(successToastTitle);
      }
      if (isEdit) {
        onUpdated?.();
      } else {
        onCreated?.();
        if (autoStartError) {
          coreRefs.toasts?.addWarning({
            title: isDetector
              ? i18n.translate(
                  'observability.alerting.createAdRuleFlyout.detectorCreatedStartFailed',
                  {
                    defaultMessage: 'Rule created but the detector could not be started',
                  }
                )
              : i18n.translate(
                  'observability.alerting.createAdRuleFlyout.forecasterCreatedStartFailed',
                  {
                    defaultMessage: 'Rule created but the forecaster could not be started',
                  }
                ),
            text: autoStartError,
          });
        }
      }
    } catch (error) {
      // Never surface the backend's raw "Job is running: forecast-<id>" string — it
      // leaks an internal job id and gives no guidance. Swap in actionable copy.
      const message = humanizeAdUpdateError(buildErrorMessage(error), ruleType);
      setSubmitError(message);
      coreRefs.toasts?.addDanger({
        title: isEdit
          ? isDetector
            ? i18n.translate('observability.alerting.createAdRuleFlyout.detectorUpdateFailed', {
                defaultMessage: 'Failed to update anomaly detection rule',
              })
            : i18n.translate('observability.alerting.createAdRuleFlyout.forecasterUpdateFailed', {
                defaultMessage: 'Failed to update forecasting rule',
              })
          : isDetector
            ? i18n.translate('observability.alerting.createAdRuleFlyout.detectorCreateFailed', {
                defaultMessage: 'Failed to create anomaly detection rule',
              })
            : i18n.translate('observability.alerting.createAdRuleFlyout.forecasterCreateFailed', {
                defaultMessage: 'Failed to create forecasting rule',
              }),
        text: message,
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    customResultIndexRequired,
    currentValidationStep,
    editLifecycleBlocker,
    editTarget,
    existingResource,
    form,
    isDetector,
    isEdit,
    isSaving,
    onCreated,
    onUpdated,
    ruleType,
    shouldOfferStartDetectorAfterEdit,
  ]);

  const datasourceOptions = openSearchDatasources.map((datasource) => ({
    value: datasource.id,
    text: datasource.name || datasource.id,
  }));

  const steps = stepTitles.map((stepTitle, index) => ({
    title: stepTitle,
    status: index < currentStep ? 'complete' : index === currentStep ? 'incomplete' : 'disabled',
    children: index === currentStep ? <span /> : undefined,
  }));
  const submitButtonLabel = (() => {
    if (isSaving) {
      return isEdit
        ? i18n.translate('observability.alerting.createAdRuleFlyout.savingButton', {
            defaultMessage: 'Saving...',
          })
        : i18n.translate('observability.alerting.createAdRuleFlyout.creatingButton', {
            defaultMessage: 'Creating...',
          });
    }

    return isEdit
      ? i18n.translate('observability.alerting.createAdRuleFlyout.saveButton', {
          defaultMessage: 'Save changes',
        })
      : i18n.translate('observability.alerting.createAdRuleFlyout.createButton', {
          defaultMessage: 'Create rule',
        });
  })();

  const renderDefineStep = () => (
    <>
      <AdContentPanel
        title={
          isDetector
            ? i18n.translate('observability.alerting.createAdRuleFlyout.detectorDetailsTitle', {
                defaultMessage: 'Detector details',
              })
            : i18n.translate('observability.alerting.createAdRuleFlyout.forecasterDetailsTitle', {
                defaultMessage: 'Forecaster details',
              })
        }
      >
        <AdFormattedFormRow
          title={i18n.translate('observability.alerting.createAdRuleFlyout.nameLabel', {
            defaultMessage: 'Name',
          })}
          hint={i18n.translate('observability.alerting.createAdRuleFlyout.nameHint', {
            defaultMessage: 'Specify a unique and descriptive name that is easy to recognize.',
          })}
          helpText={i18n.translate('observability.alerting.createAdRuleFlyout.nameHelpText', {
            defaultMessage:
              'Detector name must contain 1-64 characters. Valid characters are a-z, A-Z, 0-9, -(hyphen), _(underscore) and .(period).',
          })}
          isInvalid={!!visibleErrors.name}
          error={visibleErrors.name}
        >
          <EuiFieldText
            value={form.name}
            onChange={(e) => updateForm('name', e.target.value)}
            placeholder={i18n.translate(
              'observability.alerting.createAdRuleFlyout.detectorNamePlaceholder',
              {
                defaultMessage: 'Enter detector name',
              }
            )}
            data-test-subj="alertManagerCreateAdRuleName"
          />
        </AdFormattedFormRow>

        <AdFormattedFormRow
          formattedTitle={
            <p>
              {i18n.translate('observability.alerting.createAdRuleFlyout.descriptionLabel', {
                defaultMessage: 'Description',
              })}{' '}
              <span className="optional">
                {i18n.translate('observability.alerting.createAdRuleFlyout.optionalLabel', {
                  defaultMessage: '- optional',
                })}
              </span>
            </p>
          }
          hint={
            isDetector
              ? i18n.translate(
                  'observability.alerting.createAdRuleFlyout.detectorDescriptionHint',
                  {
                    defaultMessage: 'Describe the purpose of the detector.',
                  }
                )
              : i18n.translate(
                  'observability.alerting.createAdRuleFlyout.forecasterDescriptionHint',
                  {
                    defaultMessage: 'Describe the purpose of the forecaster.',
                  }
                )
          }
        >
          <EuiTextArea
            value={form.description}
            onChange={(e) => updateForm('description', e.target.value)}
            placeholder={
              isDetector
                ? i18n.translate(
                    'observability.alerting.createAdRuleFlyout.detectorDescriptionPlaceholder',
                    {
                      defaultMessage: 'Describe the detector',
                    }
                  )
                : i18n.translate(
                    'observability.alerting.createAdRuleFlyout.forecasterDescriptionPlaceholder',
                    {
                      defaultMessage: 'Describe the forecaster',
                    }
                  )
            }
            rows={3}
            data-test-subj="alertManagerCreateAdRuleDescription"
          />
        </AdFormattedFormRow>
      </AdContentPanel>

      <EuiSpacer />

      <AdContentPanel
        title={i18n.translate('observability.alerting.createAdRuleFlyout.selectDataTitle', {
          defaultMessage: 'Select Data',
        })}
      >
        <AdFormattedFormRow
          title={i18n.translate('observability.alerting.createAdRuleFlyout.datasourceLabel', {
            defaultMessage: 'Datasource',
          })}
          hint={i18n.translate('observability.alerting.createAdRuleFlyout.datasourceHint', {
            defaultMessage: 'Select the OpenSearch datasource for this rule.',
          })}
          isInvalid={!!visibleErrors.datasourceId}
          error={visibleErrors.datasourceId}
        >
          <EuiSelect
            options={datasourceOptions}
            value={form.datasourceId}
            disabled={isEdit}
            onChange={(e) => {
              updateDataSelection({ datasourceId: e.target.value, indices: [] });
            }}
            data-test-subj="alertManagerCreateAdRuleDatasource"
          />
        </AdFormattedFormRow>

        <AdIndexPicker
          dsId={form.datasourceId}
          selected={form.indices}
          onChange={(next) => {
            updateDataSelection({ indices: next });
          }}
          isInvalid={!!visibleErrors.indices}
          error={visibleErrors.indices}
        />

        <AdFormattedFormRow
          formattedTitle={
            <p>
              {i18n.translate('observability.alerting.createAdRuleFlyout.filterQueryLabel', {
                defaultMessage: 'Filter query',
              })}{' '}
              <span className="optional">
                {i18n.translate('observability.alerting.createAdRuleFlyout.optionalLabel', {
                  defaultMessage: '- optional',
                })}
              </span>
            </p>
          }
          hint={i18n.translate('observability.alerting.createAdRuleFlyout.filterQueryHelp', {
            defaultMessage: 'Optional OpenSearch query DSL JSON. Leave empty to match all data.',
          })}
          isInvalid={!!visibleErrors.filterQuery}
          error={visibleErrors.filterQuery}
        >
          <EuiTextArea
            value={form.filterQuery}
            onChange={(e) => updateForm('filterQuery', e.target.value)}
            placeholder={'{ "match_all": {} }'}
            rows={4}
            data-test-subj="alertManagerCreateAdRuleFilterQuery"
          />
        </AdFormattedFormRow>
      </AdContentPanel>

      <EuiSpacer />

      <AdContentPanel
        title={i18n.translate('observability.alerting.createAdRuleFlyout.timestampTitle', {
          defaultMessage: 'Timestamp',
        })}
        subTitle={i18n.translate('observability.alerting.createAdRuleFlyout.timestampSubtitle', {
          defaultMessage: 'Select the time field you want to use for the time filter.',
        })}
      >
        <AdTimestampSelector
          dsId={form.datasourceId}
          indices={form.indices}
          value={form.timeField}
          onChange={(next) => updateForm('timeField', next)}
          isInvalid={!!visibleErrors.timeField}
          error={visibleErrors.timeField}
        />
      </AdContentPanel>

      {isDetector && (
        <>
          <EuiSpacer />
          <AdContentPanel
            title={
              <EuiTitle size="s" id="resultIndexField">
                <h2>
                  {i18n.translate('observability.alerting.createAdRuleFlyout.resultIndexTitle', {
                    defaultMessage: 'Custom result index',
                  })}
                </h2>
              </EuiTitle>
            }
            subTitle={
              <EuiText className="content-panel-subTitle" style={{ lineHeight: 'normal' }}>
                {i18n.translate('observability.alerting.createAdRuleFlyout.resultIndexSubtitle', {
                  defaultMessage: 'Store detector results to your own index.',
                })}{' '}
                <AdLearnMore />
              </EuiText>
            }
          >
            <EuiFlexGroup direction="column">
              <EuiFlexItem>
                {customResultIndexRequired ? (
                  <EuiCallOut
                    data-test-subj="serverlessCustomResultIndexRequiredCallout"
                    color="primary"
                    iconType="iInCircle"
                    size="s"
                    title={i18n.translate(
                      'observability.alerting.createAdRuleFlyout.serverlessResultIndexRequired',
                      {
                        defaultMessage: 'Custom result index is required on OpenSearch Serverless.',
                      }
                    )}
                  />
                ) : (
                  <EuiCheckbox
                    id="resultIndexCheckbox"
                    label={i18n.translate(
                      'observability.alerting.createAdRuleFlyout.enableResultIndex',
                      {
                        defaultMessage: 'Enable custom result index',
                      }
                    )}
                    checked={form.customResultIndexEnabled}
                    disabled={isEdit}
                    onChange={(e) => {
                      updateForm('customResultIndexEnabled', e.target.checked);
                      if (!e.target.checked) updateForm('resultIndex', '');
                    }}
                  />
                )}
              </EuiFlexItem>
              {resultIndexEnabled && (
                <>
                  <EuiFlexItem>
                    <EuiCallOut
                      color="warning"
                      iconType="alert"
                      size="s"
                      title={i18n.translate(
                        'observability.alerting.createAdRuleFlyout.resultIndexReadonlyWarning',
                        {
                          defaultMessage:
                            "You can't change the custom result index after creating the detector. You can manage the result index using the following three settings inside Anomaly Detection plugin or with the Index Management plugin.",
                        }
                      )}
                    />
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiFormRow
                      label={i18n.translate(
                        'observability.alerting.createAdRuleFlyout.resultIndexFieldLabel',
                        {
                          defaultMessage: 'Field',
                        }
                      )}
                      helpText={i18n.translate(
                        'observability.alerting.createAdRuleFlyout.resultIndexHelp',
                        {
                          defaultMessage:
                            'Custom result index name must contain less than 255 characters including the prefix "opensearch-ad-plugin-result-". Valid characters are a-z, 0-9, -(hyphen) and _(underscore).',
                        }
                      )}
                      isInvalid={!!visibleErrors.resultIndex}
                      error={visibleErrors.resultIndex}
                    >
                      <EuiFieldText
                        value={form.resultIndex}
                        prepend={CUSTOM_AD_RESULT_INDEX_PREFIX}
                        isInvalid={!!visibleErrors.resultIndex}
                        placeholder={i18n.translate(
                          'observability.alerting.createAdRuleFlyout.resultIndexPlaceholder',
                          { defaultMessage: 'Enter result index name' }
                        )}
                        disabled={isEdit}
                        onChange={(e) => updateForm('resultIndex', e.target.value)}
                        data-test-subj="alertManagerCreateAdRuleResultIndex"
                      />
                    </EuiFormRow>
                  </EuiFlexItem>
                </>
              )}
            </EuiFlexGroup>
          </AdContentPanel>
        </>
      )}
    </>
  );

  const renderFeatureFields = () => (
    <EuiFlexGroup direction="column" style={{ margin: 0 }}>
      {form.features.map((feature, index) => {
        const featureNameError = visibleErrors[featureErrorKey(index, 'featureName')];
        const aggregationOfError = visibleErrors[featureErrorKey(index, 'aggregationOf')];
        const featureLimitError = visibleErrors[featureErrorKey(index, 'featureLimit')];

        return (
          <EuiFlexItem key={index}>
            <EuiAccordion
              id={`featureList.${index}`}
              paddingSize="l"
              initialIsOpen={index === form.features.length - 1}
              buttonClassName={
                index === 0 ? 'euiAccordionForm__noTopPaddingButton' : 'euiFormAccordion_button'
              }
              className="euiAccordion__noTopBorder"
              buttonContent={
                <div id={`featureAccordionHeaders.${index}`}>
                  <EuiTitle size="xs" className="euiAccordionForm__title">
                    <h5>
                      {feature.featureName ||
                        (isDetector
                          ? i18n.translate(
                              'observability.alerting.createAdRuleFlyout.addFeatureHeading',
                              { defaultMessage: 'Add feature' }
                            )
                          : i18n.translate(
                              'observability.alerting.createAdRuleFlyout.addIndicatorHeading',
                              { defaultMessage: 'Add indicator' }
                            ))}
                    </h5>
                  </EuiTitle>
                </div>
              }
              extraAction={
                isDetector ? (
                  <EuiButtonIcon
                    aria-label={i18n.translate(
                      'observability.alerting.createAdRuleFlyout.deleteFeature',
                      {
                        defaultMessage: 'Delete feature',
                      }
                    )}
                    size="s"
                    iconType="trash"
                    color="text"
                    isDisabled={form.features.length <= 1}
                    onClick={() => removeFeature(index)}
                  />
                ) : undefined
              }
            >
              <EuiFormRow
                label={
                  isDetector
                    ? i18n.translate('observability.alerting.createAdRuleFlyout.featureNameLabel', {
                        defaultMessage: 'Feature name',
                      })
                    : i18n.translate(
                        'observability.alerting.createAdRuleFlyout.indicatorNameLabel',
                        { defaultMessage: 'Indicator name' }
                      )
                }
                helpText={
                  isDetector
                    ? i18n.translate('observability.alerting.createAdRuleFlyout.featureNameHelp', {
                        defaultMessage:
                          'Enter a descriptive, unique name. The name must contain 1-64 characters. Valid characters are a-z, A-Z, 0-9, -(hyphen) and _(underscore).',
                      })
                    : i18n.translate(
                        'observability.alerting.createAdRuleFlyout.indicatorNameHelp',
                        { defaultMessage: 'Enter a descriptive name (1-64 characters).' }
                      )
                }
                isInvalid={!!featureNameError}
                error={featureNameError}
              >
                <EuiFieldText
                  value={feature.featureName}
                  isInvalid={!!featureNameError}
                  onChange={(e) => updateFeature(index, 'featureName', e.target.value)}
                  placeholder={
                    isDetector
                      ? i18n.translate(
                          'observability.alerting.createAdRuleFlyout.featureNamePlaceholder',
                          { defaultMessage: 'Enter feature name' }
                        )
                      : i18n.translate(
                          'observability.alerting.createAdRuleFlyout.indicatorNamePlaceholder',
                          { defaultMessage: 'Enter indicator name' }
                        )
                  }
                  data-test-subj={`alertManagerCreateAdRuleFeatureName-${index}`}
                />
              </EuiFormRow>

              {isDetector && (
                <EuiFormRow
                  label={i18n.translate(
                    'observability.alerting.createAdRuleFlyout.featureStateLabel',
                    {
                      defaultMessage: 'Feature state',
                    }
                  )}
                >
                  <EuiCheckbox
                    id={`featureList.${index}.featureEnabled`}
                    label={i18n.translate(
                      'observability.alerting.createAdRuleFlyout.enableFeatureLabel',
                      {
                        defaultMessage: 'Enable feature',
                      }
                    )}
                    checked={feature.featureEnabled}
                    onChange={(e) => updateFeature(index, 'featureEnabled', e.target.checked)}
                  />
                </EuiFormRow>
              )}

              <EuiFormRow
                label={
                  isDetector
                    ? i18n.translate('observability.alerting.createAdRuleFlyout.featureTypeLabel', {
                        defaultMessage: 'Find anomalies based on',
                      })
                    : i18n.translate(
                        'observability.alerting.createAdRuleFlyout.indicatorTypeLabel',
                        { defaultMessage: 'Forecast based on' }
                      )
                }
              >
                <EuiSelect value={SIMPLE_FEATURE_TYPE} options={FEATURE_TYPE_OPTIONS} disabled />
              </EuiFormRow>

              <AdFormattedFormRow
                title={i18n.translate(
                  'observability.alerting.createAdRuleFlyout.aggregationLabel',
                  {
                    defaultMessage: 'Aggregation method',
                  }
                )}
                hint={
                  isDetector
                    ? i18n.translate('observability.alerting.createAdRuleFlyout.aggregationHint', {
                        defaultMessage:
                          'The aggregation method determines what constitutes an anomaly.',
                      })
                    : i18n.translate(
                        'observability.alerting.createAdRuleFlyout.forecastAggregationHint',
                        {
                          defaultMessage: 'The aggregation method defines the value to forecast.',
                        }
                      )
                }
                helpText={
                  isDetector
                    ? i18n.translate('observability.alerting.createAdRuleFlyout.aggregationHelp', {
                        defaultMessage:
                          'E.g, if you choose min(), the detector focuses on finding anomalies based on the minimum values of your feature.',
                      })
                    : i18n.translate(
                        'observability.alerting.createAdRuleFlyout.forecastAggregationHelp',
                        {
                          defaultMessage:
                            'For example, choose average() to forecast the average value of the selected field.',
                        }
                      )
                }
              >
                <EuiSelect
                  options={AGGREGATION_OPTIONS}
                  value={feature.aggregationBy}
                  onChange={(e) => {
                    updateFeature(index, 'aggregationBy', e.target.value);
                    updateFeature(index, 'aggregationOf', '');
                  }}
                  data-test-subj={`aggregationType-${index}`}
                />
              </AdFormattedFormRow>

              <FeatureFieldSelector
                dsId={form.datasourceId}
                indices={form.indices}
                aggregationBy={feature.aggregationBy}
                value={feature.aggregationOf}
                onChange={(next) => updateFeature(index, 'aggregationOf', next)}
                isInvalid={!!aggregationOfError}
                error={aggregationOfError}
                dataTestSubj={`alertManagerCreateAdRuleFeatureField-${index}`}
              />

              {isDetector && (
                <AdFormattedFormRow
                  title={i18n.translate(
                    'observability.alerting.createAdRuleFlyout.anomalyCriteriaLabel',
                    {
                      defaultMessage: 'Anomaly criteria',
                    }
                  )}
                  hint={i18n.translate(
                    'observability.alerting.createAdRuleFlyout.anomalyCriteriaHint',
                    {
                      defaultMessage:
                        'Acceptable difference between the expected and actual values',
                    }
                  )}
                >
                  <EuiSelect
                    value={feature.anomalyDirection}
                    options={FEATURE_DIRECTION_OPTIONS}
                    onChange={(e) => updateFeature(index, 'anomalyDirection', e.target.value)}
                  />
                </AdFormattedFormRow>
              )}

              {featureLimitError && (
                <>
                  <EuiSpacer size="s" />
                  <EuiCallOut color="warning" iconType="alert" size="s" title={featureLimitError} />
                </>
              )}
            </EuiAccordion>
          </EuiFlexItem>
        );
      })}
      {isDetector && (
        <EuiFlexItem>
          <EuiFlexGroup alignItems="center" style={{ padding: '12px 0px' }}>
            <EuiFlexItem grow={false}>
              <EuiSmallButton
                data-test-subj="addFeature"
                isDisabled={form.features.length >= MAX_FEATURE_NUM}
                onClick={addFeature}
              >
                {i18n.translate('observability.alerting.createAdRuleFlyout.addFeatureButton', {
                  defaultMessage: 'Add another feature',
                })}
              </EuiSmallButton>
              <EuiText className="content-panel-subTitle">
                <p>
                  {i18n.translate('observability.alerting.createAdRuleFlyout.featuresRemaining', {
                    defaultMessage: 'You can add up to {count} more features.',
                    values: { count: Math.max(MAX_FEATURE_NUM - form.features.length, 0) },
                  })}
                </p>
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );

  const renderCategoryFields = () => (
    <CategoryFieldSelector
      dsId={form.datasourceId}
      indices={form.indices}
      ruleType={ruleType}
      enabled={form.categoryFieldEnabled}
      selected={form.categoryField}
      onEnabledChange={(next) => updateForm('categoryFieldEnabled', next)}
      onChange={(next) => updateForm('categoryField', next)}
      isInvalid={!!visibleErrors.categoryField}
      error={visibleErrors.categoryField}
    />
  );

  const renderDetectorOperationSettings = () => (
    <AdContentPanel
      title={i18n.translate('observability.alerting.createAdRuleFlyout.operationSettingsTitle', {
        defaultMessage: 'Operation settings',
      })}
    >
      <EuiSmallButton
        data-test-subj="suggestParametersButton"
        onClick={() => setShowSuggestDialog(true)}
      >
        {i18n.translate('observability.alerting.createAdRuleFlyout.suggestParametersButton', {
          defaultMessage: 'Suggest parameters',
        })}
      </EuiSmallButton>
      {showSuggestDialog && (
        <SuggestParametersDialog
          form={form}
          onClose={() => setShowSuggestDialog(false)}
          onUseSuggestedParameters={useSuggestedParameters}
        />
      )}
      <EuiSpacer />
      <AdFormattedFormRow
        fullWidth
        title={i18n.translate('observability.alerting.createAdRuleFlyout.intervalLabel', {
          defaultMessage: 'Interval',
        })}
        hint={i18n.translate('observability.alerting.createAdRuleFlyout.intervalHint', {
          defaultMessage:
            'Interval sets the time window for summarizing and modeling data (e.g., 5 min to 1 hr), where too small creates noise, higher cost, and overreaction to fluctuations, while too large smooths out anomalies and delays detection.',
        })}
        isInvalid={!!visibleErrors.interval}
        error={visibleErrors.interval}
      >
        <EuiFlexGroup gutterSize="s" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiFieldNumber
              name="detectionInterval"
              id="detectionInterval"
              placeholder={i18n.translate(
                'observability.alerting.createAdRuleFlyout.intervalPlaceholder',
                {
                  defaultMessage: 'Interval',
                }
              )}
              value={form.interval}
              min={1}
              style={{ width: 140 }}
              onChange={(e) => {
                const next = parseNumberInputValue(e.target.value);
                updateForm('interval', next);
                if (form.frequency === form.interval) updateForm('frequency', next);
              }}
              data-test-subj="detectionInterval"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText>
              <p className="minutes">minutes</p>
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </AdFormattedFormRow>

      <AdFormattedFormRow
        fullWidth
        title={i18n.translate('observability.alerting.createAdRuleFlyout.frequencyLabel', {
          defaultMessage: 'Frequency',
        })}
        hint={i18n.translate('observability.alerting.createAdRuleFlyout.frequencyHint', {
          defaultMessage:
            'Frequency sets how often the detector queries and scores data, i.e. how often alerts may fire. It must be a multiple of the interval and defaults to the same value.',
        })}
        rowStyle={{ marginTop: 16 }}
      >
        <EuiFlexGroup gutterSize="s" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiFieldNumber
              name="frequency"
              id="frequency"
              placeholder={i18n.translate(
                'observability.alerting.createAdRuleFlyout.frequencyPlaceholder',
                {
                  defaultMessage: 'Frequency',
                }
              )}
              value={form.frequency}
              min={1}
              style={{ width: 140 }}
              onChange={(e) => updateForm('frequency', parseNumberInputValue(e.target.value))}
              data-test-subj="frequency"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText>
              <p className="minutes">minutes</p>
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </AdFormattedFormRow>

      <AdFormattedFormRow
        fullWidth
        title={i18n.translate('observability.alerting.createAdRuleFlyout.windowDelayLabel', {
          defaultMessage: 'Window delay',
        })}
        hint={i18n.translate('observability.alerting.createAdRuleFlyout.windowDelayHint', {
          defaultMessage:
            'Specify a window of delay for a detector to fetch data, if you need to account for extra processing time.',
        })}
        rowStyle={{ marginTop: 16 }}
      >
        <EuiFlexGroup gutterSize="s" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiFieldNumber
              name="windowDelay"
              id="windowDelay"
              placeholder={i18n.translate(
                'observability.alerting.createAdRuleFlyout.windowDelayPlaceholder',
                {
                  defaultMessage: 'Window delay',
                }
              )}
              value={form.windowDelay}
              min={0}
              style={{ width: 140 }}
              onChange={(e) => updateForm('windowDelay', parseNumberInputValue(e.target.value))}
              data-test-subj="windowDelay"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText>
              <p className="minutes">minutes</p>
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </AdFormattedFormRow>

      <AdFormattedFormRow
        fullWidth
        title={i18n.translate('observability.alerting.createAdRuleFlyout.historyLabel', {
          defaultMessage: 'History',
        })}
        hint={i18n.translate('observability.alerting.createAdRuleFlyout.historyHint', {
          defaultMessage:
            'How far back the model looks for training data. Minimum history is 40 intervals, maximum is 10,000 intervals, and the default is 40.',
        })}
        rowStyle={{ marginTop: 16 }}
      >
        <EuiFlexGroup gutterSize="s" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiFieldNumber
              name="history"
              id="history"
              placeholder={i18n.translate(
                'observability.alerting.createAdRuleFlyout.historyPlaceholder',
                {
                  defaultMessage: 'History',
                }
              )}
              value={form.history}
              min={40}
              max={10000}
              style={{ width: 140 }}
              onChange={(e) => updateForm('history', parseNumberInputValue(e.target.value))}
              data-test-subj="history"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText>
              <p className="minutes">intervals</p>
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </AdFormattedFormRow>
    </AdContentPanel>
  );

  const renderAdvancedSettings = (settingsTitle: string) => (
    <AdContentPanel
      title={
        <EuiFlexGroup direction="row" style={{ margin: 0 }}>
          <EuiTitle size="s">
            <h2>{settingsTitle} </h2>
          </EuiTitle>
          <EuiText
            size="m"
            style={{ marginLeft: 18, marginTop: 5 }}
            onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
          >
            <EuiLink>
              {showAdvancedSettings
                ? i18n.translate('observability.alerting.createAdRuleFlyout.hideAdvanced', {
                    defaultMessage: 'Hide',
                  })
                : i18n.translate('observability.alerting.createAdRuleFlyout.showAdvanced', {
                    defaultMessage: 'Show',
                  })}
            </EuiLink>
          </EuiText>
        </EuiFlexGroup>
      }
      hideBody={!showAdvancedSettings}
    >
      {showAdvancedSettings && (
        <>
          <EuiSpacer size="m" />
          <AdFormattedFormRow
            title={i18n.translate('observability.alerting.createAdRuleFlyout.shingleSizeLabel', {
              defaultMessage: 'Shingle size',
            })}
            hint={i18n.translate('observability.alerting.createAdRuleFlyout.shingleSizeHint', {
              defaultMessage:
                "Set the number of intervals to consider in a detection window for your model. The anomaly detector expects the shingle size to be in the range of 1 and 128. The default shingle size is 8. We recommend that you don't choose 1 unless you have two or more features.",
            })}
            isInvalid={!!visibleErrors.shingleSize}
            error={visibleErrors.shingleSize}
          >
            <EuiFlexGroup gutterSize="s" alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiFieldNumber
                  id="shingleSize"
                  placeholder={i18n.translate(
                    'observability.alerting.createAdRuleFlyout.shingleSizePlaceholder',
                    {
                      defaultMessage: 'Shingle size',
                    }
                  )}
                  value={form.shingleSize}
                  min={1}
                  max={128}
                  onChange={(e) => updateForm('shingleSize', Number(e.target.value))}
                  data-test-subj="shingleSize"
                />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiText>
                  <p className="minutes">intervals</p>
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </AdFormattedFormRow>
        </>
      )}
    </AdContentPanel>
  );

  const renderDetectorModelStep = () => (
    <>
      <EuiText size="s">
        <p>
          {i18n.translate('observability.alerting.createAdRuleFlyout.detectorModelHelp', {
            defaultMessage:
              'Set the index fields that you want to find anomalies for by defining the model features. You can also set other model parameters such as categorical fields and shingle size.',
          })}
        </p>
      </EuiText>
      <EuiSpacer size="m" />
      <AdContentPanel
        title={i18n.translate('observability.alerting.createAdRuleFlyout.featuresTitle', {
          defaultMessage: 'Features',
        })}
        subTitle={
          <EuiText className="content-panel-subTitle" style={{ lineHeight: 'normal' }}>
            {i18n.translate('observability.alerting.createAdRuleFlyout.featuresSubtitle', {
              defaultMessage:
                'A feature is the field in your index that you use to check for anomalies. You can add up to 5 features.',
            })}{' '}
            <AdLearnMore />
          </EuiText>
        }
      >
        {renderFeatureFields()}
      </AdContentPanel>
      <EuiSpacer size="m" />
      {renderCategoryFields()}
      <EuiSpacer size="m" />
      {renderDetectorOperationSettings()}
      <EuiSpacer size="m" />
      {renderAdvancedSettings(
        i18n.translate('observability.alerting.createAdRuleFlyout.advancedSettingsTitle', {
          defaultMessage: 'Advanced settings',
        })
      )}
    </>
  );

  const renderForecasterDefineStep = () => (
    <>
      {renderDefineStep()}
      <EuiSpacer size="m" />
      <AdContentPanel
        title={i18n.translate('observability.alerting.createAdRuleFlyout.indicatorTitle', {
          defaultMessage: 'Indicator',
        })}
        subTitle={i18n.translate('observability.alerting.createAdRuleFlyout.indicatorSubtitle', {
          defaultMessage: 'Define the variable to use in your prediction.',
        })}
      >
        {renderFeatureFields()}
      </AdContentPanel>
      <EuiSpacer size="m" />
      {renderCategoryFields()}
    </>
  );

  const renderForecasterStorageSettings = () => (
    <AdContentPanel
      title={i18n.translate('observability.alerting.createAdRuleFlyout.forecastStorageTitle', {
        defaultMessage: 'Storage',
      })}
      subTitle={i18n.translate(
        'observability.alerting.createAdRuleFlyout.forecastStorageSubtitle',
        { defaultMessage: 'Define how to store and manage forecasting results.' }
      )}
    >
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem>
          <EuiPanel hasBorder paddingSize="l">
            <EuiRadio
              id="alertManagerForecasterDefaultIndex"
              label={i18n.translate(
                'observability.alerting.createAdRuleFlyout.defaultForecastIndexLabel',
                { defaultMessage: 'Default index' }
              )}
              checked={!form.customResultIndexEnabled}
              onChange={() =>
                setForm((previous) => ({
                  ...previous,
                  customResultIndexEnabled: false,
                  resultIndex: '',
                  resultIndexMinAge: '',
                  resultIndexMinSize: '',
                  resultIndexTtl: '',
                  customResultIndexLifecycleEnabled: false,
                  flattenCustomResultIndex: false,
                }))
              }
            />
            <EuiSpacer size="s" />
            <EuiText size="xs" color="subdued">
              <p style={{ margin: 0 }}>
                {i18n.translate(
                  'observability.alerting.createAdRuleFlyout.defaultForecastIndexDescription',
                  {
                    defaultMessage:
                      'The forecasting results are retained automatically for at least 30 days.',
                  }
                )}
              </p>
            </EuiText>
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel hasBorder paddingSize="l">
            <EuiRadio
              id="alertManagerForecasterCustomIndex"
              label={i18n.translate(
                'observability.alerting.createAdRuleFlyout.customForecastIndexLabel',
                { defaultMessage: 'Custom index' }
              )}
              checked={form.customResultIndexEnabled}
              onChange={() =>
                setForm((previous) => ({
                  ...previous,
                  customResultIndexEnabled: true,
                  resultIndex: previous.resultIndex || 'my_custom_forecast_index',
                }))
              }
            />
            <EuiSpacer size="s" />
            <EuiText size="xs" color="subdued">
              <p style={{ margin: 0 }}>
                {i18n.translate(
                  'observability.alerting.createAdRuleFlyout.customForecastIndexDescription',
                  {
                    defaultMessage:
                      'Route forecast results to your custom index. In a custom index, you set the retention period and resource allocation.',
                  }
                )}
              </p>
            </EuiText>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      {form.customResultIndexEnabled && (
        <>
          <EuiSpacer size="l" />
          <EuiHorizontalRule margin="none" />
          <EuiSpacer size="l" />
          <EuiTitle size="xs">
            <h4>
              {i18n.translate(
                'observability.alerting.createAdRuleFlyout.customForecastResultIndexTitle',
                { defaultMessage: 'Custom result index' }
              )}
            </h4>
          </EuiTitle>
          <EuiText size="xs" color="subdued">
            <p>
              {i18n.translate(
                'observability.alerting.createAdRuleFlyout.customForecastResultIndexDescription',
                { defaultMessage: 'Store forecaster results to your own index.' }
              )}{' '}
              <EuiLink href={FORECASTER_DOCS_LINK} target="_blank">
                {i18n.translate('observability.alerting.createAdRuleFlyout.learnMore', {
                  defaultMessage: 'Learn more',
                })}
              </EuiLink>
            </p>
          </EuiText>
          <EuiSpacer size="m" />
          <EuiFormRow
            label={i18n.translate(
              'observability.alerting.createAdRuleFlyout.forecastResultIndexFieldLabel',
              { defaultMessage: 'Field' }
            )}
            helpText={i18n.translate(
              'observability.alerting.createAdRuleFlyout.forecastResultIndexHelp',
              {
                defaultMessage:
                  'Custom result index name must contain fewer than 255 characters including the prefix "opensearch-forecast-result-". Valid characters are a-z, 0-9, -(hyphen), and _(underscore).',
              }
            )}
            isInvalid={!!visibleErrors.resultIndex}
            error={visibleErrors.resultIndex}
          >
            <EuiFieldText
              value={form.resultIndex}
              prepend={CUSTOM_FORECASTER_RESULT_INDEX_PREFIX}
              isInvalid={!!visibleErrors.resultIndex}
              placeholder={i18n.translate(
                'observability.alerting.createAdRuleFlyout.forecastResultIndexPlaceholder',
                { defaultMessage: 'Enter result index name' }
              )}
              onChange={(event) => updateForm('resultIndex', event.target.value)}
              data-test-subj="alertManagerCreateForecasterResultIndex"
            />
          </EuiFormRow>
          <EuiSpacer size="m" />
          <EuiCheckbox
            id="alertManagerFlattenForecastResultIndex"
            label={i18n.translate(
              'observability.alerting.createAdRuleFlyout.flattenForecastResultIndexLabel',
              { defaultMessage: 'Enable flattened custom result index' }
            )}
            checked={form.flattenCustomResultIndex}
            onChange={(event) => updateForm('flattenCustomResultIndex', event.target.checked)}
          />
          <EuiText size="xs" color="subdued">
            <p>
              {i18n.translate(
                'observability.alerting.createAdRuleFlyout.flattenForecastResultIndexHelp',
                {
                  defaultMessage:
                    'Flattening the custom result index makes it easier to query on dashboards and supports term aggregations on categorical fields.',
                }
              )}
            </p>
          </EuiText>
          <EuiSpacer size="m" />
          <EuiCheckbox
            id="alertManagerForecastResultIndexLifecycle"
            label={i18n.translate(
              'observability.alerting.createAdRuleFlyout.forecastResultIndexLifecycleLabel',
              { defaultMessage: 'Enable custom result index lifecycle management' }
            )}
            checked={form.customResultIndexLifecycleEnabled}
            onChange={(event) =>
              updateForm('customResultIndexLifecycleEnabled', event.target.checked)
            }
          />
          {form.customResultIndexLifecycleEnabled && (
            <>
              <EuiSpacer size="m" />
              <EuiFlexGroup gutterSize="l">
                <EuiFlexItem>
                  <EuiFormRow
                    label={i18n.translate(
                      'observability.alerting.createAdRuleFlyout.forecastResultIndexMinAgeLabel',
                      { defaultMessage: 'Min index age (optional)' }
                    )}
                    isInvalid={!!visibleErrors.resultIndexMinAge}
                    error={visibleErrors.resultIndexMinAge}
                  >
                    <EuiFieldNumber
                      isInvalid={!!visibleErrors.resultIndexMinAge}
                      min={1}
                      value={form.resultIndexMinAge}
                      append="days"
                      onChange={(event) =>
                        updateForm('resultIndexMinAge', parseNumberInputValue(event.target.value))
                      }
                    />
                  </EuiFormRow>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiFormRow
                    label={i18n.translate(
                      'observability.alerting.createAdRuleFlyout.forecastResultIndexMinSizeLabel',
                      { defaultMessage: 'Min index size (optional)' }
                    )}
                    isInvalid={!!visibleErrors.resultIndexMinSize}
                    error={visibleErrors.resultIndexMinSize}
                  >
                    <EuiFieldNumber
                      isInvalid={!!visibleErrors.resultIndexMinSize}
                      min={1000}
                      value={form.resultIndexMinSize}
                      append="MB"
                      onChange={(event) =>
                        updateForm('resultIndexMinSize', parseNumberInputValue(event.target.value))
                      }
                    />
                  </EuiFormRow>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiFormRow
                    label={i18n.translate(
                      'observability.alerting.createAdRuleFlyout.forecastResultIndexTtlLabel',
                      { defaultMessage: 'Index TTL (optional)' }
                    )}
                    isInvalid={!!visibleErrors.resultIndexTtl}
                    error={visibleErrors.resultIndexTtl}
                  >
                    <EuiFieldNumber
                      isInvalid={!!visibleErrors.resultIndexTtl}
                      min={1}
                      value={form.resultIndexTtl}
                      append="days"
                      onChange={(event) =>
                        updateForm('resultIndexTtl', parseNumberInputValue(event.target.value))
                      }
                    />
                  </EuiFormRow>
                </EuiFlexItem>
              </EuiFlexGroup>
            </>
          )}
        </>
      )}
    </AdContentPanel>
  );

  const renderForecastModelParametersStep = () => (
    <>
      <EuiText size="s">
        <p>
          {i18n.translate('observability.alerting.createAdRuleFlyout.forecasterModelHelp', {
            defaultMessage:
              'Define how often the forecast generates the next value based on historical data and how far to forecast into the future.',
          })}
        </p>
      </EuiText>
      <EuiSpacer size="m" />
      <AdContentPanel
        title={i18n.translate('observability.alerting.createAdRuleFlyout.coreParametersTitle', {
          defaultMessage: 'Core parameters',
        })}
      >
        <AdFormattedFormRow
          fullWidth
          title={i18n.translate('observability.alerting.createAdRuleFlyout.forecastIntervalLabel', {
            defaultMessage: 'Forecasting interval',
          })}
          hint={i18n.translate('observability.alerting.createAdRuleFlyout.forecastIntervalHint', {
            defaultMessage: 'How often the forecast runs to generate next value.',
          })}
          helpText={i18n.translate(
            'observability.alerting.createAdRuleFlyout.forecastIntervalHelp',
            {
              defaultMessage: 'The interval must be at least one minute.',
            }
          )}
          isInvalid={!!visibleErrors.interval}
          error={visibleErrors.interval}
        >
          <EuiFlexGroup gutterSize="none" alignItems="center" style={{ maxWidth: 400 }}>
            <EuiFlexItem grow={false}>
              <div style={{ width: 140 }}>
                <EuiFieldNumber
                  value={form.interval}
                  min={1}
                  style={{ width: '100%' }}
                  onChange={(e) => updateForm('interval', parseNumberInputValue(e.target.value))}
                />
              </div>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color="default" className="unit-badge">
                minutes
              </EuiBadge>
            </EuiFlexItem>
          </EuiFlexGroup>
        </AdFormattedFormRow>

        <EuiSpacer size="l" />

        <AdFormattedFormRow
          fullWidth
          title={i18n.translate('observability.alerting.createAdRuleFlyout.windowDelayLabel', {
            defaultMessage: 'Window delay',
          })}
          hint={i18n.translate(
            'observability.alerting.createAdRuleFlyout.forecastWindowDelayHint',
            {
              defaultMessage:
                'Specify a window of delay for a forecaster to fetch data, if you need to account for extra processing time.',
            }
          )}
          isInvalid={!!visibleErrors.windowDelay}
          error={visibleErrors.windowDelay}
        >
          <EuiFlexGroup gutterSize="none" alignItems="center" style={{ maxWidth: 400 }}>
            <EuiFlexItem grow={false}>
              <div style={{ width: 140 }}>
                <EuiFieldNumber
                  value={form.windowDelay}
                  min={0}
                  style={{ width: '100%' }}
                  onChange={(e) => updateForm('windowDelay', parseNumberInputValue(e.target.value))}
                />
              </div>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color="default" className="unit-badge">
                minutes
              </EuiBadge>
            </EuiFlexItem>
          </EuiFlexGroup>
        </AdFormattedFormRow>

        <EuiSpacer size="l" />

        <AdFormattedFormRow
          fullWidth
          title={i18n.translate('observability.alerting.createAdRuleFlyout.horizonLabel', {
            defaultMessage: 'Horizon',
          })}
          hint={i18n.translate('observability.alerting.createAdRuleFlyout.horizonHint', {
            defaultMessage: 'How far the forecast extends into the future.',
          })}
          helpText={i18n.translate('observability.alerting.createAdRuleFlyout.horizonHelp', {
            defaultMessage: 'A valid horizon is between 1 and 180.',
          })}
          isInvalid={!!visibleErrors.horizon}
          error={visibleErrors.horizon}
        >
          <EuiFlexGroup gutterSize="none" alignItems="center" style={{ maxWidth: 400 }}>
            <EuiFlexItem grow={false}>
              <div style={{ width: 140 }}>
                <EuiFieldNumber
                  value={form.horizon}
                  min={1}
                  max={180}
                  style={{ width: '100%' }}
                  onChange={(e) => updateForm('horizon', parseNumberInputValue(e.target.value))}
                />
              </div>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color="default" className="unit-badge">
                intervals
              </EuiBadge>
            </EuiFlexItem>
          </EuiFlexGroup>
        </AdFormattedFormRow>

        <EuiSpacer size="l" />

        <AdFormattedFormRow
          fullWidth
          title={i18n.translate('observability.alerting.createAdRuleFlyout.historyLabel', {
            defaultMessage: 'History',
          })}
          hint={i18n.translate('observability.alerting.createAdRuleFlyout.forecastHistoryHint', {
            defaultMessage: 'How far back the model looks for training data.',
          })}
          helpText={i18n.translate(
            'observability.alerting.createAdRuleFlyout.forecastHistoryHelp',
            {
              defaultMessage: 'Minimum history: 40 intervals.',
            }
          )}
          isInvalid={!!visibleErrors.history}
          error={visibleErrors.history}
        >
          <EuiFlexGroup gutterSize="none" alignItems="center" style={{ maxWidth: 400 }}>
            <EuiFlexItem grow={false}>
              <div style={{ width: 140 }}>
                <EuiFieldNumber
                  value={form.history}
                  min={40}
                  max={10000}
                  style={{ width: '100%' }}
                  onChange={(e) => updateForm('history', parseNumberInputValue(e.target.value))}
                />
              </div>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color="default" className="unit-badge">
                intervals
              </EuiBadge>
            </EuiFlexItem>
          </EuiFlexGroup>
        </AdFormattedFormRow>
      </AdContentPanel>
      <EuiSpacer size="m" />
      {renderAdvancedSettings(
        i18n.translate('observability.alerting.createAdRuleFlyout.advancedModelParametersTitle', {
          defaultMessage: 'Advanced model parameters',
        })
      )}
      <EuiSpacer size="m" />
      {renderForecasterStorageSettings()}
    </>
  );

  const renderJobsStep = () => (
    <AdContentPanel
      title={i18n.translate('observability.alerting.createAdRuleFlyout.realtimeJobTitle', {
        defaultMessage: 'Real-time detection',
      })}
      subTitle={
        <EuiText className="content-panel-subTitle" style={{ lineHeight: 'normal' }}>
          {i18n.translate('observability.alerting.createAdRuleFlyout.realtimeJobDescription', {
            defaultMessage:
              'Real-time detection lets you find anomalies in your data in near real-time. To receive accurate and real-time anomalies, the detector needs to start and collect sufficient data to include your latest changes. The earlier the detector starts running, the sooner the real-time anomalies will be available.',
          })}{' '}
          <AdLearnMore />
        </EuiText>
      }
    >
      <EuiFlexItem>
        <EuiCheckbox
          id="realTimeCheckbox"
          label={i18n.translate('observability.alerting.createAdRuleFlyout.startDetectorLabel', {
            defaultMessage: 'Start real-time detector automatically (recommended)',
          })}
          checked={form.startAfterCreate}
          onChange={(e) => updateForm('startAfterCreate', e.target.checked)}
        />
      </EuiFlexItem>
    </AdContentPanel>
  );

  const renderReviewStep = () => {
    const selectedDatasource = openSearchDatasources.find(
      (datasource) => datasource.id === form.datasourceId
    );
    const featureSummary =
      form.features
        .filter((feature) => feature.featureName.trim())
        .map(
          (feature) =>
            `${feature.featureName.trim()}: ${
              feature.aggregationBy
            }(${feature.aggregationOf.trim()})`
        )
        .join(', ') || '-';
    const descriptionItems = [
      {
        title: i18n.translate('observability.alerting.createAdRuleFlyout.reviewDatasource', {
          defaultMessage: 'Datasource',
        }),
        description: selectedDatasource?.name || form.datasourceId || '-',
      },
      {
        title: i18n.translate('observability.alerting.createAdRuleFlyout.reviewIndices', {
          defaultMessage: 'Indices',
        }),
        description: form.indices.join(', ') || '-',
      },
      {
        title: i18n.translate('observability.alerting.createAdRuleFlyout.reviewTimeField', {
          defaultMessage: 'Time field',
        }),
        description: form.timeField || '-',
      },
      {
        title: i18n.translate('observability.alerting.createAdRuleFlyout.reviewFeatures', {
          defaultMessage: 'Features',
        }),
        description: featureSummary,
      },
      {
        title: i18n.translate('observability.alerting.createAdRuleFlyout.reviewCategoryField', {
          defaultMessage: 'Category field',
        }),
        description: form.categoryField.join(', ') || '-',
      },
      {
        title: i18n.translate('observability.alerting.createAdRuleFlyout.reviewSchedule', {
          defaultMessage: 'Schedule',
        }),
        description: isDetector
          ? i18n.translate('observability.alerting.createAdRuleFlyout.reviewDetectorSchedule', {
              defaultMessage:
                'Detection interval: {interval}m, frequency: {frequency}m, window delay: {windowDelay}m',
              values: {
                interval: form.interval,
                frequency: form.frequency,
                windowDelay: form.windowDelay,
              },
            })
          : i18n.translate('observability.alerting.createAdRuleFlyout.reviewForecasterSchedule', {
              defaultMessage:
                'Forecast interval: {interval}m, horizon: {horizon}, window delay: {windowDelay}m',
              values: {
                interval: form.interval,
                horizon: form.horizon,
                windowDelay: form.windowDelay,
              },
            }),
      },
    ];

    return (
      <>
        {Object.keys(allErrors).length > 0 && (
          <>
            <EuiCallOut
              color="warning"
              iconType="alert"
              title={i18n.translate(
                'observability.alerting.createAdRuleFlyout.reviewValidationTitle',
                {
                  defaultMessage: 'Some required fields need attention.',
                }
              )}
            />
            <EuiSpacer size="m" />
          </>
        )}
        <EuiDescriptionList type="column" listItems={descriptionItems} />
        {!isEdit && (
          <>
            <EuiHorizontalRule margin="m" />
            <EuiSwitch
              label={i18n.translate(
                'observability.alerting.createAdRuleFlyout.reviewStartDetector',
                {
                  defaultMessage: 'Start real-time detector automatically (recommended)',
                }
              )}
              checked={form.startAfterCreate}
              onChange={(e) => updateForm('startAfterCreate', e.target.checked)}
            />
          </>
        )}
      </>
    );
  };

  const renderStopForEditModal = () => {
    if (!editLifecycleBlocker) return null;

    if (editLifecycleBlocker === 'detector-running') {
      const runningJobsLabel = getDetectorRunningJobsLabel(existingResource);
      return (
        <EuiOverlayMask>
          <EuiModal onClose={handleStopForEditModalCancel}>
            <EuiModalHeader>
              <EuiModalHeaderTitle>
                <EuiText size="s">
                  <h2>
                    {i18n.translate(
                      'observability.alerting.createAdRuleFlyout.stopDetectorToEditTitle',
                      {
                        defaultMessage: 'Stop detector to proceed?',
                      }
                    )}
                  </h2>
                </EuiText>
              </EuiModalHeaderTitle>
            </EuiModalHeader>

            <EuiModalBody>
              <EuiText>
                <p>
                  {i18n.translate(
                    'observability.alerting.createAdRuleFlyout.stopDetectorToEditDescription',
                    {
                      defaultMessage:
                        'You must stop the {runningJobsLabel} to change its configuration. After you reconfigure the detector, be sure to restart it.',
                      values: { runningJobsLabel },
                    }
                  )}
                </p>
              </EuiText>
            </EuiModalBody>

            <EuiModalFooter>
              <EuiSmallButtonEmpty
                onClick={handleStopForEditModalCancel}
                isDisabled={isStoppingForEdit}
              >
                {i18n.translate('observability.alerting.createAdRuleFlyout.stopEditCancelButton', {
                  defaultMessage: 'Cancel',
                })}
              </EuiSmallButtonEmpty>
              <EuiSmallButton
                fill
                color="primary"
                onClick={handleStopAndProceedToEdit}
                isLoading={isStoppingForEdit}
              >
                {i18n.translate(
                  'observability.alerting.createAdRuleFlyout.stopDetectorProceedButton',
                  {
                    defaultMessage: 'Stop and proceed to edit',
                  }
                )}
              </EuiSmallButton>
            </EuiModalFooter>
          </EuiModal>
        </EuiOverlayMask>
      );
    }

    if (editLifecycleBlocker === 'forecaster-test') {
      return (
        <EuiOverlayMask>
          <EuiModal onClose={handleStopForEditModalCancel}>
            <EuiModalHeader>
              <EuiModalHeaderTitle>
                <EuiText size="s">
                  <h2>
                    {i18n.translate(
                      'observability.alerting.createAdRuleFlyout.waitForForecastTestTitle',
                      {
                        defaultMessage: 'Please wait for test initialization',
                      }
                    )}
                  </h2>
                </EuiText>
              </EuiModalHeaderTitle>
            </EuiModalHeader>

            <EuiModalBody>
              <EuiCallOut
                color="primary"
                iconType="clock"
                title={i18n.translate(
                  'observability.alerting.createAdRuleFlyout.forecastTestInProgressTitle',
                  {
                    defaultMessage: 'Test in progress',
                  }
                )}
              >
                <p>
                  {i18n.translate(
                    'observability.alerting.createAdRuleFlyout.forecastTestInProgressDescription',
                    {
                      defaultMessage:
                        'The initial test of your forecast configuration is currently running. Please wait for the test to complete before making any changes to the configuration.',
                    }
                  )}
                </p>
              </EuiCallOut>
            </EuiModalBody>

            <EuiModalFooter>
              <EuiSmallButton fill color="primary" onClick={handleStopForEditModalCancel}>
                {i18n.translate(
                  'observability.alerting.createAdRuleFlyout.forecastTestUnderstandButton',
                  {
                    defaultMessage: 'I understand',
                  }
                )}
              </EuiSmallButton>
            </EuiModalFooter>
          </EuiModal>
        </EuiOverlayMask>
      );
    }

    const forecasterState = getResourceState(existingResource);
    const isInitializingForecast = stateMatches(forecasterState, [
      FORECASTER_INITIALIZING_FORECAST_STATE,
      'INITIALIZING_FORECAST',
    ]);
    const isAwaitingDataToInit = stateMatches(forecasterState, [
      FORECASTER_AWAITING_DATA_TO_INIT_STATE,
      'AWAITING_DATA_TO_INIT',
    ]);
    const isAwaitingDataToRestart = stateMatches(forecasterState, [
      FORECASTER_AWAITING_DATA_TO_RESTART_STATE,
      'AWAITING_DATA_TO_RESTART',
    ]);
    const showForecastWarning =
      isAwaitingDataToRestart || (!isInitializingForecast && !isAwaitingDataToInit);
    const forecastModalTitle = isInitializingForecast
      ? i18n.translate(
          'observability.alerting.createAdRuleFlyout.cancelInitializingForecastTitle',
          {
            defaultMessage: 'Cancel initializing the forecast to edit?',
          }
        )
      : isAwaitingDataToInit || isAwaitingDataToRestart
        ? i18n.translate('observability.alerting.createAdRuleFlyout.cancelForecastToEditTitle', {
            defaultMessage: 'Cancel forecast to edit?',
          })
        : i18n.translate('observability.alerting.createAdRuleFlyout.stopForecastToEditTitle', {
            defaultMessage: 'Stop forecast to edit?',
          });
    const forecastModalDescription = (() => {
      if (isInitializingForecast) {
        return i18n.translate(
          'observability.alerting.createAdRuleFlyout.cancelInitializingForecastDescription',
          {
            defaultMessage:
              'You must cancel initializing the forecast before editing its configuration. After making change to the forecast, restart the forecast.',
          }
        );
      }
      if (isAwaitingDataToInit || isAwaitingDataToRestart) {
        return i18n.translate(
          'observability.alerting.createAdRuleFlyout.cancelForecastToEditDescription',
          {
            defaultMessage:
              'You must cancel the forecast before editing its configuration. After making change to the forecast, restart the forecast.',
          }
        );
      }
      return i18n.translate(
        'observability.alerting.createAdRuleFlyout.stopForecastToEditDescription',
        {
          defaultMessage:
            'You must stop the forecast before editing its configuration. After making any changes, you can restart the forecast.',
        }
      );
    })();
    const forecastConfirmLabel =
      isInitializingForecast || isAwaitingDataToInit || isAwaitingDataToRestart
        ? i18n.translate('observability.alerting.createAdRuleFlyout.cancelForecastEditButton', {
            defaultMessage: 'Cancel and edit',
          })
        : i18n.translate('observability.alerting.createAdRuleFlyout.stopForecastEditButton', {
            defaultMessage: 'Stop and edit',
          });

    return (
      <EuiOverlayMask>
        <EuiModal onClose={handleStopForEditModalCancel}>
          <EuiModalHeader>
            <EuiModalHeaderTitle>
              <EuiText size="s">
                <h2>{forecastModalTitle}</h2>
              </EuiText>
            </EuiModalHeaderTitle>
          </EuiModalHeader>

          <EuiModalBody>
            {showForecastWarning && (
              <>
                <EuiCallOut
                  color="warning"
                  iconType="alert"
                  title={i18n.translate(
                    'observability.alerting.createAdRuleFlyout.forecastEditWipeWarningTitle',
                    {
                      defaultMessage: 'Editing forecast will wipe historical visualizations',
                    }
                  )}
                >
                  <p>
                    {i18n.translate(
                      'observability.alerting.createAdRuleFlyout.forecastEditWipeWarningDescription',
                      {
                        defaultMessage:
                          'Changing categorical variables or the custom index name affects the forecast results and wipes out any historical forecast visualizations.',
                      }
                    )}
                  </p>
                </EuiCallOut>
                <EuiSpacer size="m" />
              </>
            )}
            <EuiText>
              <p>{forecastModalDescription}</p>
            </EuiText>
          </EuiModalBody>

          <EuiModalFooter>
            <EuiSmallButtonEmpty
              onClick={handleStopForEditModalCancel}
              isDisabled={isStoppingForEdit}
            >
              {i18n.translate('observability.alerting.createAdRuleFlyout.stopEditCancelButton', {
                defaultMessage: 'Cancel',
              })}
            </EuiSmallButtonEmpty>
            <EuiSmallButton
              fill
              color="primary"
              onClick={handleStopAndProceedToEdit}
              isLoading={isStoppingForEdit}
            >
              {forecastConfirmLabel}
            </EuiSmallButton>
          </EuiModalFooter>
        </EuiModal>
      </EuiOverlayMask>
    );
  };

  const renderStartAfterEditPrompt = () => (
    <EuiPanel paddingSize="l">
      <EuiCallOut
        color="success"
        iconType="check"
        title={i18n.translate(
          'observability.alerting.createAdRuleFlyout.detectorUpdatedStartPromptTitle',
          {
            defaultMessage: 'Anomaly detection rule updated',
          }
        )}
      >
        <p>
          {i18n.translate(
            'observability.alerting.createAdRuleFlyout.detectorUpdatedStartPromptMessage',
            {
              defaultMessage:
                'This detector was stopped so you could edit it. Start it again to resume real-time anomaly detection, or close this panel to leave it stopped.',
            }
          )}
        </p>
      </EuiCallOut>
    </EuiPanel>
  );

  const renderStepContent = () => {
    if (startAfterEditPrompt) return renderStartAfterEditPrompt();

    if (isDetector) {
      if (isDetectorModelEdit) return renderDetectorModelStep();
      if (isDetectorSettingsEdit) return renderDefineStep();
      if (currentStep === 0) return renderDefineStep();
      if (currentStep === 1) return renderDetectorModelStep();
      if (currentStep === 2) return renderJobsStep();
      return renderReviewStep();
    }

    if (currentStep === 0) return renderForecasterDefineStep();
    return renderForecastModelParametersStep();
  };

  return (
    <>
      <EuiFlyout
        onClose={startAfterEditPrompt ? handleCloseAfterEditPrompt : onCancel}
        size="l"
        ownFocus
        aria-labelledby="createAdRuleFlyoutTitle"
      >
        <EuiFlyoutHeader hasBorder>
          <EuiTitle size="m">
            <h2 id="createAdRuleFlyoutTitle">{title}</h2>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiText size="xs" color="subdued">
            {isEdit
              ? isDetector
                ? i18n.translate('observability.alerting.createAdRuleFlyout.editDetectorSubtitle', {
                    defaultMessage:
                      'Update this anomaly detection rule without leaving Alerts Manager.',
                  })
                : i18n.translate(
                    'observability.alerting.createAdRuleFlyout.editForecasterSubtitle',
                    {
                      defaultMessage:
                        'Update this forecasting rule without leaving Alerts Manager.',
                    }
                  )
              : isDetector
                ? i18n.translate('observability.alerting.createAdRuleFlyout.detectorSubtitle', {
                    defaultMessage:
                      'Create an anomaly detection rule using the same model definition fields from the AD workflow.',
                  })
                : i18n.translate('observability.alerting.createAdRuleFlyout.forecasterSubtitle', {
                    defaultMessage:
                      'Create a forecasting rule using the same data source and model parameter fields from the Forecasting workflow.',
                  })}
          </EuiText>
        </EuiFlyoutHeader>

        <EuiFlyoutBody>
          {openSearchDatasources.length === 0 ? (
            <EuiCallOut
              color="warning"
              iconType="alert"
              title={i18n.translate(
                'observability.alerting.createAdRuleFlyout.noOpenSearchDatasourceTitle',
                {
                  defaultMessage: 'Select an OpenSearch datasource to create this rule.',
                }
              )}
            />
          ) : isEdit && !isEditFormReady && !editDetailError ? (
            <EuiFlexGroup justifyContent="center" alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiLoadingSpinner size="xl" />
              </EuiFlexItem>
            </EuiFlexGroup>
          ) : isEdit && editDetailError ? (
            <EuiCallOut
              color="danger"
              iconType="alert"
              title={i18n.translate('observability.alerting.createAdRuleFlyout.editLoadFailed', {
                defaultMessage: 'Failed to load rule details.',
              })}
            >
              <p>{editDetailError.message}</p>
            </EuiCallOut>
          ) : isEdit && !isEditFormReady ? (
            <EuiCallOut
              color="warning"
              iconType="alert"
              title={i18n.translate('observability.alerting.createAdRuleFlyout.editMissingDetail', {
                defaultMessage: 'Rule details are not available for editing.',
              })}
            />
          ) : (
            <EuiFlexGroup gutterSize="l" alignItems="flexStart">
              {!isSingleDetectorEdit && (
                <EuiFlexItem grow={false} style={{ width: 240 }}>
                  <EuiSteps steps={steps} />
                </EuiFlexItem>
              )}
              <EuiFlexItem>
                {submitError && (
                  <>
                    <EuiCallOut color="danger" iconType="alert" title={submitError} />
                    <EuiSpacer size="m" />
                  </>
                )}
                <EuiText size="s">
                  <h1>
                    {startAfterEditPrompt
                      ? i18n.translate(
                          'observability.alerting.createAdRuleFlyout.startDetectorAfterEditTitle',
                          {
                            defaultMessage: 'Start detector',
                          }
                        )
                      : stepTitles[currentStep]}
                  </h1>
                </EuiText>
                <EuiSpacer size="m" />
                {renderStepContent()}
              </EuiFlexItem>
            </EuiFlexGroup>
          )}
        </EuiFlyoutBody>

        <EuiFlyoutFooter>
          {startAfterEditPrompt ? (
            <EuiFlexGroup justifyContent="spaceBetween" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  onClick={handleCloseAfterEditPrompt}
                  isDisabled={isStartingEditedDetector}
                >
                  {i18n.translate(
                    'observability.alerting.createAdRuleFlyout.closeAfterEditButton',
                    {
                      defaultMessage: 'Close',
                    }
                  )}
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton
                  fill
                  onClick={() =>
                    handleStartEditedDetector(
                      startAfterEditPrompt.detectorId,
                      startAfterEditPrompt.datasourceId
                    )
                  }
                  isLoading={isStartingEditedDetector}
                  data-test-subj="alertManagerStartDetectorAfterEditButton"
                >
                  {i18n.translate(
                    'observability.alerting.createAdRuleFlyout.startDetectorAfterEditButton',
                    {
                      defaultMessage: 'Start detector',
                    }
                  )}
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          ) : (
            <EuiFlexGroup justifyContent="spaceBetween" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty onClick={onCancel}>
                  {i18n.translate('observability.alerting.createAdRuleFlyout.cancelButton', {
                    defaultMessage: 'Cancel',
                  })}
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiFlexGroup gutterSize="s" responsive={false}>
                  {currentStep > 0 && !isSingleDetectorEdit && (
                    <EuiFlexItem grow={false}>
                      <EuiButtonEmpty onClick={handlePrevious} isDisabled={isSaving}>
                        {i18n.translate(
                          'observability.alerting.createAdRuleFlyout.previousButton',
                          {
                            defaultMessage: 'Previous',
                          }
                        )}
                      </EuiButtonEmpty>
                    </EuiFlexItem>
                  )}
                  <EuiFlexItem grow={false}>
                    {currentStep === finalStep ? (
                      <EuiButton
                        fill
                        onClick={handleSubmit}
                        isDisabled={
                          Object.keys(submitBlockingErrors).length > 0 ||
                          isSaving ||
                          !isEditFormReady ||
                          !!editLifecycleBlocker
                        }
                        isLoading={isSaving}
                        data-test-subj="alertManagerCreateAdRuleSubmit"
                      >
                        {submitButtonLabel}
                      </EuiButton>
                    ) : (
                      <EuiButton
                        fill
                        onClick={handleNext}
                        isDisabled={
                          openSearchDatasources.length === 0 ||
                          !isEditFormReady ||
                          !!editLifecycleBlocker
                        }
                      >
                        {i18n.translate('observability.alerting.createAdRuleFlyout.nextButton', {
                          defaultMessage: 'Next',
                        })}
                      </EuiButton>
                    )}
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>
          )}
        </EuiFlyoutFooter>
      </EuiFlyout>
      {showStopForEditModal && renderStopForEditModal()}
    </>
  );
};
