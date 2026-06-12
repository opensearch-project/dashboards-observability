/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Forecaster Detail Flyout — read-only forecast configuration shown from the
 * Rules table. It mirrors the detector flyout shell while keeping forecasting
 * terminology visible in the table-level unified experience.
 */
import React from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiButtonEmpty,
  EuiCallOut,
  EuiCodeBlock,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiHealth,
  EuiLoadingContent,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import type { ADForecaster, UnifiedRuleSummary } from '../../../common/types/alerting';
import { useRuleDetail } from './hooks/use_rule_detail';
import { HEALTH_COLORS, SEVERITY_COLORS, STATUS_COLORS } from './shared_constants';

export interface ForecasterDetailFlyoutProps {
  forecaster: UnifiedRuleSummary;
  onClose: () => void;
}

interface FeatureRow {
  name: string;
  definition: React.ReactNode;
  state: React.ReactNode;
}

const EMPTY_VALUE = '—';

const enabledLabel = () =>
  i18n.translate('observability.alerting.forecasterDetailFlyout.enabledLabel', {
    defaultMessage: 'Enabled',
  });

const disabledLabel = () =>
  i18n.translate('observability.alerting.forecasterDetailFlyout.disabledLabel', {
    defaultMessage: 'Disabled',
  });

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const stringValue = (value: unknown, fallback = EMPTY_VALUE): string =>
  typeof value === 'string' && value.trim() ? value : fallback;

const numberValue = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const formatTimestamp = (value: unknown): string => {
  const millis = numberValue(value);
  if (millis === undefined) return EMPTY_VALUE;
  return new Date(millis).toLocaleString();
};

const formatPeriod = (value: unknown): string => {
  const period = asRecord(asRecord(value).period);
  const interval = numberValue(period.interval);
  const unit = stringValue(period.unit, '');
  if (interval === undefined || !unit) return EMPTY_VALUE;
  return `${interval} ${unit.toLowerCase()}`;
};

const formatList = (value: unknown): string => {
  const list = asArray(value)
    .map((item) => String(item))
    .filter(Boolean);
  return list.length > 0 ? list.join(', ') : EMPTY_VALUE;
};

const getField = (record: Record<string, unknown>, snakeKey: string, camelKey: string): unknown =>
  record[snakeKey] !== undefined ? record[snakeKey] : record[camelKey];

const getForecasterJob = (forecaster: ADForecaster): Record<string, unknown> =>
  asRecord(forecaster.forecaster_job || forecaster.forecasterJob);

const getUiMetadata = (forecaster: ADForecaster): Record<string, unknown> =>
  asRecord(forecaster.ui_metadata || forecaster.uiMetadata);

const getFeatureMetadata = (
  forecaster: ADForecaster,
  featureName: string
): Record<string, unknown> => {
  const uiMetadata = getUiMetadata(forecaster);
  const features = asRecord(uiMetadata.features);
  return asRecord(features[featureName]);
};

const getFeatures = (forecaster: ADForecaster): unknown[] =>
  asArray(forecaster.feature_attributes || forecaster.featureAttributes);

const getCategoryField = (forecaster: ADForecaster): unknown =>
  forecaster.category_field || forecaster.categoryField;

const forecasterFromSummary = (summary: UnifiedRuleSummary): ADForecaster => ({
  id: summary.id,
  name: summary.name,
  description: summary.annotations.description,
  indices: summary.labels.indices ? summary.labels.indices.split(',') : undefined,
  time_field: summary.labels.time_field,
  last_update_time: Date.parse(summary.lastModified),
  forecast_interval: undefined,
  window_delay: undefined,
  feature_attributes: summary.annotations.features
    ? summary.annotations.features.split(',').map((name) => ({
        feature_name: name.trim(),
        feature_enabled: true,
      }))
    : [],
});

const buildFeatureRows = (forecaster: ADForecaster): FeatureRow[] => {
  return getFeatures(forecaster).map((featureValue, index) => {
    const feature = asRecord(featureValue);
    const name =
      stringValue(getField(feature, 'feature_name', 'featureName'), '') ||
      stringValue(
        getField(feature, 'feature_id', 'featureId'),
        i18n.translate('observability.alerting.forecasterDetailFlyout.fallbackFeatureName', {
          defaultMessage: 'Feature {index}',
          values: { index: index + 1 },
        })
      );
    const enabled = getField(feature, 'feature_enabled', 'featureEnabled') !== false;
    const metadata = getFeatureMetadata(forecaster, name);
    const aggregationOf = stringValue(metadata.aggregationOf, '');
    const aggregationBy = stringValue(metadata.aggregationBy, '');
    const aggregationQuery =
      getField(feature, 'aggregation_query', 'aggregationQuery') || forecaster.featureQuery;

    let definition: React.ReactNode = EMPTY_VALUE;
    if (aggregationOf || aggregationBy) {
      definition = (
        <EuiText size="s">
          <p>
            <FormattedMessage
              id="observability.alerting.forecasterDetailFlyout.featureDefinition"
              defaultMessage="Field: {field} · Aggregation method: {method}"
              values={{
                field: aggregationOf || EMPTY_VALUE,
                method: aggregationBy || EMPTY_VALUE,
              }}
            />
          </p>
        </EuiText>
      );
    } else if (aggregationQuery && Object.keys(asRecord(aggregationQuery)).length > 0) {
      definition = (
        <EuiCodeBlock language="json" fontSize="s" paddingSize="s" isCopyable>
          {JSON.stringify(aggregationQuery, null, 2)}
        </EuiCodeBlock>
      );
    }

    return {
      name,
      definition,
      state: (
        <EuiHealth color={enabled ? 'success' : 'subdued'}>
          {enabled ? enabledLabel() : disabledLabel()}
        </EuiHealth>
      ),
    };
  });
};

const buildFilterDisplay = (forecaster: ADForecaster): string => {
  const filterQuery = forecaster.filter_query || forecaster.filterQuery || {};
  const record = asRecord(filterQuery);
  if (Object.keys(record).length === 0) return EMPTY_VALUE;
  return JSON.stringify(record, null, 2);
};

const buildImputationDisplay = (forecaster: ADForecaster): string => {
  const imputation = asRecord(forecaster.imputationOption || forecaster.imputation_option);
  const method = stringValue(imputation.method || imputation.imputationMethod, '');
  if (!method) return EMPTY_VALUE;
  const defaultFill = asArray(imputation.defaultFill || imputation.default_fill);
  if (defaultFill.length === 0) return method;
  return `${method} (${defaultFill.map((entry) => JSON.stringify(entry)).join(', ')})`;
};

export const ForecasterDetailFlyout: React.FC<ForecasterDetailFlyoutProps> = ({
  forecaster,
  onClose,
}) => {
  const { data: detail, isLoading, error } = useRuleDetail(
    forecaster.datasourceId,
    forecaster.id,
    'forecaster'
  );
  const rawForecaster =
    (detail?.raw as ADForecaster | undefined) || forecasterFromSummary(forecaster);
  const description =
    detail?.description || rawForecaster.description || forecaster.annotations.description || '';
  const featureRows = buildFeatureRows(rawForecaster);
  const filterDisplay = buildFilterDisplay(rawForecaster);
  const resultIndex = stringValue(rawForecaster.result_index || rawForecaster.resultIndex);
  const categoryField = getCategoryField(rawForecaster);
  const forecasterType =
    asArray(categoryField).length > 0
      ? i18n.translate('observability.alerting.forecasterDetailFlyout.highCardinalityType', {
          defaultMessage: 'High-cardinality',
        })
      : i18n.translate('observability.alerting.forecasterDetailFlyout.singleStreamType', {
          defaultMessage: 'Single stream',
        });
  const shingleSize = rawForecaster.shingle_size || rawForecaster.shingleSize || EMPTY_VALUE;
  const forecasterJob = getForecasterJob(rawForecaster);
  const jobEnabled = forecasterJob.enabled;
  const forecastIntervalDisplay = formatPeriod(
    rawForecaster.forecast_interval || rawForecaster.forecastInterval
  );
  const windowDelayDisplay = formatPeriod(rawForecaster.window_delay || rawForecaster.windowDelay);
  const currentState = stringValue(
    rawForecaster.curState ||
      rawForecaster.cur_state ||
      asRecord(rawForecaster.realtime_task).state ||
      asRecord(rawForecaster.run_once_task).state
  );
  const featureColumns: Array<EuiBasicTableColumn<FeatureRow>> = [
    {
      field: 'name',
      name: i18n.translate('observability.alerting.forecasterDetailFlyout.features.name', {
        defaultMessage: 'Feature name',
      }),
      width: '28%',
      sortable: true,
    },
    {
      field: 'definition',
      name: i18n.translate('observability.alerting.forecasterDetailFlyout.features.definition', {
        defaultMessage: 'Feature definition',
      }),
      render: (definition: React.ReactNode) => definition,
    },
    {
      field: 'state',
      name: i18n.translate('observability.alerting.forecasterDetailFlyout.features.state', {
        defaultMessage: 'Feature state',
      }),
      width: '120px',
      render: (state: React.ReactNode) => state,
    },
  ];

  return (
    <EuiFlyout onClose={onClose} size="m" ownFocus aria-labelledby="forecasterDetailTitle">
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem>
            <EuiTitle size="m">
              <h2 id="forecasterDetailTitle">{forecaster.name}</h2>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="xs" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiBadge color="hollow">
                  <FormattedMessage
                    id="observability.alerting.forecasterDetailFlyout.forecasterBadge"
                    defaultMessage="Forecaster"
                  />
                </EuiBadge>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color={STATUS_COLORS[forecaster.status]}>{forecaster.status}</EuiBadge>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color={SEVERITY_COLORS[forecaster.severity]}>
                  {forecaster.severity}
                </EuiBadge>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiHealth color={HEALTH_COLORS[forecaster.healthStatus]}>
                  {forecaster.healthStatus}
                </EuiHealth>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        {isLoading ? (
          <EuiLoadingContent lines={10} />
        ) : (
          <>
            {error && (
              <>
                <EuiCallOut
                  size="s"
                  color="warning"
                  iconType="alert"
                  title={i18n.translate(
                    'observability.alerting.forecasterDetailFlyout.detailLoadError.title',
                    {
                      defaultMessage: 'Some forecaster details could not be loaded',
                    }
                  )}
                  data-test-subj="alertManagerForecasterDetailLoadError"
                >
                  <p>
                    <FormattedMessage
                      id="observability.alerting.forecasterDetailFlyout.detailLoadError.body"
                      defaultMessage="Showing summary information only. Try reopening the flyout to retry."
                    />
                  </p>
                </EuiCallOut>
                <EuiSpacer size="m" />
              </>
            )}

            {description && (
              <>
                <EuiText size="s">
                  <p>{description}</p>
                </EuiText>
                <EuiSpacer size="m" />
              </>
            )}

            <EuiAccordion
              id={`forecaster-settings-${forecaster.id}`}
              buttonContent={
                <strong>
                  <FormattedMessage
                    id="observability.alerting.forecasterDetailFlyout.forecasterSettings"
                    defaultMessage="Forecaster settings"
                  />
                </strong>
              }
              initialIsOpen={true}
              paddingSize="m"
            >
              <EuiDescriptionList
                type="column"
                compressed
                listItems={[
                  {
                    title: i18n.translate(
                      'observability.alerting.forecasterDetailFlyout.settings.name',
                      { defaultMessage: 'Name' }
                    ),
                    description: forecaster.name,
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.forecasterDetailFlyout.settings.forecasterType',
                      { defaultMessage: 'Forecaster type' }
                    ),
                    description: forecasterType,
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.forecasterDetailFlyout.settings.dataSourceIndex',
                      { defaultMessage: 'Data source index' }
                    ),
                    description: formatList(rawForecaster.indices),
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.forecasterDetailFlyout.settings.id',
                      { defaultMessage: 'ID' }
                    ),
                    description: forecaster.id,
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.forecasterDetailFlyout.settings.timestamp',
                      { defaultMessage: 'Timestamp' }
                    ),
                    description: stringValue(rawForecaster.time_field || rawForecaster.timeField),
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.forecasterDetailFlyout.settings.lastUpdated',
                      { defaultMessage: 'Last updated' }
                    ),
                    description: formatTimestamp(
                      rawForecaster.last_update_time || rawForecaster.lastUpdateTime
                    ),
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.forecasterDetailFlyout.settings.customResultIndex',
                      { defaultMessage: 'Custom result index' }
                    ),
                    description: resultIndex,
                  },
                ]}
              />
              <EuiSpacer size="s" />
              <EuiPanel paddingSize="s" color="subdued">
                <EuiText size="s">
                  <strong>
                    <FormattedMessage
                      id="observability.alerting.forecasterDetailFlyout.dataFilter"
                      defaultMessage="Data filter"
                    />
                  </strong>
                </EuiText>
                <EuiSpacer size="xs" />
                {filterDisplay === EMPTY_VALUE ? (
                  <EuiText size="s" color="subdued">
                    {EMPTY_VALUE}
                  </EuiText>
                ) : (
                  <EuiCodeBlock language="json" fontSize="s" paddingSize="s" isCopyable>
                    {filterDisplay}
                  </EuiCodeBlock>
                )}
              </EuiPanel>
            </EuiAccordion>

            <EuiSpacer size="m" />

            <EuiAccordion
              id={`forecaster-features-${forecaster.id}`}
              buttonContent={
                <strong>
                  <FormattedMessage
                    id="observability.alerting.forecasterDetailFlyout.modelConfiguration"
                    defaultMessage="Model configuration"
                  />
                </strong>
              }
              initialIsOpen={true}
              paddingSize="m"
            >
              <EuiBasicTable
                data-test-subj="alertManagerForecasterFeatureTable"
                items={featureRows}
                columns={featureColumns}
                compressed
              />
            </EuiAccordion>

            <EuiSpacer size="m" />

            <EuiAccordion
              id={`forecaster-operational-${forecaster.id}`}
              buttonContent={
                <strong>
                  <FormattedMessage
                    id="observability.alerting.forecasterDetailFlyout.operationalSettings"
                    defaultMessage="Operational settings"
                  />
                </strong>
              }
              initialIsOpen={true}
              paddingSize="m"
            >
              <EuiDescriptionList
                type="column"
                compressed
                listItems={[
                  {
                    title: i18n.translate(
                      'observability.alerting.forecasterDetailFlyout.operational.forecastInterval',
                      { defaultMessage: 'Forecast interval' }
                    ),
                    description: forecastIntervalDisplay,
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.forecasterDetailFlyout.operational.windowDelay',
                      { defaultMessage: 'Window delay' }
                    ),
                    description: windowDelayDisplay,
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.forecasterDetailFlyout.operational.horizon',
                      { defaultMessage: 'Horizon' }
                    ),
                    description: rawForecaster.horizon
                      ? String(rawForecaster.horizon)
                      : EMPTY_VALUE,
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.forecasterDetailFlyout.operational.history',
                      { defaultMessage: 'History' }
                    ),
                    description: rawForecaster.history
                      ? i18n.translate(
                          'observability.alerting.forecasterDetailFlyout.operational.historyIntervals',
                          {
                            defaultMessage: '{history} intervals',
                            values: { history: rawForecaster.history },
                          }
                        )
                      : EMPTY_VALUE,
                  },
                ]}
              />
            </EuiAccordion>

            <EuiSpacer size="m" />

            <EuiAccordion
              id={`forecaster-additional-${forecaster.id}`}
              buttonContent={
                <strong>
                  <FormattedMessage
                    id="observability.alerting.forecasterDetailFlyout.additionalSettings"
                    defaultMessage="Additional settings"
                  />
                </strong>
              }
              initialIsOpen={false}
              paddingSize="m"
            >
              <EuiDescriptionList
                type="column"
                compressed
                listItems={[
                  {
                    title: i18n.translate(
                      'observability.alerting.forecasterDetailFlyout.additional.categoryField',
                      { defaultMessage: 'Category field' }
                    ),
                    description: formatList(categoryField),
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.forecasterDetailFlyout.additional.shingleSize',
                      { defaultMessage: 'Shingle size' }
                    ),
                    description: String(shingleSize),
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.forecasterDetailFlyout.additional.imputationMethod',
                      { defaultMessage: 'Imputation method' }
                    ),
                    description: buildImputationDisplay(rawForecaster),
                  },
                ]}
              />
            </EuiAccordion>

            <EuiSpacer size="m" />

            <EuiAccordion
              id={`forecaster-job-${forecaster.id}`}
              buttonContent={
                <strong>
                  <FormattedMessage
                    id="observability.alerting.forecasterDetailFlyout.forecasterJob"
                    defaultMessage="Forecaster job"
                  />
                </strong>
              }
              initialIsOpen={false}
              paddingSize="m"
            >
              <EuiDescriptionList
                type="column"
                compressed
                listItems={[
                  {
                    title: i18n.translate(
                      'observability.alerting.forecasterDetailFlyout.job.realTimeJob',
                      { defaultMessage: 'Real-time job' }
                    ),
                    description:
                      typeof jobEnabled === 'boolean'
                        ? jobEnabled
                          ? enabledLabel()
                          : disabledLabel()
                        : EMPTY_VALUE,
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.forecasterDetailFlyout.job.currentState',
                      { defaultMessage: 'Current state' }
                    ),
                    description: currentState,
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.forecasterDetailFlyout.job.enabledTime',
                      { defaultMessage: 'Enabled time' }
                    ),
                    description: formatTimestamp(forecasterJob.enabled_time),
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.forecasterDetailFlyout.job.disabledTime',
                      { defaultMessage: 'Disabled time' }
                    ),
                    description: formatTimestamp(forecasterJob.disabled_time),
                  },
                ]}
              />
            </EuiAccordion>
          </>
        )}
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onClose}>
              <FormattedMessage
                id="observability.alerting.forecasterDetailFlyout.closeButton"
                defaultMessage="Close"
              />
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
