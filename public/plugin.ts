/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './index.scss';

import {
  AppMountParameters,
  CoreSetup,
  CoreStart,
  Plugin,
  PluginInitializerContext,
} from '../../../src/core/public';
import {
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
import { coreRefs } from './framework/core_refs';

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

    core.application.register({
      id: observabilityID,
      title: observabilityTitle,
      category: {
        id: 'opensearch',
        label: 'OpenSearch Plugins',
        order: 2000,
      },
      order: observabilityPluginOrder,
      async mount(params: AppMountParameters) {
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
          qm
        );
      },
    });

    // Return methods that should be available to other plugins
    return {};
  }
  public start(core: CoreStart): ObservabilityStart {
    const pplService: PPLService = new PPLService(core.http);

    coreRefs.http = core.http;
    coreRefs.savedObjectsClient = core.savedObjects.client;
    coreRefs.pplService = pplService;

    return {};
  }
  public stop() {}
}
