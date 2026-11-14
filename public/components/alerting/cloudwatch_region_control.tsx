/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The "Regions" control of the Datasource facet's CloudWatch group: the regions every checked
 * CloudWatch account is read in. Rendered only inside that group, only when the source offers
 * more than one region. At least one region stays selected.
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
        defaultMessage: 'Regions',
      })}
      display="rowCompressed"
      fullWidth
    >
      <EuiComboBox
        data-test-subj="cloudWatchRegionControl"
        compressed
        fullWidth
        isClearable={false}
        placeholder={i18n.translate('observability.alerting.cloudwatch.regionControl.placeholder', {
          defaultMessage: 'Select regions',
        })}
        aria-label={i18n.translate('observability.alerting.cloudwatch.regionControl.ariaLabel', {
          defaultMessage: 'CloudWatch regions to read alarms from',
        })}
        options={options}
        selectedOptions={selectedOptions}
        onChange={(next) => {
          const ids = next.map((o) => o.value).filter((v): v is string => typeof v === 'string');
          // Removing the last chip would leave the checked accounts with no region to read.
          if (ids.length === 0) return;
          onChange(ids);
        }}
      />
    </EuiFormRow>
  );
};
