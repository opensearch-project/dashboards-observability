/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';
import { NavPopoverConfig } from '../../../../src/core/public';
import {
  observabilityApmServicesID,
  observabilityApmApplicationMapID,
  observabilityApmSloID,
} from '../../common/constants/apm';
import { observabilityAlertingID } from '../../common/constants/shared';

/**
 * Hash marker query that asks an APM page to open its "APM settings" modal once
 * mounted. A nav-popover action only receives navigateToApp (not overlays), so
 * it navigates with this marker and the page opens the modal on arrival.
 *
 * The marker is appended to each app's CONCRETE landing route (e.g.
 * `#/services?_apmSettings=true`, `#/application-map?_apmSettings=true`) rather
 * than the bare `#/`. The Services app's HashRouter redirects an unmatched `/`
 * to `/services` and that redirect drops the query — taking the marker with it
 * before the page can read it. Landing directly on the matched route avoids the
 * redirect, so the marker survives.
 */
const APM_SETTINGS_QUERY = '?_apmSettings=true';

/**
 * Topology Map nav-item popover: jump to the topology page or open APM settings.
 * The item still navigates to the topology page on direct click.
 */
export const topologyMapNavPopover: NavPopoverConfig = {
  actions: [
    {
      id: 'viewTopology',
      label: i18n.translate('observability.navPopover.viewTopology', {
        defaultMessage: 'View topology',
      }),
      iconType: 'navAiFlow',
      onClick: ({ navigateToApp }) =>
        navigateToApp(observabilityApmApplicationMapID, { path: '#/application-map' }),
    },
    {
      id: 'apmSettings',
      label: i18n.translate('observability.navPopover.apmSettings', {
        defaultMessage: 'APM settings',
      }),
      iconType: 'gear',
      onClick: ({ navigateToApp }) =>
        navigateToApp(observabilityApmApplicationMapID, {
          path: `#/application-map${APM_SETTINGS_QUERY}`,
        }),
    },
  ],
};

/**
 * Services nav-item popover: jump to the services page or open APM settings.
 * The item still navigates to the services page on direct click.
 */
export const servicesNavPopover: NavPopoverConfig = {
  actions: [
    {
      id: 'viewServices',
      label: i18n.translate('observability.navPopover.viewServices', {
        defaultMessage: 'View services',
      }),
      iconType: 'navServiceMap',
      onClick: ({ navigateToApp }) =>
        navigateToApp(observabilityApmServicesID, { path: '#/services' }),
    },
    {
      id: 'apmSettings',
      label: i18n.translate('observability.navPopover.apmSettingsServices', {
        defaultMessage: 'APM settings',
      }),
      iconType: 'gear',
      onClick: ({ navigateToApp }) =>
        navigateToApp(observabilityApmServicesID, { path: `#/services${APM_SETTINGS_QUERY}` }),
    },
  ],
};

/**
 * SLOs nav-item popover: view the SLO list or create a new SLO. The item still
 * navigates to the SLO list on direct click.
 */
export const sloNavPopover: NavPopoverConfig = {
  actions: [
    {
      id: 'viewSlos',
      label: i18n.translate('observability.navPopover.viewSlos', {
        defaultMessage: 'View SLOs',
      }),
      iconType: 'visGauge',
      onClick: ({ navigateToApp }) => navigateToApp(observabilityApmSloID, { path: '#/slos' }),
    },
    {
      id: 'createSlo',
      label: i18n.translate('observability.navPopover.createSlo', {
        defaultMessage: 'Create SLO',
      }),
      iconType: 'plusInCircle',
      onClick: ({ navigateToApp }) =>
        navigateToApp(observabilityApmSloID, { path: '#/slos/create' }),
    },
  ],
};

/**
 * Alerting nav-item popover: jump to the Alerts, Rules, or Routing tab. The item
 * still navigates to the alerting page (Alerts tab) on direct click.
 */
export const alertingNavPopover: NavPopoverConfig = {
  actions: [
    {
      id: 'viewAlerts',
      label: i18n.translate('observability.navPopover.viewAlerts', {
        defaultMessage: 'View alerts',
      }),
      iconType: 'bell',
      onClick: ({ navigateToApp }) => navigateToApp(observabilityAlertingID, { path: '#/alerts' }),
    },
    {
      id: 'viewRules',
      label: i18n.translate('observability.navPopover.viewRules', {
        defaultMessage: 'Rules',
      }),
      iconType: 'list',
      onClick: ({ navigateToApp }) => navigateToApp(observabilityAlertingID, { path: '#/rules' }),
    },
    {
      id: 'viewRouting',
      label: i18n.translate('observability.navPopover.viewRouting', {
        defaultMessage: 'Routing',
      }),
      iconType: 'branch',
      onClick: ({ navigateToApp }) => navigateToApp(observabilityAlertingID, { path: '#/routing' }),
    },
  ],
};
