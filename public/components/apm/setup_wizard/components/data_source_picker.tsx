/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { EuiComboBox, EuiComboBoxOptionOption, EuiFormRow, EuiHealth, EuiText } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { ApmDetectionResult } from '../types';

/** Which signal this page needs the selected data source to expose. */
export type PickerSignal = 'traces' | 'serviceMap';

export interface DataSourcePickerProps {
  detections: ApmDetectionResult[];
  /** dataSourceId ('' represents the local cluster). */
  selectedDataSourceId: string;
  onChange: (dataSourceId: string) => void;
  /** Signal the page requires; drives which sources are enabled. */
  signal: PickerSignal;
  isLoading?: boolean;
}

// Sentinel value for the local cluster (undefined dataSourceId), since
// EuiComboBox option values must be defined strings.
const LOCAL_CLUSTER_VALUE = '__local__';

const hasSignal = (detection: ApmDetectionResult, signal: PickerSignal): boolean =>
  signal === 'traces' ? detection.tracesDetected : detection.serviceMapDetected;

interface PickerOptionValue {
  id: string;
  disabled: boolean;
}

/**
 * Lists every data source (plus the local cluster) and lets the user pick one.
 * Sources that lack the signal this page needs are shown disabled with an
 * inline reason and a tooltip, so the choice — and why a source can't be used
 * here — is always visible. Each page passes its own `signal`, so a source may
 * be selectable on one page and disabled on another.
 */
export const DataSourcePicker = ({
  detections,
  selectedDataSourceId,
  onChange,
  signal,
  isLoading,
}: DataSourcePickerProps) => {
  const missingLabel = i18n.translate('observability.apm.setupWizard.dataSourcePicker.noIndex', {
    defaultMessage: 'no APM index',
  });

  const options: Array<EuiComboBoxOptionOption<PickerOptionValue>> = useMemo(
    () =>
      detections.map((d) => {
        const enabled = hasSignal(d, signal);
        const title =
          d.dataSourceTitle ||
          i18n.translate('observability.apm.setupWizard.dataSourcePicker.localCluster', {
            defaultMessage: 'Local Cluster',
          });
        return {
          label: enabled ? title : `${title} — ${missingLabel}`,
          value: { id: d.dataSourceId || LOCAL_CLUSTER_VALUE, disabled: !enabled },
          disabled: !enabled,
        };
      }),
    [detections, signal, missingLabel]
  );

  const selectedOptions = useMemo(() => {
    const value = selectedDataSourceId || LOCAL_CLUSTER_VALUE;
    return options.filter((o) => o.value?.id === value);
  }, [options, selectedDataSourceId]);

  const missingTooltip = i18n.translate(
    'observability.apm.setupWizard.dataSourcePicker.noIndexTooltip',
    {
      defaultMessage:
        'This data source has no matching index with the required fields for this step.',
    }
  );

  return (
    <EuiFormRow
      label={i18n.translate('observability.apm.setupWizard.dataSourcePicker.label', {
        defaultMessage: 'Data source',
      })}
      helpText={i18n.translate('observability.apm.setupWizard.dataSourcePicker.help', {
        defaultMessage: 'Choose which data source to create APM datasets from.',
      })}
      fullWidth
    >
      <EuiComboBox
        compressed
        fullWidth
        singleSelection={{ asPlainText: true }}
        isClearable={false}
        isLoading={isLoading}
        options={options}
        selectedOptions={selectedOptions}
        onChange={(selected) => {
          const value = selected[0]?.value?.id;
          onChange(value === LOCAL_CLUSTER_VALUE ? '' : (value ?? ''));
        }}
        renderOption={(option) => {
          const isDisabled = (option.value as PickerOptionValue | undefined)?.disabled;
          return isDisabled ? (
            <EuiHealth color="subdued" title={missingTooltip}>
              <EuiText size="s" color="subdued">
                {option.label}
              </EuiText>
            </EuiHealth>
          ) : (
            <EuiHealth color="success">{option.label}</EuiHealth>
          );
        }}
        data-test-subj="apmSetupWizardDataSourcePicker"
      />
    </EuiFormRow>
  );
};
