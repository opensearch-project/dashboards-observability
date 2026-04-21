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
import { Datasource } from '../../../server/services/alerting';

// ============================================================================
// Types
// ============================================================================

export interface LabelEntry {
  key: string;
  value: string;
  isDynamic?: boolean;
}

export interface AnnotationEntry {
  key: string;
  value: string;
}

export type MonitorBackendType = 'prometheus' | 'opensearch';

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
              placeholder="Key"
              value={label.key}
              onChange={(e) => updateLabel(i, 'key', e.target.value)}
              compressed
              aria-label={`Label key ${i + 1}`}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="s">=</EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={3}>
            <EuiFieldText
              placeholder={label.isDynamic ? '{{ $labels.severity }}' : 'Value'}
              value={label.value}
              onChange={(e) => updateLabel(i, 'value', e.target.value)}
              compressed
              aria-label={`Label value ${i + 1}`}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip content={label.isDynamic ? 'Dynamic (template)' : 'Static value'}>
              <EuiButtonIcon
                iconType={label.isDynamic ? 'bolt' : 'tag'}
                aria-label="Toggle dynamic"
                onClick={() => toggleDynamic(i)}
                color={label.isDynamic ? 'primary' : 'text'}
                size="s"
              />
            </EuiToolTip>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonIcon
              iconType="trash"
              aria-label="Remove label"
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
            Add label
          </EuiButtonEmpty>
        </EuiFlexItem>
        {context && (
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size="xs" iconType="importAction" onClick={autoPopulate}>
              Auto-populate from context
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
                    onClickAriaLabel={`Add ${k} label`}
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
    summary: 'Brief alert summary, e.g. "CPU usage above 80% on {{ $labels.instance }}"',
    description: 'Detailed description of what this alert means and potential impact',
    runbook_url: 'https://wiki.example.com/runbooks/...',
    dashboard_url: 'https://grafana.example.com/d/...',
  };

  return (
    <div data-test-subj="annotationEditor">
      {annotations.map((ann, i) => (
        <div key={`${ann.key}-${i}`} style={{ marginBottom: 8 }}>
          <EuiFlexGroup gutterSize="s" alignItems="flexStart" responsive={false}>
            <EuiFlexItem grow={2}>
              <EuiFieldText
                placeholder="Key"
                value={ann.key}
                onChange={(e) => updateKey(i, e.target.value)}
                compressed
                aria-label={`Annotation key ${i + 1}`}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={5}>
              {ann.key === 'description' || ann.key === 'summary' ? (
                <EuiTextArea
                  placeholder={placeholders[ann.key] || 'Value'}
                  value={ann.value}
                  onChange={(e) => updateAnnotation(i, e.target.value)}
                  compressed
                  rows={2}
                  aria-label={`Annotation value ${i + 1}`}
                />
              ) : (
                <EuiFieldText
                  placeholder={placeholders[ann.key] || 'Value'}
                  value={ann.value}
                  onChange={(e) => updateAnnotation(i, e.target.value)}
                  compressed
                  aria-label={`Annotation value ${i + 1}`}
                />
              )}
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonIcon
                iconType="trash"
                aria-label="Remove annotation"
                onClick={() => removeAnnotation(i)}
                color="danger"
                size="s"
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </div>
      ))}
      <EuiButtonEmpty size="xs" iconType="plusInCircle" onClick={addAnnotation}>
        Add annotation
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
      label="Target Datasource"
      helpText="Where this monitor will be created"
      fullWidth
      data-test-subj="datasourceTargetSelector"
    >
      <EuiSelect
        options={[{ value: '', text: 'Select a datasource...' }, ...options]}
        value={selectedId}
        onChange={(e) => {
          const id = e.target.value;
          const ds = datasources.find((d) => d.id === id);
          if (ds) onChange(id, ds.type as MonitorBackendType);
        }}
        fullWidth
        aria-label="Target datasource"
      />
    </EuiFormRow>
  );
};
