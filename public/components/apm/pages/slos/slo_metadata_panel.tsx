/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SLO detail metadata panel (W4.2).
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
 * since they're metadata-only (§10.3 of the SLO design doc).
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
  { field: 'key', name: 'Key', width: '25%' },
  { field: 'raw', name: 'Value', width: '40%' },
  {
    field: 'propagatedAs',
    name: 'Propagates as',
    width: '35%',
    render: (value: string) => (
      <EuiToolTip content="User labels are re-emitted on every generated rule under this key.">
        <EuiBadge color="hollow" data-test-subj="slosDetailMetadataLabelPropagation">
          {value}
        </EuiBadge>
      </EuiToolTip>
    ),
  },
];

const ANNOTATION_COLUMNS: Array<EuiBasicTableColumn<{ key: string; value: string }>> = [
  { field: 'key', name: 'Key', width: '30%' },
  { field: 'value', name: 'Value', width: '70%' },
];

const BURN_RATE_COLUMNS: Array<EuiBasicTableColumn<BurnRateConfig>> = [
  {
    field: 'severity',
    name: 'Severity',
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
  { field: 'shortWindow', name: 'Short', width: '15%' },
  { field: 'longWindow', name: 'Long', width: '15%' },
  {
    field: 'burnRateMultiplier',
    name: 'Burn',
    width: '15%',
    render: (n: number) => `${n.toFixed(1)}x`,
  },
  { field: 'forDuration', name: 'For', width: '15%' },
  {
    field: 'createAlarm',
    name: 'Alarm',
    width: '20%',
    render: (on: boolean) =>
      on ? (
        <EuiBadge color="success">enabled</EuiBadge>
      ) : (
        <EuiBadge color="hollow">recording only</EuiBadge>
      ),
  },
];

const BUDGET_WARNING_COLUMNS: Array<EuiBasicTableColumn<BudgetWarningThreshold>> = [
  {
    field: 'severity',
    name: 'Severity',
    render: (severity: string) => <EuiBadge color="warning">{severity}</EuiBadge>,
  },
  {
    field: 'threshold',
    name: 'Remaining threshold',
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
  // Ordered by default-on policy (design §13.1 commitments): budgetWarning
  // defaults ON, everything else defaults OFF. Keeping this order means the
  // top of the list shows the user's deliberate opt-outs.
  const rows: Array<{ key: string; label: string; enabled: boolean; detail?: string }> = [
    { key: 'budgetWarning', label: 'Budget warning', enabled: alarms.budgetWarning.enabled },
    { key: 'sliHealth', label: 'SLI health', enabled: alarms.sliHealth.enabled },
    {
      key: 'attainmentBreach',
      label: 'Attainment breach',
      enabled: alarms.attainmentBreach.enabled,
    },
    {
      key: 'noData',
      label: 'No data',
      enabled: alarms.noData.enabled,
      detail: alarms.noData.enabled ? `for ${alarms.noData.forDuration}` : undefined,
    },
    { key: 'resolved', label: 'Resolved', enabled: alarms.resolved.enabled },
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
    return `cron "${w.schedule.expression}" · ${w.schedule.duration} · ${w.schedule.timezone}`;
  }
  return `one-off ${w.schedule.start} → ${w.schedule.end}`;
}

interface ExclusionWindowTableProps {
  windows: ExclusionWindow[];
}

const ExclusionWindowTable: React.FC<ExclusionWindowTableProps> = ({ windows }) => {
  const columns: Array<EuiBasicTableColumn<ExclusionWindow>> = [
    { field: 'name', name: 'Name', width: '20%' },
    {
      name: 'Schedule',
      width: '45%',
      render: (row: ExclusionWindow) => <code>{describeSchedule(row)}</code>,
    },
    { field: 'reason', name: 'Reason', width: '25%', render: (r?: string) => r ?? '—' },
    {
      name: 'Status',
      width: '10%',
      render: () => (
        <EuiToolTip content="Exclusion windows are persisted but enforcement is deferred post-GA (design §3.5).">
          <EuiBadge color="hollow" data-test-subj="slosDetailMetadataExclusionDeferred">
            deferred
          </EuiBadge>
        </EuiToolTip>
      ),
    },
  ];
  return (
    <EuiBasicTable<ExclusionWindow>
      tableCaption="Exclusion windows"
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
        { title: 'Alert group', description: provisioning.alertGroupName ?? '—' },
        { title: 'Namespace', description: provisioning.rulerNamespace },
        {
          title: 'Recording groups',
          description: `${uniqueRecordingGroups} shared`,
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
            <h4>Labels</h4>
          </EuiText>
          <EuiText size="xs" color="subdued">
            Propagated onto every generated rule as <code>slo_label_&lt;key&gt;</code>.
          </EuiText>
          <EuiSpacer size="s" />
          {labels.length === 0 ? (
            <EuiText size="s" color="subdued" data-test-subj="slosDetailMetadataLabelsEmpty">
              No labels configured.
            </EuiText>
          ) : (
            <EuiBasicTable<LabelRow>
              tableCaption="Labels"
              items={labels}
              columns={LABEL_COLUMNS}
              data-test-subj="slosDetailMetadataLabels"
            />
          )}
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="m">
            <h4>Annotations</h4>
          </EuiText>
          <EuiText size="xs" color="subdued">
            Metadata only — does not propagate to rule labels.
          </EuiText>
          <EuiSpacer size="s" />
          {annotations.length === 0 ? (
            <EuiText size="s" color="subdued" data-test-subj="slosDetailMetadataAnnotationsEmpty">
              No annotations configured.
            </EuiText>
          ) : (
            <EuiBasicTable
              tableCaption="Annotations"
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
            <h4>Burn-rate tiers</h4>
          </EuiText>
          <EuiText size="xs" color="subdued">
            Tiers with alarming disabled still emit recording rules (shown dimmed).
          </EuiText>
          <EuiSpacer size="s" />
          {burnRates.length === 0 ? (
            <EuiText size="s" color="subdued" data-test-subj="slosDetailMetadataBurnRatesEmpty">
              No burn-rate tiers configured.
            </EuiText>
          ) : (
            <EuiBasicTable<BurnRateConfig>
              tableCaption="Burn-rate tiers"
              items={burnRates}
              columns={BURN_RATE_COLUMNS}
              rowProps={rowPropsForDisabledBurnRate}
              data-test-subj="slosDetailMetadataBurnRates"
            />
          )}
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="m">
            <h4>Budget-warning thresholds</h4>
          </EuiText>
          <EuiText size="xs" color="subdued">
            Fires when budget remaining drops below the threshold.
          </EuiText>
          <EuiSpacer size="s" />
          {budgetWarnings.length === 0 ? (
            <EuiText
              size="s"
              color="subdued"
              data-test-subj="slosDetailMetadataBudgetWarningsEmpty"
            >
              No budget-warning thresholds configured.
            </EuiText>
          ) : (
            <EuiBasicTable<BudgetWarningThreshold>
              tableCaption="Budget warning thresholds"
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
        <strong>Supplemental alarms</strong>
      </EuiText>
      <EuiSpacer size="xs" />
      <AlarmChecklist alarms={slo.spec.alarms} />

      <EuiSpacer size="m" />

      <EuiText size="s">
        <strong>Exclusion windows</strong>
      </EuiText>
      <EuiSpacer size="xs" />
      {exclusionWindows.length === 0 ? (
        <EuiText size="s" color="subdued" data-test-subj="slosDetailMetadataExclusionEmpty">
          No exclusion windows configured.
        </EuiText>
      ) : (
        <ExclusionWindowTable windows={exclusionWindows} />
      )}

      <EuiSpacer size="m" />

      <EuiText size="s">
        <strong>Provisioning</strong>
      </EuiText>
      <EuiSpacer size="xs" />
      {prov ? (
        <ProvisioningBlock provisioning={prov} />
      ) : (
        <EuiText size="s" color="subdued" data-test-subj="slosDetailMetadataProvisioningEmpty">
          Non-Prometheus provisioning — no rule names available.
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
              <EuiIcon type="advancedSettingsApp" size="s" /> Advanced details
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
