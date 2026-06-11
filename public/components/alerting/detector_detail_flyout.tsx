/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Detector Detail Flyout — read-only detector configuration shown from the
 * Rules table. Mirrors the monitor detail flyout shell while
 * grouping detector content like the AD detector configuration page.
 */
import React from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  EuiBasicTableColumn,
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
  EuiButtonEmpty,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import type { ADDetector, UnifiedRuleSummary } from '../../../common/types/alerting';
import { useRuleDetail } from './hooks/use_rule_detail';
import { HEALTH_COLORS, SEVERITY_COLORS, STATUS_COLORS } from './shared_constants';

export interface DetectorDetailFlyoutProps {
  detector: UnifiedRuleSummary;
  onClose: () => void;
}

interface FeatureRow {
  name: string;
  definition: React.ReactNode;
  state: React.ReactNode;
}

const EMPTY_VALUE = '—';

const enabledLabel = () =>
  i18n.translate('observability.alerting.detectorDetailFlyout.enabledLabel', {
    defaultMessage: 'Enabled',
  });

const disabledLabel = () =>
  i18n.translate('observability.alerting.detectorDetailFlyout.disabledLabel', {
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

const getDetectorJob = (detector: ADDetector): Record<string, unknown> =>
  asRecord(detector.anomaly_detector_job);

const getUiMetadata = (detector: ADDetector): Record<string, unknown> =>
  asRecord(detector.ui_metadata || detector.uiMetadata);

const getFeatureMetadata = (detector: ADDetector, featureName: string): Record<string, unknown> => {
  const uiMetadata = getUiMetadata(detector);
  const features = asRecord(uiMetadata.features);
  return asRecord(features[featureName]);
};

const detectorFromSummary = (summary: UnifiedRuleSummary): ADDetector => ({
  id: summary.id,
  name: summary.name,
  description: summary.annotations.description,
  detector_type: summary.labels.detector_type || summary.group,
  indices: summary.labels.indices ? summary.labels.indices.split(',') : undefined,
  time_field: summary.labels.time_field,
  last_update_time: Date.parse(summary.lastModified),
  detection_interval: undefined,
  window_delay: undefined,
  feature_attributes: summary.annotations.features
    ? summary.annotations.features.split(',').map((name) => ({
        feature_name: name.trim(),
        feature_enabled: true,
      }))
    : [],
});

const buildFeatureRows = (detector: ADDetector): FeatureRow[] => {
  const features = asArray(detector.feature_attributes || detector.featureAttributes);
  return features.map((featureValue, index) => {
    const feature = asRecord(featureValue);
    const name =
      stringValue(getField(feature, 'feature_name', 'featureName'), '') ||
      stringValue(
        getField(feature, 'feature_id', 'featureId'),
        i18n.translate('observability.alerting.detectorDetailFlyout.fallbackFeatureName', {
          defaultMessage: 'Feature {index}',
          values: { index: index + 1 },
        })
      );
    const enabled = getField(feature, 'feature_enabled', 'featureEnabled') !== false;
    const metadata = getFeatureMetadata(detector, name);
    const aggregationOf = stringValue(metadata.aggregationOf, '');
    const aggregationBy = stringValue(metadata.aggregationBy, '');
    const aggregationQuery = getField(feature, 'aggregation_query', 'aggregationQuery');

    let definition: React.ReactNode = EMPTY_VALUE;
    if (aggregationOf || aggregationBy) {
      definition = (
        <EuiText size="s">
          <p>
            <FormattedMessage
              id="observability.alerting.detectorDetailFlyout.featureDefinition"
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

const buildFilterDisplay = (detector: ADDetector): string => {
  const filterQuery = detector.filter_query || detector.filterQuery || {};
  const record = asRecord(filterQuery);
  if (Object.keys(record).length === 0) return EMPTY_VALUE;
  return JSON.stringify(record, null, 2);
};

const buildImputationDisplay = (detector: ADDetector): string => {
  const imputation = asRecord(detector.imputationOption || detector.imputation_option);
  const method = stringValue(imputation.method || imputation.imputationMethod, '');
  if (!method) return EMPTY_VALUE;
  const defaultFill = asArray(imputation.defaultFill || imputation.default_fill);
  if (defaultFill.length === 0) return method;
  return `${method} (${defaultFill.map((entry) => JSON.stringify(entry)).join(', ')})`;
};

export const DetectorDetailFlyout: React.FC<DetectorDetailFlyoutProps> = ({
  detector,
  onClose,
}) => {
  const { data: detail, isLoading, error } = useRuleDetail(detector.datasourceId, detector.id);
  const rawDetector = (detail?.raw as ADDetector | undefined) || detectorFromSummary(detector);
  const description =
    detail?.description || rawDetector.description || detector.annotations.description || '';
  const detectorType = stringValue(
    rawDetector.detector_type || detector.group,
    i18n.translate('observability.alerting.detectorDetailFlyout.detectorTypeFallback', {
      defaultMessage: 'Detector',
    })
  );
  const detectorJob = getDetectorJob(rawDetector);
  const featureRows = buildFeatureRows(rawDetector);
  const filterDisplay = buildFilterDisplay(rawDetector);
  const resultIndex = stringValue(rawDetector.result_index || rawDetector.resultIndex);
  const categoryField = formatList(rawDetector.category_field || rawDetector.categoryField);
  const shingleSize = rawDetector.shingle_size || rawDetector.shingleSize || EMPTY_VALUE;
  const jobEnabled = detectorJob.enabled;
  const detectorIntervalDisplay = formatPeriod(rawDetector.detection_interval);
  const frequencyDisplay = formatPeriod(rawDetector.frequency);
  const realTimeJobDisplay =
    typeof jobEnabled === 'boolean' ? (jobEnabled ? enabledLabel() : disabledLabel()) : EMPTY_VALUE;

  const featureColumns: Array<EuiBasicTableColumn<FeatureRow>> = [
    {
      field: 'name',
      name: i18n.translate('observability.alerting.detectorDetailFlyout.features.name', {
        defaultMessage: 'Feature name',
      }),
      width: '28%',
      sortable: true,
    },
    {
      field: 'definition',
      name: i18n.translate('observability.alerting.detectorDetailFlyout.features.definition', {
        defaultMessage: 'Feature definition',
      }),
      render: (definition: React.ReactNode) => definition,
    },
    {
      field: 'state',
      name: i18n.translate('observability.alerting.detectorDetailFlyout.features.state', {
        defaultMessage: 'Feature state',
      }),
      width: '120px',
      render: (state: React.ReactNode) => state,
    },
  ];

  return (
    <EuiFlyout onClose={onClose} size="m" ownFocus aria-labelledby="detectorDetailTitle">
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem>
            <EuiTitle size="m">
              <h2 id="detectorDetailTitle">{detector.name}</h2>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="xs" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiBadge color="hollow">
                  <FormattedMessage
                    id="observability.alerting.detectorDetailFlyout.detectorBadge"
                    defaultMessage="Detector"
                  />
                </EuiBadge>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color={STATUS_COLORS[detector.status]}>{detector.status}</EuiBadge>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color={SEVERITY_COLORS[detector.severity]}>{detector.severity}</EuiBadge>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiHealth color={HEALTH_COLORS[detector.healthStatus]}>
                  {detector.healthStatus}
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
                    'observability.alerting.detectorDetailFlyout.detailLoadError.title',
                    {
                      defaultMessage: 'Some detector details could not be loaded',
                    }
                  )}
                  data-test-subj="alertManagerDetectorDetailLoadError"
                >
                  <p>
                    <FormattedMessage
                      id="observability.alerting.detectorDetailFlyout.detailLoadError.body"
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
              id={`detector-settings-${detector.id}`}
              buttonContent={
                <strong>
                  <FormattedMessage
                    id="observability.alerting.detectorDetailFlyout.detectorSettings"
                    defaultMessage="Detector settings"
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
                      'observability.alerting.detectorDetailFlyout.settings.name',
                      { defaultMessage: 'Name' }
                    ),
                    description: detector.name,
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.detectorDetailFlyout.settings.detectorType',
                      { defaultMessage: 'Detector type' }
                    ),
                    description: detectorType,
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.detectorDetailFlyout.settings.dataSourceIndex',
                      { defaultMessage: 'Data source index' }
                    ),
                    description: formatList(rawDetector.indices),
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.detectorDetailFlyout.settings.id',
                      {
                        defaultMessage: 'ID',
                      }
                    ),
                    description: detector.id,
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.detectorDetailFlyout.settings.timestamp',
                      { defaultMessage: 'Timestamp' }
                    ),
                    description: stringValue(rawDetector.time_field),
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.detectorDetailFlyout.settings.lastUpdated',
                      { defaultMessage: 'Last updated' }
                    ),
                    description: formatTimestamp(rawDetector.last_update_time),
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.detectorDetailFlyout.settings.customResultIndex',
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
                      id="observability.alerting.detectorDetailFlyout.dataFilter"
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
              id={`detector-features-${detector.id}`}
              buttonContent={
                <strong>
                  <FormattedMessage
                    id="observability.alerting.detectorDetailFlyout.modelConfiguration"
                    defaultMessage="Model configuration"
                  />
                </strong>
              }
              initialIsOpen={true}
              paddingSize="m"
            >
              <EuiBasicTable
                data-test-subj="alertManagerDetectorFeatureTable"
                items={featureRows}
                columns={featureColumns}
                compressed
              />
            </EuiAccordion>

            <EuiSpacer size="m" />

            <EuiAccordion
              id={`detector-operational-${detector.id}`}
              buttonContent={
                <strong>
                  <FormattedMessage
                    id="observability.alerting.detectorDetailFlyout.operationalSettings"
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
                      'observability.alerting.detectorDetailFlyout.operational.detectorInterval',
                      { defaultMessage: 'Detector interval' }
                    ),
                    description: detectorIntervalDisplay,
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.detectorDetailFlyout.operational.windowDelay',
                      { defaultMessage: 'Window delay' }
                    ),
                    description: formatPeriod(rawDetector.window_delay),
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.detectorDetailFlyout.operational.frequency',
                      { defaultMessage: 'Frequency' }
                    ),
                    description:
                      frequencyDisplay === EMPTY_VALUE ? detectorIntervalDisplay : frequencyDisplay,
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.detectorDetailFlyout.operational.history',
                      { defaultMessage: 'History' }
                    ),
                    description: rawDetector.history
                      ? i18n.translate(
                          'observability.alerting.detectorDetailFlyout.operational.historyIntervals',
                          {
                            defaultMessage: '{history} intervals',
                            values: { history: rawDetector.history },
                          }
                        )
                      : EMPTY_VALUE,
                  },
                ]}
              />
            </EuiAccordion>

            <EuiSpacer size="m" />

            <EuiAccordion
              id={`detector-additional-${detector.id}`}
              buttonContent={
                <strong>
                  <FormattedMessage
                    id="observability.alerting.detectorDetailFlyout.additionalSettings"
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
                      'observability.alerting.detectorDetailFlyout.additional.categoryField',
                      { defaultMessage: 'Category field' }
                    ),
                    description: categoryField,
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.detectorDetailFlyout.additional.shingleSize',
                      { defaultMessage: 'Shingle size' }
                    ),
                    description: String(shingleSize),
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.detectorDetailFlyout.additional.imputationMethod',
                      { defaultMessage: 'Imputation method' }
                    ),
                    description: buildImputationDisplay(rawDetector),
                  },
                ]}
              />
            </EuiAccordion>

            <EuiSpacer size="m" />

            <EuiAccordion
              id={`detector-job-${detector.id}`}
              buttonContent={
                <strong>
                  <FormattedMessage
                    id="observability.alerting.detectorDetailFlyout.detectorJob"
                    defaultMessage="Detector job"
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
                      'observability.alerting.detectorDetailFlyout.job.realTimeJob',
                      { defaultMessage: 'Real-time job' }
                    ),
                    description: realTimeJobDisplay,
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.detectorDetailFlyout.job.enabledTime',
                      { defaultMessage: 'Enabled time' }
                    ),
                    description: formatTimestamp(detectorJob.enabled_time),
                  },
                  {
                    title: i18n.translate(
                      'observability.alerting.detectorDetailFlyout.job.disabledTime',
                      { defaultMessage: 'Disabled time' }
                    ),
                    description: formatTimestamp(detectorJob.disabled_time),
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
                id="observability.alerting.detectorDetailFlyout.closeButton"
                defaultMessage="Close"
              />
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
