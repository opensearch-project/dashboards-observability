/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Monitor Form Sub-components — reusable form sections extracted from CreateMonitor.
 *
 * Includes:
 *  - LabelEditor: key-value label pairs with dynamic toggle
 *  - AnnotationEditor: key-value annotation pairs
 *  - DatasourceTargetSelector: datasource dropdown
 *
 * These are shared between PrometheusFormSection and OpenSearchFormSection.
 */
import React, { useMemo } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiFieldText,
  EuiTextArea,
  EuiSelect,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiText,
  EuiBadge,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import { Datasource, DatasourceType } from '../../../common/types/alerting';

// ============================================================================
// Types — re-exported from `common/services/alerting/validators.ts` so the
// public-side component layer and the validator share a single canonical
// definition. Earlier the same shapes were declared twice; deduping prevents
// drift when one side adds a field (e.g. `isDynamic` on `LabelEntry`).
// ============================================================================

export type { LabelEntry, AnnotationEntry } from '../../../common/services/alerting/validators';

// Public-side import name kept stable; canonical shape lives in common
// (`DatasourceType` in unified_types.ts).
export type MonitorBackendType = DatasourceType;

// ============================================================================
// Constants
// ============================================================================

const COMMON_LABEL_KEYS = [
  'service',
  'team',
  'environment',
  'region',
  'application',
  'tier',
  'component',
];

// ============================================================================
// LabelEditor
// ============================================================================

export const LabelEditor: React.FC<{
  labels: LabelEntry[];
  onChange: (labels: LabelEntry[]) => void;
  context?: { service?: string; team?: string };
}> = ({ labels, onChange, context }) => {
  const addLabel = () => onChange([...labels, { key: '', value: '' }]);
  const removeLabel = (i: number) => onChange(labels.filter((_, idx) => idx !== i));
  const updateLabel = (i: number, field: 'key' | 'value', val: string) => {
    const next = [...labels];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  };
  const toggleDynamic = (i: number) => {
    const next = [...labels];
    next[i] = { ...next[i], isDynamic: !next[i].isDynamic };
    onChange(next);
  };

  const autoPopulate = () => {
    const next = [...labels];
    if (context?.service && !labels.some((l) => l.key === 'service')) {
      next.push({ key: 'service', value: context.service });
    }
    if (context?.team && !labels.some((l) => l.key === 'team')) {
      next.push({ key: 'team', value: context.team });
    }
    onChange(next);
  };

  return (
    <div data-test-subj="labelEditor">
      {labels.map((label, i) => (
        <EuiFlexGroup
          key={`${label.key}-${i}`}
          gutterSize="s"
          alignItems="center"
          responsive={false}
          style={{ marginBottom: 4 }}
        >
          <EuiFlexItem grow={2}>
            <EuiFieldText
              placeholder={i18n.translate(
                'observability.alerting.monitorFormComponents.labelKeyPlaceholder',
                {
                  defaultMessage: 'Key',
                }
              )}
              value={label.key}
              onChange={(e) => updateLabel(i, 'key', e.target.value)}
              compressed
              aria-label={i18n.translate(
                'observability.alerting.monitorFormComponents.labelKeyAriaLabel',
                {
                  defaultMessage: 'Label key {index}',
                  values: { index: i + 1 },
                }
              )}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="s">=</EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={3}>
            <EuiFieldText
              placeholder={
                label.isDynamic
                  ? '{{ $labels.severity }}'
                  : i18n.translate(
                      'observability.alerting.monitorFormComponents.labelValuePlaceholder',
                      {
                        defaultMessage: 'Value',
                      }
                    )
              }
              value={label.value}
              onChange={(e) => updateLabel(i, 'value', e.target.value)}
              compressed
              aria-label={i18n.translate(
                'observability.alerting.monitorFormComponents.labelValueAriaLabel',
                {
                  defaultMessage: 'Label value {index}',
                  values: { index: i + 1 },
                }
              )}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip
              content={
                label.isDynamic
                  ? i18n.translate(
                      'observability.alerting.monitorFormComponents.dynamicTemplateTooltip',
                      {
                        defaultMessage: 'Dynamic (template)',
                      }
                    )
                  : i18n.translate(
                      'observability.alerting.monitorFormComponents.staticValueTooltip',
                      {
                        defaultMessage: 'Static value',
                      }
                    )
              }
            >
              <EuiButtonIcon
                iconType={label.isDynamic ? 'bolt' : 'tag'}
                aria-label={i18n.translate(
                  'observability.alerting.monitorFormComponents.toggleDynamicAriaLabel',
                  {
                    defaultMessage: 'Toggle dynamic',
                  }
                )}
                onClick={() => toggleDynamic(i)}
                color={label.isDynamic ? 'primary' : 'text'}
                size="s"
              />
            </EuiToolTip>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonIcon
              iconType="trash"
              aria-label={i18n.translate(
                'observability.alerting.monitorFormComponents.removeLabelAriaLabel',
                {
                  defaultMessage: 'Remove label',
                }
              )}
              onClick={() => removeLabel(i)}
              color="danger"
              size="s"
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      ))}
      <EuiFlexGroup gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty size="xs" iconType="plusInCircle" onClick={addLabel}>
            <FormattedMessage
              id="observability.alerting.monitorFormComponents.addLabelButton"
              defaultMessage="Add label"
            />
          </EuiButtonEmpty>
        </EuiFlexItem>
        {context && (
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size="xs" iconType="importAction" onClick={autoPopulate}>
              <FormattedMessage
                id="observability.alerting.monitorFormComponents.autoPopulateButton"
                defaultMessage="Auto-populate from context"
              />
            </EuiButtonEmpty>
          </EuiFlexItem>
        )}
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="xs" responsive={false}>
            {COMMON_LABEL_KEYS.filter((k) => !labels.some((l) => l.key === k))
              .slice(0, 4)
              .map((k) => (
                <EuiFlexItem grow={false} key={k}>
                  <EuiBadge
                    color="hollow"
                    onClick={() => onChange([...labels, { key: k, value: '' }])}
                    onClickAriaLabel={i18n.translate(
                      'observability.alerting.monitorFormComponents.addLabelByKeyAriaLabel',
                      {
                        defaultMessage: 'Add {key} label',
                        values: { key: k },
                      }
                    )}
                  >
                    + {k}
                  </EuiBadge>
                </EuiFlexItem>
              ))}
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
};

// ============================================================================
// AnnotationEditor
// ============================================================================

export const AnnotationEditor: React.FC<{
  annotations: AnnotationEntry[];
  onChange: (annotations: AnnotationEntry[]) => void;
}> = ({ annotations, onChange }) => {
  const updateAnnotation = (i: number, val: string) => {
    const next = [...annotations];
    next[i] = { ...next[i], value: val };
    onChange(next);
  };
  const addAnnotation = () => onChange([...annotations, { key: '', value: '' }]);
  const removeAnnotation = (i: number) => onChange(annotations.filter((_, idx) => idx !== i));
  const updateKey = (i: number, key: string) => {
    const next = [...annotations];
    next[i] = { ...next[i], key };
    onChange(next);
  };

  const placeholders: Record<string, string> = {
    summary: i18n.translate('observability.alerting.monitorFormComponents.placeholder.summary', {
      defaultMessage: 'Brief alert summary, e.g. "CPU usage above 80% on {example}"',
      values: { example: '{{ $labels.instance }}' },
    }),
    description: i18n.translate(
      'observability.alerting.monitorFormComponents.placeholder.description',
      {
        defaultMessage: 'Detailed description of what this alert means and potential impact',
      }
    ),
    runbook_url: 'https://wiki.example.com/runbooks/...',
    dashboard_url: 'https://dashboards.example.com/d/...',
  };

  const valuePlaceholder = i18n.translate(
    'observability.alerting.monitorFormComponents.annotationValuePlaceholder',
    {
      defaultMessage: 'Value',
    }
  );

  return (
    <div data-test-subj="annotationEditor">
      {annotations.map((ann, i) => (
        <div key={`${ann.key}-${i}`} style={{ marginBottom: 8 }}>
          <EuiFlexGroup gutterSize="s" alignItems="flexStart" responsive={false}>
            <EuiFlexItem grow={2}>
              <EuiFieldText
                placeholder={i18n.translate(
                  'observability.alerting.monitorFormComponents.annotationKeyPlaceholder',
                  {
                    defaultMessage: 'Key',
                  }
                )}
                value={ann.key}
                onChange={(e) => updateKey(i, e.target.value)}
                compressed
                aria-label={i18n.translate(
                  'observability.alerting.monitorFormComponents.annotationKeyAriaLabel',
                  {
                    defaultMessage: 'Annotation key {index}',
                    values: { index: i + 1 },
                  }
                )}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={5}>
              {ann.key === 'description' || ann.key === 'summary' ? (
                <EuiTextArea
                  placeholder={placeholders[ann.key] || valuePlaceholder}
                  value={ann.value}
                  onChange={(e) => updateAnnotation(i, e.target.value)}
                  compressed
                  rows={2}
                  aria-label={i18n.translate(
                    'observability.alerting.monitorFormComponents.annotationValueAriaLabel',
                    {
                      defaultMessage: 'Annotation value {index}',
                      values: { index: i + 1 },
                    }
                  )}
                />
              ) : (
                <EuiFieldText
                  placeholder={placeholders[ann.key] || valuePlaceholder}
                  value={ann.value}
                  onChange={(e) => updateAnnotation(i, e.target.value)}
                  compressed
                  aria-label={i18n.translate(
                    'observability.alerting.monitorFormComponents.annotationValueAriaLabel',
                    {
                      defaultMessage: 'Annotation value {index}',
                      values: { index: i + 1 },
                    }
                  )}
                />
              )}
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonIcon
                iconType="trash"
                aria-label={i18n.translate(
                  'observability.alerting.monitorFormComponents.removeAnnotationAriaLabel',
                  {
                    defaultMessage: 'Remove annotation',
                  }
                )}
                onClick={() => removeAnnotation(i)}
                color="danger"
                size="s"
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </div>
      ))}
      <EuiButtonEmpty size="xs" iconType="plusInCircle" onClick={addAnnotation}>
        <FormattedMessage
          id="observability.alerting.monitorFormComponents.addAnnotationButton"
          defaultMessage="Add annotation"
        />
      </EuiButtonEmpty>
    </div>
  );
};

// ============================================================================
// DatasourceTargetSelector
// ============================================================================

export const DatasourceTargetSelector: React.FC<{
  datasources: Datasource[];
  selectedId: string;
  onChange: (id: string, type: MonitorBackendType) => void;
}> = ({ datasources, selectedId, onChange }) => {
  const options = useMemo(() => {
    return datasources.map((ds) => ({
      value: ds.id,
      text: ds.name + (ds.workspaceName ? ` (${ds.workspaceName})` : ''),
    }));
  }, [datasources]);

  return (
    <EuiFormRow
      label={i18n.translate('observability.alerting.monitorFormComponents.targetDatasourceLabel', {
        defaultMessage: 'Target Datasource',
      })}
      helpText={i18n.translate(
        'observability.alerting.monitorFormComponents.targetDatasourceHelpText',
        {
          defaultMessage: 'Where this monitor will be created',
        }
      )}
      fullWidth
      data-test-subj="datasourceTargetSelector"
    >
      <EuiSelect
        options={[
          {
            value: '',
            text: i18n.translate(
              'observability.alerting.monitorFormComponents.selectDatasourceOption',
              {
                defaultMessage: 'Select a datasource...',
              }
            ),
          },
          ...options,
        ]}
        value={selectedId}
        onChange={(e) => {
          const id = e.target.value;
          const ds = datasources.find((d) => d.id === id);
          if (ds) onChange(id, ds.type as MonitorBackendType);
        }}
        fullWidth
        aria-label={i18n.translate(
          'observability.alerting.monitorFormComponents.targetDatasourceAriaLabel',
          {
            defaultMessage: 'Target datasource',
          }
        )}
      />
    </EuiFormRow>
  );
};
