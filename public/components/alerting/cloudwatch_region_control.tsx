/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Picks the CloudWatch regions the Datasource facet lists. Rendered under the facet on both
 * tabs, and only when the source offers more than one region.
 */
import React, { useMemo } from 'react';
import { EuiComboBox, EuiComboBoxOptionOption, EuiFormRow } from '@elastic/eui';
import { i18n } from '@osd/i18n';

export interface CloudWatchRegionControlProps {
  /** The regions the source offers. */
  regions: Array<{ id: string; name: string }>;
  /** The selected region ids. */
  selected: string[];
  onChange: (regions: string[]) => void;
}

export const CloudWatchRegionControl: React.FC<CloudWatchRegionControlProps> = ({
  regions,
  selected,
  onChange,
}) => {
  const options = useMemo<Array<EuiComboBoxOptionOption<string>>>(
    () => regions.map((r) => ({ label: r.name, value: r.id })),
    [regions]
  );
  const selectedOptions = useMemo(
    () => options.filter((o) => o.value !== undefined && selected.includes(o.value)),
    [options, selected]
  );
  if (regions.length <= 1) return null;
  return (
    <EuiFormRow
      label={i18n.translate('observability.alerting.cloudwatch.regionControl.label', {
        defaultMessage: 'CloudWatch regions',
      })}
      display="rowCompressed"
      fullWidth
    >
      <EuiComboBox
        data-test-subj="cloudWatchRegionControl"
        compressed
        fullWidth
        placeholder={i18n.translate('observability.alerting.cloudwatch.regionControl.placeholder', {
          defaultMessage: 'Select regions',
        })}
        aria-label={i18n.translate('observability.alerting.cloudwatch.regionControl.ariaLabel', {
          defaultMessage: 'CloudWatch regions to read alarms from',
        })}
        options={options}
        selectedOptions={selectedOptions}
        onChange={(next) =>
          onChange(next.map((o) => o.value).filter((v): v is string => typeof v === 'string'))
        }
      />
    </EuiFormRow>
  );
};
