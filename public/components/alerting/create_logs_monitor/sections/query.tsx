/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Query section — the big one. Switches between PPL, DSL, and cluster-metrics
 * input modes based on the selected monitor type, plus inline preview with a
 * chart + mock results table. Section 2 of the Create Logs Monitor flyout.
 */
import React, { useState } from 'react';
import {
  EuiAccordion,
  EuiBasicTable,
  EuiBetaBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCallOut,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiIcon,
  EuiPanel,
  EuiPopover,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { EchartsRender } from '../../echarts_render';
import { LogsMonitorFormState } from '../create_logs_monitor_types';
import {
  BUCKET_AGGREGATION_OPTIONS,
  CLUSTER_METRICS_API_OPTIONS,
  DATASOURCE_OPTIONS,
  MOCK_TABLE_ROWS,
  PREVIEW_CHART_OPTION,
  SAMPLE_PPL_QUERIES,
} from '../create_logs_monitor_constants';

/** Section 2: Query */
export const QuerySection = React.memo<{
  form: LogsMonitorFormState;
  onUpdate: (patch: Partial<LogsMonitorFormState>) => void;
  showPreview: boolean;
  onRunPreview: () => void;
}>(({ form, onUpdate, showPreview, onRunPreview }) => {
  const [showDsPicker, setShowDsPicker] = useState(false);
  const [showQueryLibrary, setShowQueryLibrary] = useState(false);

  const isClusterMetrics = form.monitorType === 'cluster_metrics';
  const lineCount = form.query.split('\n').length;

  const handleQueryLibrarySelect = (query: string) => {
    onUpdate({ query });
    setShowQueryLibrary(false);
  };

  if (isClusterMetrics) {
    return (
      <EuiAccordion
        id="logs-query-section"
        buttonContent={
          <strong>
            {i18n.translate('observability.alerting.createLogsMonitor.query.clusterMetricsTitle', {
              defaultMessage: 'Cluster metrics',
            })}
          </strong>
        }
        initialIsOpen
        paddingSize="m"
      >
        <EuiFormRow
          label={i18n.translate('observability.alerting.createLogsMonitor.query.apiLabel', {
            defaultMessage: 'API',
          })}
          fullWidth
        >
          <EuiSelect
            options={CLUSTER_METRICS_API_OPTIONS}
            value={form.clusterMetricsApi}
            onChange={(e) => onUpdate({ clusterMetricsApi: e.target.value })}
            compressed
            fullWidth
            aria-label={i18n.translate(
              'observability.alerting.createLogsMonitor.query.clusterMetricsApiAriaLabel',
              { defaultMessage: 'Cluster metrics API' }
            )}
          />
        </EuiFormRow>
        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued">
          {i18n.translate(
            'observability.alerting.createLogsMonitor.query.clusterMetricsDescription',
            {
              defaultMessage:
                'The monitor will periodically call the selected API and evaluate the trigger condition against the response.',
            }
          )}
        </EuiText>
      </EuiAccordion>
    );
  }

  const isPPL = form.monitorType === 'query_level';

  return (
    <EuiAccordion
      id="logs-query-section"
      buttonContent={
        <strong>
          {i18n.translate('observability.alerting.createLogsMonitor.query.sectionTitle', {
            defaultMessage: 'Query',
          })}
        </strong>
      }
      initialIsOpen
      paddingSize="m"
      extraAction={
        <EuiButton
          size="s"
          onClick={onRunPreview}
          aria-label={i18n.translate(
            'observability.alerting.createLogsMonitor.query.runPreviewAriaLabel',
            { defaultMessage: 'Run preview' }
          )}
        >
          {i18n.translate('observability.alerting.createLogsMonitor.query.runPreviewButton', {
            defaultMessage: 'Run preview',
          })}
        </EuiButton>
      }
    >
      {/* Toolbar + editor in a single bordered panel */}
      <EuiPanel paddingSize="s" hasBorder style={{ borderRadius: 4 }}>
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
          <EuiFlexItem grow={false}>
            <EuiBetaBadge
              label={isPPL ? 'PPL' : 'DSL'}
              tooltipContent={
                isPPL
                  ? i18n.translate('observability.alerting.createLogsMonitor.query.pplTooltip', {
                      defaultMessage: 'Piped Processing Language',
                    })
                  : i18n.translate('observability.alerting.createLogsMonitor.query.dslTooltip', {
                      defaultMessage: 'OpenSearch Query DSL',
                    })
              }
              size="s"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiPopover
              button={
                <EuiButtonEmpty
                  size="xs"
                  iconType="database"
                  iconSide="left"
                  onClick={() => setShowDsPicker(!showDsPicker)}
                  aria-label={i18n.translate(
                    'observability.alerting.createLogsMonitor.query.selectDatasourceAriaLabel',
                    { defaultMessage: 'Select data source' }
                  )}
                >
                  <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                    <EuiFlexItem grow={false}>{form.selectedDatasource}</EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiIcon type="arrowDown" size="s" />
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiButtonEmpty>
              }
              isOpen={showDsPicker}
              closePopover={() => setShowDsPicker(false)}
              panelPaddingSize="s"
            >
              {DATASOURCE_OPTIONS.map((ds) => (
                <EuiButtonEmpty
                  key={ds}
                  size="xs"
                  onClick={() => {
                    onUpdate({ selectedDatasource: ds });
                    setShowDsPicker(false);
                  }}
                  style={{ display: 'block', width: '100%', textAlign: 'left' }}
                >
                  {ds}
                </EuiButtonEmpty>
              ))}
            </EuiPopover>
          </EuiFlexItem>
          {isPPL && (
            <EuiFlexItem grow={false}>
              <EuiPopover
                button={
                  <EuiButtonEmpty
                    size="xs"
                    iconType="addBookmark"
                    iconSide="left"
                    onClick={() => setShowQueryLibrary(!showQueryLibrary)}
                    aria-label={i18n.translate(
                      'observability.alerting.createLogsMonitor.query.queryLibraryAriaLabel',
                      { defaultMessage: 'Query library' }
                    )}
                  >
                    <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                      <EuiFlexItem grow={false}>
                        {i18n.translate(
                          'observability.alerting.createLogsMonitor.query.queryLibraryLabel',
                          { defaultMessage: 'Query library' }
                        )}
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiIcon type="arrowDown" size="s" />
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiButtonEmpty>
                }
                isOpen={showQueryLibrary}
                closePopover={() => setShowQueryLibrary(false)}
                panelPaddingSize="s"
              >
                {SAMPLE_PPL_QUERIES.map((sq, i) => (
                  <EuiButtonEmpty
                    key={i}
                    size="xs"
                    onClick={() => handleQueryLibrarySelect(sq.query)}
                    style={{ display: 'block', width: '100%', textAlign: 'left' }}
                  >
                    {sq.label}
                  </EuiButtonEmpty>
                ))}
              </EuiPopover>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>

        <EuiSpacer size="s" />

        {/* Code editor with line numbers */}
        <div style={{ position: 'relative' }}>
          <div
            style={{
              display: 'flex',
              border: '1px solid #D3DAE6',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            {/* Line number gutter */}
            <div
              aria-hidden="true"
              style={{
                padding: '8px 0',
                minWidth: 36,
                textAlign: 'right',
                fontFamily: 'monospace',
                fontSize: 13,
                lineHeight: '20px',
                color: '#98A2B3',
                backgroundColor: '#F5F7FA',
                borderRight: '1px solid #D3DAE6',
                userSelect: 'none',
                flexShrink: 0,
              }}
            >
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i} style={{ paddingRight: 8 }}>
                  {i + 1}
                </div>
              ))}
            </div>
            {/* Textarea */}
            <textarea
              value={form.query}
              onChange={(e) => onUpdate({ query: e.target.value })}
              rows={Math.max(2, lineCount)}
              style={{
                flex: 1,
                fontFamily: 'monospace',
                fontSize: 13,
                lineHeight: '20px',
                padding: '8px 12px',
                border: 'none',
                outline: 'none',
                resize: 'none',
                backgroundColor: 'transparent',
              }}
              aria-label={
                isPPL
                  ? i18n.translate(
                      'observability.alerting.createLogsMonitor.query.editorAriaLabelPpl',
                      { defaultMessage: 'PPL query editor' }
                    )
                  : i18n.translate(
                      'observability.alerting.createLogsMonitor.query.editorAriaLabelDsl',
                      { defaultMessage: 'DSL query editor' }
                    )
              }
            />
          </div>
          <div
            style={{ position: 'absolute', top: 4, right: 4, zIndex: 2, display: 'flex', gap: 2 }}
          >
            <EuiToolTip
              content={i18n.translate(
                'observability.alerting.createLogsMonitor.query.copyQueryTooltip',
                { defaultMessage: 'Copy query' }
              )}
            >
              <EuiButtonIcon
                iconType="copy"
                size="s"
                color="subdued"
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(form.query);
                  } catch (_) {
                    /* clipboard unavailable */
                  }
                }}
                aria-label={i18n.translate(
                  'observability.alerting.createLogsMonitor.query.copyQueryAriaLabel',
                  { defaultMessage: 'Copy query' }
                )}
              />
            </EuiToolTip>
          </div>
        </div>
      </EuiPanel>

      {/* Bucket level specific fields */}
      {form.monitorType === 'bucket_level' && (
        <>
          <EuiSpacer size="m" />
          <EuiFlexGroup gutterSize="m">
            <EuiFlexItem>
              <EuiFormRow
                label={i18n.translate(
                  'observability.alerting.createLogsMonitor.query.bucketFieldLabel',
                  { defaultMessage: 'Bucket field' }
                )}
                display="rowCompressed"
              >
                <EuiFieldText
                  placeholder={i18n.translate(
                    'observability.alerting.createLogsMonitor.query.bucketFieldPlaceholder',
                    { defaultMessage: 'e.g. host.keyword' }
                  )}
                  value={form.bucketField}
                  onChange={(e) => onUpdate({ bucketField: e.target.value })}
                  compressed
                  aria-label={i18n.translate(
                    'observability.alerting.createLogsMonitor.query.bucketFieldAriaLabel',
                    { defaultMessage: 'Bucket field' }
                  )}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiFormRow
                label={i18n.translate(
                  'observability.alerting.createLogsMonitor.query.aggregationLabel',
                  { defaultMessage: 'Aggregation' }
                )}
                display="rowCompressed"
              >
                <EuiSelect
                  options={BUCKET_AGGREGATION_OPTIONS}
                  value={form.bucketAggregation}
                  onChange={(e) => onUpdate({ bucketAggregation: e.target.value })}
                  compressed
                  aria-label={i18n.translate(
                    'observability.alerting.createLogsMonitor.query.bucketAggregationAriaLabel',
                    { defaultMessage: 'Bucket aggregation' }
                  )}
                />
              </EuiFormRow>
            </EuiFlexItem>
          </EuiFlexGroup>
        </>
      )}

      {/* Document level specific fields */}
      {form.monitorType === 'document_level' && (
        <>
          <EuiSpacer size="m" />
          <EuiFlexGroup gutterSize="m">
            <EuiFlexItem>
              <EuiFormRow
                label={i18n.translate(
                  'observability.alerting.createLogsMonitor.query.indicesLabel',
                  { defaultMessage: 'Indices' }
                )}
                display="rowCompressed"
              >
                <EuiFieldText
                  placeholder={i18n.translate(
                    'observability.alerting.createLogsMonitor.query.indicesPlaceholder',
                    { defaultMessage: 'e.g. logs-*, application-logs' }
                  )}
                  value={form.docLevelIndices}
                  onChange={(e) => onUpdate({ docLevelIndices: e.target.value })}
                  compressed
                  aria-label={i18n.translate(
                    'observability.alerting.createLogsMonitor.query.docLevelIndicesAriaLabel',
                    { defaultMessage: 'Document level indices' }
                  )}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiFormRow
                label={i18n.translate('observability.alerting.createLogsMonitor.query.tagsLabel', {
                  defaultMessage: 'Tags',
                })}
                display="rowCompressed"
                helpText={i18n.translate(
                  'observability.alerting.createLogsMonitor.query.tagsHelpText',
                  { defaultMessage: 'Comma-separated tags for document-level queries' }
                )}
              >
                <EuiFieldText
                  placeholder={i18n.translate(
                    'observability.alerting.createLogsMonitor.query.tagsPlaceholder',
                    { defaultMessage: 'e.g. error, critical' }
                  )}
                  value={form.docLevelTags}
                  onChange={(e) => onUpdate({ docLevelTags: e.target.value })}
                  compressed
                  aria-label={i18n.translate(
                    'observability.alerting.createLogsMonitor.query.docLevelTagsAriaLabel',
                    { defaultMessage: 'Document level tags' }
                  )}
                />
              </EuiFormRow>
            </EuiFlexItem>
          </EuiFlexGroup>
        </>
      )}

      {/* Preview Results */}
      {showPreview && (
        <>
          <EuiSpacer size="m" />
          <EuiAccordion
            id="logs-preview-results"
            buttonContent={
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}>
                  <strong>
                    {i18n.translate('observability.alerting.createLogsMonitor.query.resultsTitle', {
                      defaultMessage: 'Results (34)',
                    })}
                  </strong>
                </EuiFlexItem>
              </EuiFlexGroup>
            }
            initialIsOpen
            paddingSize="s"
          >
            <EuiCallOut size="s" color="warning" iconType="iInCircle">
              <EuiText size="xs">
                {i18n.translate(
                  'observability.alerting.createLogsMonitor.query.sampleDataCallout',
                  { defaultMessage: 'Sample data — run the monitor to see real results' }
                )}
              </EuiText>
            </EuiCallOut>
            <EuiSpacer size="s" />
            <EuiText size="xs" color="subdued">
              EVENTS_LAST_HOUR_v2
            </EuiText>
            <EuiSpacer size="s" />
            <EchartsRender spec={PREVIEW_CHART_OPTION} height={200} />
            <EuiSpacer size="s" />
            <EuiBasicTable
              items={MOCK_TABLE_ROWS}
              columns={[
                {
                  field: 'date',
                  name: i18n.translate(
                    'observability.alerting.createLogsMonitor.query.tableColumnDate',
                    { defaultMessage: 'Date' }
                  ),
                },
                {
                  field: 'eventType',
                  name: i18n.translate(
                    'observability.alerting.createLogsMonitor.query.tableColumnEventType',
                    { defaultMessage: 'Event type' }
                  ),
                },
                {
                  field: 'status',
                  name: i18n.translate(
                    'observability.alerting.createLogsMonitor.query.tableColumnStatus',
                    { defaultMessage: 'Status' }
                  ),
                },
              ]}
              tableLayout="auto"
            />
          </EuiAccordion>
        </>
      )}
    </EuiAccordion>
  );
});
