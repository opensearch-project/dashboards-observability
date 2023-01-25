/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './index.scss';

import { concat, from, Observable } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import {
  AppMountParameters,
  CoreSetup,
  CoreStart,
  DEFAULT_APP_CATEGORIES,
  Plugin,
  PluginInitializerContext,
} from '../../../src/core/public';
import { Home as AppAnalytics } from './components/application_analytics/home';

import {
  observabilityID,
  observabilityPluginOrder,
  observabilityTitle,
} from '../common/constants/shared';
import PPLService from './services/requests/ppl';
import DSLService from './services/requests/dsl';
import TimestampUtils from './services/timestamp/timestamp';
import SavedObjects from './services/saved_objects/event_analytics/saved_objects';
import { AppPluginStartDependencies } from './types';
import { convertLegacyNotebooksUrl } from './components/notebooks/components/helpers/legacy_route_helpers';
import { convertLegacyTraceAnalyticsUrl } from './components/trace_analytics/components/common/legacy_route_helpers';
import { uiSettingsService } from '../common/utils';
import { DashboardListItem } from './types';
import { fetchAppsList } from './components/application_analytics/helpers/utils';
import { fetchNotebooksList } from './components/notebooks/components/helpers/utils';
import { QueryManager } from '../common/query_manager';
import { DashboardSetup } from '../../../src/plugins/dashboard/public';

export class ObservabilityPlugin {
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

    // Fetches all saved Applications
    const fetchApplicationAnalytics: (
      search?: string,
      size?: number
    ) => Observable<DashboardListItem> = () => {
      return from(fetchAppsList(core.http)).pipe(
        map(convertAppAnalyticToDashboardListItem),
        catchError((err) => {
          return from([]);
        })
      );
    };

    // Fetches all saved Custom Panels
    const fetchNotebooks = () => {
      return from(fetchNotebooksList(core.http)).pipe(
        mergeMap((item) => item),
        map(convertNotebookToDashboardListItem),
        catchError((err) => {
          console.error('Issue in fetching the notebooks', err);
          return from([]);
        })
      );
    };

    const convertAppAnalyticToDashboardListItem = (item: any): DashboardListItem => {
      return {
        id: item.id,
        title: item.name,
        type: 'Observability Application',
        description: item.description,
        url: `observability-dashboards#/application_analytics/${item.id}`,
        editUrl: `observability-dashboards#/application_analytics/${item.id}`,
        deleteUrl: undefined,
        listType: 'observability-application',
        updated_at: item.dateModified,
      };
    };

    dashboard.registerDashboardProvider({
      id: 'observability-application',
      listItemsFn: fetchApplicationAnalytics,
      createLinkText: 'Observability Application',
      createUrl: '/app/observability-dashboards#/application_analytics/create',
    });
    //
    // dashboard.registerDashboardItemCreator({
    //   id: 'observaility-panel',
    //   defaultText: 'Operational Panel',
    //   creatorFn: createPanel,
    // });

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
  public start(core: CoreStart): {} {
    return {};
  }
  public stop() {}
}
