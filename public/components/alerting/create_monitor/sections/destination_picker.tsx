/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Read-only destination picker for trigger actions. Destinations are
 * managed in the OpenSearch Alerting plugin's own Destinations page.
 */
import React, { useMemo } from 'react';
import { EuiFormRow, EuiLink, EuiSpacer, EuiSuperSelect, EuiText } from '@elastic/eui';
import { useDestinations } from '../../hooks/use_destinations';
import { coreRefs } from '../../../../framework/core_refs';

export interface DestinationPickerProps {
  /** Datasource the destinations are scoped to. */
  dsId: string;
  /** Currently selected destination id, or empty string for "none selected". */
  value: string;
  onChange: (destinationId: string) => void;
  /** Surfaced as `aria-label` on the select. */
  ariaLabel?: string;
  /** Display invalid state (used when the form has been submitted unsuccessfully). */
  isInvalid?: boolean;
  /** Optional inline error text shown below the picker. */
  errorMessage?: string;
}

const NONE_OPTION_VALUE = '__none__';

export const DestinationPicker: React.FC<DestinationPickerProps> = ({
  dsId,
  value,
  onChange,
  ariaLabel = 'Notification destination',
  isInvalid,
  errorMessage,
}) => {
  const { destinations, isLoading, error } = useDestinations({ dsId });

  const options = useMemo(() => {
    const opts = destinations.map((d) => ({
      value: d.id,
      inputDisplay: d.name,
      dropdownDisplay: (
        <>
          <strong>{d.name}</strong>
          <EuiText size="xs" color="subdued">
            {d.type}
          </EuiText>
        </>
      ),
    }));
    return [
      {
        value: NONE_OPTION_VALUE,
        inputDisplay: <em>Select a destination</em>,
      },
      ...opts,
    ];
  }, [destinations]);

  const destinationsHref = useMemo(() => {
    const base = coreRefs.http?.basePath?.get?.() ?? '';
    return `${base}/app/alerting#/destinations`;
  }, []);

  const selectedValue = value || NONE_OPTION_VALUE;

  return (
    <EuiFormRow
      label="Destination"
      isInvalid={isInvalid}
      error={errorMessage}
      fullWidth
      helpText={
        !isLoading && destinations.length === 0 ? (
          <span>
            No destinations configured for this datasource.{' '}
            <EuiLink href={destinationsHref} target="_blank">
              Open Destinations
            </EuiLink>
          </span>
        ) : (
          <span>
            <EuiLink href={destinationsHref} target="_blank">
              Manage destinations
            </EuiLink>
          </span>
        )
      }
    >
      <>
        <EuiSuperSelect
          options={options}
          valueOfSelected={selectedValue}
          onChange={(v) => onChange(v === NONE_OPTION_VALUE ? '' : v)}
          fullWidth
          isLoading={isLoading}
          aria-label={ariaLabel}
          data-test-subj="alertManager-pplDestinationPicker"
        />
        {error && (
          <>
            <EuiSpacer size="xs" />
            <EuiText size="xs" color="danger">
              Failed to load destinations: {error.message}
            </EuiText>
          </>
        )}
      </>
    </EuiFormRow>
  );
};
