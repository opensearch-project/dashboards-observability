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
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
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
  ariaLabel,
  isInvalid,
  errorMessage,
}) => {
  const { destinations, isLoading, error, truncated, totalDestinations } = useDestinations({
    dsId,
  });

  const placeholderText = i18n.translate('observability.alerting.destinationPicker.placeholder', {
    defaultMessage: 'Select a destination',
  });

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
        inputDisplay: <em>{placeholderText}</em>,
      },
      ...opts,
    ];
  }, [destinations, placeholderText]);

  const destinationsHref = `${coreRefs.http?.basePath?.get?.() ?? ''}/app/alerting#/destinations`;

  const selectedValue = value || NONE_OPTION_VALUE;

  const resolvedAriaLabel =
    ariaLabel ??
    i18n.translate('observability.alerting.destinationPicker.defaultAriaLabel', {
      defaultMessage: 'Notification destination',
    });

  return (
    <EuiFormRow
      label={i18n.translate('observability.alerting.destinationPicker.label', {
        defaultMessage: 'Destination',
      })}
      isInvalid={isInvalid}
      error={errorMessage}
      fullWidth
      helpText={
        !isLoading && destinations.length === 0 ? (
          <span>
            <FormattedMessage
              id="observability.alerting.destinationPicker.noneConfigured"
              defaultMessage="No destinations configured for this datasource. {openLink}"
              values={{
                openLink: (
                  <EuiLink href={destinationsHref} target="_blank">
                    <FormattedMessage
                      id="observability.alerting.destinationPicker.openDestinations"
                      defaultMessage="Open Destinations"
                    />
                  </EuiLink>
                ),
              }}
            />
          </span>
        ) : (
          <span>
            <EuiLink href={destinationsHref} target="_blank">
              <FormattedMessage
                id="observability.alerting.destinationPicker.manageDestinations"
                defaultMessage="Manage destinations"
              />
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
          aria-label={resolvedAriaLabel}
          data-test-subj="alertManagerPplDestinationPicker"
        />
        {error && (
          <>
            <EuiSpacer size="xs" />
            <EuiText size="xs" color="danger">
              <FormattedMessage
                id="observability.alerting.destinationPicker.loadError"
                defaultMessage="Failed to load destinations: {message}"
                values={{ message: error.message }}
              />
            </EuiText>
          </>
        )}
        {truncated && (
          <>
            <EuiSpacer size="xs" />
            <EuiText size="xs" color="subdued" data-test-subj="alertManagerDestinationsTruncated">
              <FormattedMessage
                id="observability.alerting.destinationPicker.truncated"
                defaultMessage="Showing the first {shown} of {total} destinations. Manage older entries from the Alerting plugin."
                values={{ shown: destinations.length, total: totalDestinations }}
              />
            </EuiText>
          </>
        )}
      </>
    </EuiFormRow>
  );
};
