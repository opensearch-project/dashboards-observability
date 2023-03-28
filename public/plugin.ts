/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './index.scss';

import {
  AppMountParameters,
  CoreSetup,
  CoreStart,
  DEFAULT_APP_CATEGORIES,
  Plugin,
  PluginInitializerContext,
} from '../../../src/core/public';
import {
  observabilityApplicationsID,
  observabilityApplicationsPluginOrder,
  observabilityApplicationsTitle,
  observabilityEventsID,
  observabilityEventsPluginOrder,
  observabilityEventsTitle,
  observabilityID,
  observabilityPluginOrder,
  observabilityTitle,
} from '../common/constants/shared';
import PPLService from './services/requests/ppl';
import DSLService from './services/requests/dsl';
import TimestampUtils from './services/timestamp/timestamp';
import SavedObjects from './services/saved_objects/event_analytics/saved_objects';
import { AppPluginStartDependencies, ObservabilitySetup, ObservabilityStart } from './types';
import { convertLegacyNotebooksUrl } from './components/notebooks/components/helpers/legacy_route_helpers';
import { convertLegacyTraceAnalyticsUrl } from './components/trace_analytics/components/common/legacy_route_helpers';
import { uiSettingsService } from '../common/utils';
import { QueryManager } from '../common/query_manager';
import { DashboardSetup } from '../../../src/plugins/dashboard/public';
import { SavedObject } from '../../../src/core/public';

export class ObservabilityPlugin implements Plugin<ObservabilitySetup, ObservabilityStart> {
  constructor(private initializerContext: PluginInitializerContext) {}

  public setup(core: CoreSetup, { dashboard }: { dashboard: DashboardSetup }): {} {
    uiSettingsService.init(core.uiSettings, core.notifications);

    // redirect legacy notebooks URL to current URL under observability
    if (window.location.pathname.includes('notebooks-dashboards')) {
      window.location.assign(convertLegacyNotebooksUrl(window.location));
    }

    // redirect legacy trace analytics URL to current URL under observability
    if (window.location.pathname.includes('trace-analytics-dashboards')) {
      window.location.assign(convertLegacyTraceAnalyticsUrl(window.location));
    }

    const id: string = this.initializerContext.opaqueId.description!;

    dashboard.registerDashboardProvider({
      appId: 'observability-panel',
      savedObjectsType: 'observability-panel',
      savedObjectsName: 'Observability Panel',
      editUrlPathFn: (obj: SavedObject) =>
        `/app/observability-dashboards#/operational_panels/${obj.id}/edit`,
      viewUrlPathFn: (obj: SavedObject) =>
        `/app/observability-dashboards#/operational_panels/${obj.id}`,
      createLinkText: 'Observability Panel',
      createSortText: 'Observability Panel',
      createUrl: '/app/observability-dashboards#/operational_panels/create',
    });

    const appMountWithStartPage = (startPage?: string) => async (params: AppMountParameters) => {
      const { Observability } = await import('./components/index');
      const [coreStart, depsStart] = await core.getStartServices();
      const pplService = new PPLService(coreStart.http);
      const dslService = new DSLService(coreStart.http);
      const savedObjects = new SavedObjects(coreStart.http);
      const timestampUtils = new TimestampUtils(dslService, pplService);
      const qm = new QueryManager();

      return Observability(
        coreStart,
        depsStart as AppPluginStartDependencies,
        params,
        pplService,
        dslService,
        savedObjects,
        timestampUtils,
        qm,
        startPage
      );
    };

    core.application.register({
      id: observabilityApplicationsID,
      title: observabilityApplicationsTitle,
      category: DEFAULT_APP_CATEGORIES.observability,
      order: observabilityApplicationsPluginOrder,
      mount: appMountWithStartPage('/application_analytics'),
    });

    core.application.register({
      id: observabilityEventsID,
      title: observabilityEventsTitle,
      category: DEFAULT_APP_CATEGORIES.observability,
      order: observabilityEventsPluginOrder,
      mount: appMountWithStartPage('/event_analytics'),
    });

    core.application.register({
      id: observabilityID,
      title: observabilityTitle,
      category: DEFAULT_APP_CATEGORIES.plugins,
      order: observabilityPluginOrder,
      mount: appMountWithStartPage(),
    });

    // Return methods that should be available to other plugins
    return {};
  }
  public start(core: CoreStart): ObservabilityStart {
    return {};
  }
  public stop() {}
}
