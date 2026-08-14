/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { EuiButton, EuiButtonEmpty, EuiEmptyPrompt, EuiPanel } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { useServices } from '../../shared/hooks/use_services';
import { parseTimeRange } from '../../shared/utils/time_utils';
import { DEFAULT_APM_TIME_RANGE } from '../../common/constants';
import { navigateToServicesList, navigateToSloSuggest } from '../../shared/utils/navigation_utils';

/**
 * Onboarding empty state shown on the SLO listing when the workspace has no
 * SLOs at all (the `noSlosExist` branch).
 *
 * It is a separate component — mounted only in that branch — so the
 * `useServices` discovery query runs *only* when there is genuinely nothing to
 * list, never on the hot path where SLOs already exist.
 *
 * The state steers the user down the fastest path to their first SLO rather
 * than leaving them at a blank page:
 *   - Services discovered → lead with **Suggest SLOs**, which auto-drafts
 *     availability + latency objectives for each service so the user reviews
 *     and creates a whole batch in one step.
 *   - No services yet → Suggest SLOs has nothing to draft against, so guide the
 *     user to **set up services** first (send trace data), then come back.
 *
 * "Create manually" stays available as the secondary path in both cases.
 */
export const SloNoSlosEmptyState: React.FC = () => {
  // Discovery window: SLO onboarding has no time picker of its own, so use the
  // shared APM default. Memoized once at mount — `parseTimeRange` resolves the
  // relative bounds to concrete Dates, and we don't want the window drifting
  // (and re-firing the query) on every render.
  const parsedTimeRange = useMemo(() => parseTimeRange(DEFAULT_APM_TIME_RANGE), []);

  const {
    data: services,
    isLoading: servicesLoading,
    error: servicesError,
  } = useServices({
    startTime: parsedTimeRange.startTime,
    endTime: parsedTimeRange.endTime,
  });

  const serviceCount = services?.length ?? 0;
  // While discovery is in flight, optimistically show the Suggest path: the
  // Suggest page has its own no-services / no-datasource handling, so landing
  // there early is harmless and avoids a spinner-then-swap flicker.
  const hasServices = servicesLoading || serviceCount > 0;

  if (hasServices) {
    return (
      <EuiPanel style={{ marginTop: '8px' }} data-test-subj="slosEmptyNoSlos">
        <EuiEmptyPrompt
          iconType="visualizeApp"
          title={
            <h2>
              {i18n.translate('observability.apm.slo.listing.emptyState.title', {
                defaultMessage: 'No SLOs yet',
              })}
            </h2>
          }
          body={
            <p>
              {serviceCount > 0
                ? i18n.translate('observability.apm.slo.listing.emptyState.bodyWithServices', {
                    defaultMessage:
                      'Suggest SLOs reads your {count, plural, one {# discovered service} other {# discovered services}} and drafts availability and latency objectives for each one — review and create them in a single step.',
                    values: { count: serviceCount },
                  })
                : i18n.translate('observability.apm.slo.listing.emptyState.body', {
                    defaultMessage:
                      'Suggest SLOs drafts availability and latency objectives for your APM services automatically — review and create them in a single step.',
                  })}
            </p>
          }
          actions={[
            <EuiButton
              key="suggest"
              fill
              iconType="inspect"
              onClick={() => navigateToSloSuggest([])}
              data-test-subj="slosEmptySuggest"
            >
              {i18n.translate('observability.apm.slo.listing.emptyState.suggest', {
                defaultMessage: 'Suggest SLOs',
              })}
            </EuiButton>,
            <EuiButtonEmpty key="create" href="#/slos/create" data-test-subj="slosCreateEmpty">
              {i18n.translate('observability.apm.slo.listing.emptyState.createManually', {
                defaultMessage: 'Create manually',
              })}
            </EuiButtonEmpty>,
          ]}
        />
      </EuiPanel>
    );
  }

  // No services discovered (or discovery failed). SLOs describe the reliability
  // of APM services and Suggest SLOs needs services to draft against, so the
  // best next step is to get services reporting first.
  return (
    <EuiPanel style={{ marginTop: '8px' }} data-test-subj="slosEmptyNoServices">
      <EuiEmptyPrompt
        iconType="wrench"
        title={
          <h2>
            {i18n.translate('observability.apm.slo.listing.emptyNoServices.title', {
              defaultMessage: 'Set up services to get started',
            })}
          </h2>
        }
        body={
          <p>
            {servicesError
              ? i18n.translate('observability.apm.slo.listing.emptyNoServices.errorBody', {
                  defaultMessage:
                    'SLOs track the reliability of your APM services. We could not load your services just now — open Services to check your APM setup, then come back to auto-draft SLOs with Suggest SLOs.',
                })
              : i18n.translate('observability.apm.slo.listing.emptyNoServices.body', {
                  defaultMessage:
                    'SLOs track the reliability of your APM services. Set up service monitoring and send trace data first — then Suggest SLOs can auto-draft availability and latency objectives for each service.',
                })}
          </p>
        }
        actions={[
          <EuiButton
            key="services"
            fill
            onClick={navigateToServicesList}
            data-test-subj="slosEmptyGoToServices"
          >
            {i18n.translate('observability.apm.slo.listing.emptyNoServices.goToServices', {
              defaultMessage: 'Set up services',
            })}
          </EuiButton>,
          <EuiButtonEmpty key="create" href="#/slos/create" data-test-subj="slosCreateEmpty">
            {i18n.translate('observability.apm.slo.listing.emptyState.createManually', {
              defaultMessage: 'Create manually',
            })}
          </EuiButtonEmpty>,
        ]}
      />
    </EuiPanel>
  );
};
