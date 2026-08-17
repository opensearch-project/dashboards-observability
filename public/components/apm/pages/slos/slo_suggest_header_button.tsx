/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { EuiButton, EuiToolTip } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { useServices } from '../../shared/hooks/use_services';
import { parseTimeRange } from '../../shared/utils/time_utils';
import { DEFAULT_APM_TIME_RANGE } from '../../common/constants';
import { navigateToSloSuggest } from '../../shared/utils/navigation_utils';

/**
 * Toolbar CTA that steers users to the Suggest SLOs batch flow (the fastest way
 * to a first SLO) rather than the manual create wizard. Rendered next to
 * "Create SLO" once the workspace already has SLOs.
 *
 * Suggest only makes sense when there are APM services to draft objectives
 * against, so the button is disabled when discovery finds none — with a tooltip
 * that points the user at the Services page to set them up first.
 */
export const SloSuggestHeaderButton: React.FC = () => {
  // Discovery window: reuse the shared APM default and resolve it once so the
  // query doesn't re-fire on every render.
  const parsedTimeRange = useMemo(() => parseTimeRange(DEFAULT_APM_TIME_RANGE), []);

  const { data: services, isLoading: servicesLoading } = useServices({
    startTime: parsedTimeRange.startTime,
    endTime: parsedTimeRange.endTime,
  });

  const serviceCount = services?.length ?? 0;
  // Stay enabled while discovery is in flight — the Suggest page has its own
  // no-services handling, so an early click is harmless and avoids a flicker.
  const hasServices = servicesLoading || serviceCount > 0;

  const button = (
    <EuiButton
      fill
      size="s"
      iconType="inspect"
      isDisabled={!hasServices}
      onClick={hasServices ? () => navigateToSloSuggest([]) : undefined}
      data-test-subj="slosSuggest"
    >
      {i18n.translate('observability.apm.slo.listing.suggestButton', {
        defaultMessage: 'Suggest SLOs',
      })}
    </EuiButton>
  );

  if (hasServices) {
    return button;
  }

  return (
    <EuiToolTip
      position="bottom"
      content={i18n.translate('observability.apm.slo.listing.suggestButton.noServicesTooltip', {
        defaultMessage:
          'No services detected. Set up services on the Services page first — then Suggest SLOs can draft objectives for them.',
      })}
    >
      {/* A disabled button doesn't emit the pointer events EuiToolTip needs, so
          wrap it in a span that acts as the (enabled) hover target. */}
      <span>{button}</span>
    </EuiToolTip>
  );
};
