/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SLO detail metadata panel.
 *
 * Surfaces everything the user configured so the detail page answers
 * "what will this SLO alert on, and under whose ownership?" without opening
 * Edit. Progressive disclosure:
 *   - Always visible: labels, annotations, burn-rate tiers, budget-warning
 *     thresholds
 *   - Advanced accordion (collapsed by default): supplemental alarms,
 *     exclusion windows, Prometheus provisioning records
 *
 * Labels render with a `slo_label_<key>` hint so operators know how the
 * label propagates onto generated rules; annotations render without a hint
 * since they're metadata-only and never propagate onto rules.
 */

import React from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiIcon,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import type {
  BudgetWarningThreshold,
  BurnRateConfig,
  ExclusionWindow,
  PrometheusProvisioning,
  SloAlarmConfig,
  SloDocument,
} from '../../../../../common/slo/slo_types';

export interface SloMetadataPanelProps {
  slo: SloDocument;
  /**
   * When true, render without the outer EuiPanel wrapper and flatten the
   * inner "Advanced details" accordion into sequential sections. Used when
   * the panel is embedded inside another accordion on the detail page, so
   * we don't end up with panel-in-accordion-in-panel nesting.
   */
  inline?: boolean;
}

interface LabelRow {
  key: string;
  raw: string;
  propagatedAs: string;
}

function stringifyLabelValue(value: string | string[]): string {
  return Array.isArray(value) ? value.join(', ') : value;
}

function labelRows(labels: Record<string, string | string[]>): LabelRow[] {
  return Object.entries(labels).map(([key, value]) => ({
    key,
    raw: stringifyLabelValue(value),
    propagatedAs: `slo_label_${key}`,
  }));
}

function annotationRows(
  annotations: Record<string, string>
): Array<{ key: string; value: string }> {
  return Object.entries(annotations).map(([key, value]) => ({ key, value }));
}

const LABEL_COLUMNS: Array<EuiBasicTableColumn<LabelRow>> = [
  {
    field: 'key',
    name: i18n.translate('observability.apm.slo.metadataPanel.labels.column.key', {
      defaultMessage: 'Key',
    }),
    width: '25%',
  },
  {
    field: 'raw',
    name: i18n.translate('observability.apm.slo.metadataPanel.labels.column.value', {
      defaultMessage: 'Value',
    }),
    width: '40%',
  },
  {
    field: 'propagatedAs',
    name: i18n.translate('observability.apm.slo.metadataPanel.labels.column.propagatesAs', {
      defaultMessage: 'Propagates as',
    }),
    width: '35%',
    render: (value: string) => (
      <EuiToolTip
        content={i18n.translate('observability.apm.slo.metadataPanel.labels.propagatesTooltip', {
          defaultMessage: 'User labels are re-emitted on every generated rule under this key.',
        })}
      >
        <EuiBadge color="hollow" data-test-subj="slosDetailMetadataLabelPropagation">
          {value}
        </EuiBadge>
      </EuiToolTip>
    ),
  },
];

const ANNOTATION_COLUMNS: Array<EuiBasicTableColumn<{ key: string; value: string }>> = [
  {
    field: 'key',
    name: i18n.translate('observability.apm.slo.metadataPanel.annotations.column.key', {
      defaultMessage: 'Key',
    }),
    width: '30%',
  },
  {
    field: 'value',
    name: i18n.translate('observability.apm.slo.metadataPanel.annotations.column.value', {
      defaultMessage: 'Value',
    }),
    width: '70%',
  },
];

const BURN_RATE_COLUMNS: Array<EuiBasicTableColumn<BurnRateConfig>> = [
  {
    field: 'severity',
    name: i18n.translate('observability.apm.slo.metadataPanel.burnRates.column.severity', {
      defaultMessage: 'Severity',
    }),
    width: '20%',
    render: (severity: string, row: BurnRateConfig) => (
      <EuiHealth
        color={row.createAlarm ? 'danger' : 'default'}
        data-test-subj="slosDetailMetadataBurnRateSeverity"
      >
        {severity}
      </EuiHealth>
    ),
  },
  {
    field: 'shortWindow',
    name: i18n.translate('observability.apm.slo.metadataPanel.burnRates.column.short', {
      defaultMessage: 'Short',
    }),
    width: '15%',
  },
  {
    field: 'longWindow',
    name: i18n.translate('observability.apm.slo.metadataPanel.burnRates.column.long', {
      defaultMessage: 'Long',
    }),
    width: '15%',
  },
  {
    field: 'burnRateMultiplier',
    name: i18n.translate('observability.apm.slo.metadataPanel.burnRates.column.burn', {
      defaultMessage: 'Burn',
    }),
    width: '15%',
    render: (n: number) => `${n.toFixed(1)}x`,
  },
  {
    field: 'forDuration',
    name: i18n.translate('observability.apm.slo.metadataPanel.burnRates.column.for', {
      defaultMessage: 'For',
    }),
    width: '15%',
  },
  {
    field: 'createAlarm',
    name: i18n.translate('observability.apm.slo.metadataPanel.burnRates.column.alarm', {
      defaultMessage: 'Alarm',
    }),
    width: '20%',
    render: (on: boolean) =>
      on ? (
        <EuiBadge color="success">
          {i18n.translate('observability.apm.slo.metadataPanel.burnRates.alarmEnabled', {
            defaultMessage: 'enabled',
          })}
        </EuiBadge>
      ) : (
        <EuiBadge color="hollow">
          {i18n.translate('observability.apm.slo.metadataPanel.burnRates.alarmRecordingOnly', {
            defaultMessage: 'recording only',
          })}
        </EuiBadge>
      ),
  },
];

const BUDGET_WARNING_COLUMNS: Array<EuiBasicTableColumn<BudgetWarningThreshold>> = [
  {
    field: 'severity',
    name: i18n.translate('observability.apm.slo.metadataPanel.budgetWarnings.column.severity', {
      defaultMessage: 'Severity',
    }),
    render: (severity: string) => <EuiBadge color="warning">{severity}</EuiBadge>,
  },
  {
    field: 'threshold',
    name: i18n.translate(
      'observability.apm.slo.metadataPanel.budgetWarnings.column.remainingThreshold',
      { defaultMessage: 'Remaining threshold' }
    ),
    render: (t: number) => `${(t * 100).toFixed(0)}%`,
  },
];

function rowPropsForDisabledBurnRate(row: BurnRateConfig): { style?: React.CSSProperties } {
  // Disabled tiers (createAlarm: false) still emit recording rules — dim them
  // so operators can see "this tier exists but won't page" at a glance.
  return row.createAlarm ? {} : { style: { opacity: 0.55 } };
}

interface AlarmChecklistProps {
  alarms: SloAlarmConfig;
}

const AlarmChecklist: React.FC<AlarmChecklistProps> = ({ alarms }) => {
  // Ordered by default-on policy: budgetWarning defaults ON, everything else
  // defaults OFF. Keeping this order means the top of the list shows the
  // user's deliberate opt-outs.
  const rows: Array<{ key: string; label: string; enabled: boolean; detail?: string }> = [
    {
      key: 'budgetWarning',
      label: i18n.translate('observability.apm.slo.metadataPanel.alarm.budgetWarning', {
        defaultMessage: 'Budget warning',
      }),
      enabled: alarms.budgetWarning.enabled,
    },
    {
      key: 'sliHealth',
      label: i18n.translate('observability.apm.slo.metadataPanel.alarm.sliHealth', {
        defaultMessage: 'SLI health',
      }),
      enabled: alarms.sliHealth.enabled,
    },
    {
      key: 'attainmentBreach',
      label: i18n.translate('observability.apm.slo.metadataPanel.alarm.attainmentBreach', {
        defaultMessage: 'Attainment breach',
      }),
      enabled: alarms.attainmentBreach.enabled,
    },
    {
      key: 'noData',
      label: i18n.translate('observability.apm.slo.metadataPanel.alarm.noData', {
        defaultMessage: 'No data',
      }),
      enabled: alarms.noData.enabled,
      detail: alarms.noData.enabled
        ? i18n.translate('observability.apm.slo.metadataPanel.alarm.noDataDetail', {
            defaultMessage: 'for {duration}',
            values: { duration: alarms.noData.forDuration },
          })
        : undefined,
    },
    {
      key: 'resolved',
      label: i18n.translate('observability.apm.slo.metadataPanel.alarm.resolved', {
        defaultMessage: 'Resolved',
      }),
      enabled: alarms.resolved.enabled,
    },
  ];

  return (
    <EuiFlexGroup wrap gutterSize="s" data-test-subj="slosDetailMetadataAlarms" responsive={false}>
      {rows.map((r) => (
        <EuiFlexItem grow={false} key={r.key}>
          <EuiBadge
            color={r.enabled ? 'success' : 'hollow'}
            iconType={r.enabled ? 'check' : 'cross'}
            data-test-subj={`slosDetailMetadataAlarms-${r.key}`}
          >
            {r.label}
            {r.detail ? ` · ${r.detail}` : ''}
          </EuiBadge>
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  );
};

function describeSchedule(w: ExclusionWindow): string {
  if (w.schedule.type === 'cron') {
    return i18n.translate('observability.apm.slo.metadataPanel.exclusion.cronSchedule', {
      defaultMessage: 'cron "{expression}" · {duration} · {timezone}',
      values: {
        expression: w.schedule.expression,
        duration: w.schedule.duration,
        timezone: w.schedule.timezone,
      },
    });
  }
  return i18n.translate('observability.apm.slo.metadataPanel.exclusion.oneoffSchedule', {
    defaultMessage: 'one-off {start} → {end}',
    values: { start: w.schedule.start, end: w.schedule.end },
  });
}

interface ExclusionWindowTableProps {
  windows: ExclusionWindow[];
}

const ExclusionWindowTable: React.FC<ExclusionWindowTableProps> = ({ windows }) => {
  const columns: Array<EuiBasicTableColumn<ExclusionWindow>> = [
    {
      field: 'name',
      name: i18n.translate('observability.apm.slo.metadataPanel.exclusion.column.name', {
        defaultMessage: 'Name',
      }),
      width: '20%',
    },
    {
      name: i18n.translate('observability.apm.slo.metadataPanel.exclusion.column.schedule', {
        defaultMessage: 'Schedule',
      }),
      width: '45%',
      render: (row: ExclusionWindow) => <code>{describeSchedule(row)}</code>,
    },
    {
      field: 'reason',
      name: i18n.translate('observability.apm.slo.metadataPanel.exclusion.column.reason', {
        defaultMessage: 'Reason',
      }),
      width: '25%',
      render: (r?: string) => r ?? '—',
    },
    {
      name: i18n.translate('observability.apm.slo.metadataPanel.exclusion.column.status', {
        defaultMessage: 'Status',
      }),
      width: '10%',
      render: () => (
        <EuiToolTip
          content={i18n.translate('observability.apm.slo.metadataPanel.exclusion.deferredTooltip', {
            defaultMessage: 'Exclusion windows are persisted but enforcement is deferred post-GA.',
          })}
        >
          <EuiBadge color="hollow" data-test-subj="slosDetailMetadataExclusionDeferred">
            {i18n.translate('observability.apm.slo.metadataPanel.exclusion.deferredBadge', {
              defaultMessage: 'deferred',
            })}
          </EuiBadge>
        </EuiToolTip>
      ),
    },
  ];
  return (
    <EuiBasicTable<ExclusionWindow>
      tableCaption={i18n.translate('observability.apm.slo.metadataPanel.exclusion.tableCaption', {
        defaultMessage: 'Exclusion windows',
      })}
      items={windows}
      columns={columns}
      data-test-subj="slosDetailMetadataExclusionWindows"
    />
  );
};

interface ProvisioningBlockProps {
  provisioning: PrometheusProvisioning;
}

const ProvisioningBlock: React.FC<ProvisioningBlockProps> = ({ provisioning }) => {
  const uniqueRecordingGroups = provisioning.recordingFingerprints
    ? new Set(Object.values(provisioning.recordingFingerprints)).size
    : 0;
  return (
    <EuiDescriptionList
      compressed
      type="column"
      listItems={[
        {
          title: i18n.translate('observability.apm.slo.metadataPanel.provisioning.alertGroup', {
            defaultMessage: 'Alert group',
          }),
          description: provisioning.alertGroupName ?? '—',
        },
        {
          title: i18n.translate('observability.apm.slo.metadataPanel.provisioning.namespace', {
            defaultMessage: 'Namespace',
          }),
          description: provisioning.rulerNamespace,
        },
        {
          title: i18n.translate(
            'observability.apm.slo.metadataPanel.provisioning.recordingGroups',
            { defaultMessage: 'Recording groups' }
          ),
          description: i18n.translate(
            'observability.apm.slo.metadataPanel.provisioning.recordingGroupsValue',
            {
              defaultMessage: '{count} shared',
              values: { count: uniqueRecordingGroups },
            }
          ),
        },
      ]}
    />
  );
};

export const SloMetadataPanel: React.FC<SloMetadataPanelProps> = ({ slo, inline = false }) => {
  const labels = labelRows(slo.spec.labels ?? {});
  const annotations = annotationRows(slo.spec.annotations ?? {});
  const burnRates = slo.spec.alerting.strategy === 'mwmbr' ? slo.spec.alerting.burnRates : [];
  const budgetWarnings = slo.spec.budgetWarningThresholds ?? [];
  const exclusionWindows = slo.spec.exclusionWindows ?? [];
  const prov = slo.status.provisioning.backend === 'prometheus' ? slo.status.provisioning : null;

  const body = (
    <>
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiText size="m">
            <h4>
              {i18n.translate('observability.apm.slo.metadataPanel.labels.heading', {
                defaultMessage: 'Labels',
              })}
            </h4>
          </EuiText>
          <EuiText size="xs" color="subdued">
            {i18n.translate('observability.apm.slo.metadataPanel.labels.descriptionPrefix', {
              defaultMessage: 'Propagated onto every generated rule as ',
            })}
            <code>slo_label_&lt;key&gt;</code>
            {i18n.translate('observability.apm.slo.metadataPanel.labels.descriptionSuffix', {
              defaultMessage: '.',
            })}
          </EuiText>
          <EuiSpacer size="s" />
          {labels.length === 0 ? (
            <EuiText size="s" color="subdued" data-test-subj="slosDetailMetadataLabelsEmpty">
              {i18n.translate('observability.apm.slo.metadataPanel.labels.empty', {
                defaultMessage: 'No labels configured.',
              })}
            </EuiText>
          ) : (
            <EuiBasicTable<LabelRow>
              tableCaption={i18n.translate(
                'observability.apm.slo.metadataPanel.labels.tableCaption',
                { defaultMessage: 'Labels' }
              )}
              items={labels}
              columns={LABEL_COLUMNS}
              data-test-subj="slosDetailMetadataLabels"
            />
          )}
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="m">
            <h4>
              {i18n.translate('observability.apm.slo.metadataPanel.annotations.heading', {
                defaultMessage: 'Annotations',
              })}
            </h4>
          </EuiText>
          <EuiText size="xs" color="subdued">
            {i18n.translate('observability.apm.slo.metadataPanel.annotations.description', {
              defaultMessage: 'Metadata only — does not propagate to rule labels.',
            })}
          </EuiText>
          <EuiSpacer size="s" />
          {annotations.length === 0 ? (
            <EuiText size="s" color="subdued" data-test-subj="slosDetailMetadataAnnotationsEmpty">
              {i18n.translate('observability.apm.slo.metadataPanel.annotations.empty', {
                defaultMessage: 'No annotations configured.',
              })}
            </EuiText>
          ) : (
            <EuiBasicTable
              tableCaption={i18n.translate(
                'observability.apm.slo.metadataPanel.annotations.tableCaption',
                { defaultMessage: 'Annotations' }
              )}
              items={annotations}
              columns={ANNOTATION_COLUMNS}
              data-test-subj="slosDetailMetadataAnnotations"
            />
          )}
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiText size="m">
            <h4>
              {i18n.translate('observability.apm.slo.metadataPanel.burnRates.heading', {
                defaultMessage: 'Burn-rate tiers',
              })}
            </h4>
          </EuiText>
          <EuiText size="xs" color="subdued">
            {i18n.translate('observability.apm.slo.metadataPanel.burnRates.description', {
              defaultMessage:
                'Tiers with alarming disabled still emit recording rules (shown dimmed).',
            })}
          </EuiText>
          <EuiSpacer size="s" />
          {burnRates.length === 0 ? (
            <EuiText size="s" color="subdued" data-test-subj="slosDetailMetadataBurnRatesEmpty">
              {i18n.translate('observability.apm.slo.metadataPanel.burnRates.empty', {
                defaultMessage: 'No burn-rate tiers configured.',
              })}
            </EuiText>
          ) : (
            <EuiBasicTable<BurnRateConfig>
              tableCaption={i18n.translate(
                'observability.apm.slo.metadataPanel.burnRates.tableCaption',
                { defaultMessage: 'Burn-rate tiers' }
              )}
              items={burnRates}
              columns={BURN_RATE_COLUMNS}
              rowProps={rowPropsForDisabledBurnRate}
              data-test-subj="slosDetailMetadataBurnRates"
            />
          )}
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="m">
            <h4>
              {i18n.translate('observability.apm.slo.metadataPanel.budgetWarnings.heading', {
                defaultMessage: 'Budget-warning thresholds',
              })}
            </h4>
          </EuiText>
          <EuiText size="xs" color="subdued">
            {i18n.translate('observability.apm.slo.metadataPanel.budgetWarnings.description', {
              defaultMessage: 'Fires when budget remaining drops below the threshold.',
            })}
          </EuiText>
          <EuiSpacer size="s" />
          {budgetWarnings.length === 0 ? (
            <EuiText
              size="s"
              color="subdued"
              data-test-subj="slosDetailMetadataBudgetWarningsEmpty"
            >
              {i18n.translate('observability.apm.slo.metadataPanel.budgetWarnings.empty', {
                defaultMessage: 'No budget-warning thresholds configured.',
              })}
            </EuiText>
          ) : (
            <EuiBasicTable<BudgetWarningThreshold>
              tableCaption={i18n.translate(
                'observability.apm.slo.metadataPanel.budgetWarnings.tableCaption',
                { defaultMessage: 'Budget warning thresholds' }
              )}
              items={budgetWarnings}
              columns={BUDGET_WARNING_COLUMNS}
              data-test-subj="slosDetailMetadataBudgetWarnings"
            />
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );

  const supplementalBody = (
    <>
      <EuiText size="s">
        <strong>
          {i18n.translate('observability.apm.slo.metadataPanel.supplementalAlarmsHeading', {
            defaultMessage: 'Supplemental alarms',
          })}
        </strong>
      </EuiText>
      <EuiSpacer size="xs" />
      <AlarmChecklist alarms={slo.spec.alarms} />

      <EuiSpacer size="m" />

      <EuiText size="s">
        <strong>
          {i18n.translate('observability.apm.slo.metadataPanel.exclusionWindowsHeading', {
            defaultMessage: 'Exclusion windows',
          })}
        </strong>
      </EuiText>
      <EuiSpacer size="xs" />
      {exclusionWindows.length === 0 ? (
        <EuiText size="s" color="subdued" data-test-subj="slosDetailMetadataExclusionEmpty">
          {i18n.translate('observability.apm.slo.metadataPanel.exclusion.empty', {
            defaultMessage: 'No exclusion windows configured.',
          })}
        </EuiText>
      ) : (
        <ExclusionWindowTable windows={exclusionWindows} />
      )}

      <EuiSpacer size="m" />

      <EuiText size="s">
        <strong>
          {i18n.translate('observability.apm.slo.metadataPanel.provisioningHeading', {
            defaultMessage: 'Provisioning',
          })}
        </strong>
      </EuiText>
      <EuiSpacer size="xs" />
      {prov ? (
        <ProvisioningBlock provisioning={prov} />
      ) : (
        <EuiText size="s" color="subdued" data-test-subj="slosDetailMetadataProvisioningEmpty">
          {i18n.translate('observability.apm.slo.metadataPanel.provisioning.unsupported', {
            defaultMessage: 'Non-Prometheus provisioning — no rule names available.',
          })}
        </EuiText>
      )}
    </>
  );

  // Inline: the detail page already wraps us in its own "Advanced details"
  // accordion — render bare sections so we don't nest accordion-in-accordion
  // and don't stack an outer EuiPanel inside a panel-less accordion body.
  if (inline) {
    return (
      <div data-test-subj="slosDetailMetadataPanel">
        {body}
        <EuiSpacer size="m" />
        {supplementalBody}
      </div>
    );
  }

  return (
    <EuiPanel data-test-subj="slosDetailMetadataPanel">
      {body}
      <EuiSpacer size="m" />
      <EuiAccordion
        id="slosDetailMetadataAdvanced"
        buttonContent={
          <EuiText size="s">
            <strong>
              <EuiIcon type="advancedSettingsApp" size="s" />{' '}
              {i18n.translate('observability.apm.slo.metadataPanel.advancedAccordion', {
                defaultMessage: 'Advanced details',
              })}
            </strong>
          </EuiText>
        }
        data-test-subj="slosDetailMetadataAdvanced"
        initialIsOpen={false}
      >
        <EuiSpacer size="s" />
        {supplementalBody}
      </EuiAccordion>
    </EuiPanel>
  );
};
