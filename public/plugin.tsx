/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';
import React from 'react';
import {
  AppCategory,
  AppMountParameters,
  CoreSetup,
  CoreStart,
  Plugin,
  SavedObject,
} from '../../../src/core/public';
import { toMountPoint } from '../../../src/plugins/opensearch_dashboards_react/public';
import { CREATE_TAB_PARAM, CREATE_TAB_PARAM_KEY, TAB_CHART_ID } from '../common/constants/explorer';
import {
  observabilityApplicationsID,
  observabilityApplicationsPluginOrder,
  observabilityApplicationsTitle,
  observabilityLogsID,
  observabilityLogsPluginOrder,
  observabilityLogsTitle,
  observabilityMetricsID,
  observabilityMetricsPluginOrder,
  observabilityMetricsTitle,
  observabilityNotebookID,
  observabilityNotebookPluginOrder,
  observabilityNotebookTitle,
  observabilityPanelsID,
  observabilityPanelsPluginOrder,
  observabilityPanelsTitle,
  observabilityTracesID,
  observabilityTracesPluginOrder,
  observabilityTracesTitle,
} from '../common/constants/shared';
import { QueryManager } from '../common/query_manager';
import { VISUALIZATION_SAVED_OBJECT } from '../common/types/observability_saved_object_attributes';
import {
  setOSDHttp,
  setOSDSavedObjectsClient,
  setPPLService,
  uiSettingsService,
} from '../common/utils';
import { CoreServicesContext, HeaderChatButton } from './components/llm_chat/header_chat_button';
import { convertLegacyNotebooksUrl } from './components/notebooks/components/helpers/legacy_route_helpers';
import { convertLegacyTraceAnalyticsUrl } from './components/trace_analytics/components/common/legacy_route_helpers';
// export class ObservabilityPlugin implements Plugin<ObservabilitySetup, ObservabilityStart> {
//   constructor(private initializerContext: PluginInitializerContext) {}
//   public setup(core: CoreSetup, { dashboard }: { dashboard: DashboardSetup }): {} {
import {
  OBSERVABILITY_EMBEDDABLE,
  OBSERVABILITY_EMBEDDABLE_DESCRIPTION,
  OBSERVABILITY_EMBEDDABLE_DISPLAY_NAME,
  OBSERVABILITY_EMBEDDABLE_ICON,
  OBSERVABILITY_EMBEDDABLE_ID,
} from './embeddable/observability_embeddable';
import { ObservabilityEmbeddableFactoryDefinition } from './embeddable/observability_embeddable_factory';
import { coreRefs } from './framework/core_refs';
import './index.scss';
import DSLService from './services/requests/dsl';
import PPLService from './services/requests/ppl';
import SavedObjects from './services/saved_objects/event_analytics/saved_objects';
import TimestampUtils from './services/timestamp/timestamp';
import {
  AppPluginStartDependencies,
  ObservabilitySetup,
  ObservabilityStart,
  SetupDependencies,
} from './types';

export class ObservabilityPlugin
  implements
    Plugin<ObservabilitySetup, ObservabilityStart, SetupDependencies, AppPluginStartDependencies> {
  public setup(
    core: CoreSetup<AppPluginStartDependencies>,
    setupDeps: SetupDependencies
  ): ObservabilitySetup {
    uiSettingsService.init(core.uiSettings, core.notifications);
    const pplService = new PPLService(core.http);
    const qm = new QueryManager();
    setPPLService(pplService);
    setOSDHttp(core.http);
    core.getStartServices().then(([coreStart]) => {
      setOSDSavedObjectsClient(coreStart.savedObjects.client);
    });

    // redirect legacy notebooks URL to current URL under observability
    if (window.location.pathname.includes('notebooks-dashboards')) {
      window.location.assign(convertLegacyNotebooksUrl(window.location));
    }

    // redirect legacy trace analytics URL to current URL under observability
    if (window.location.pathname.includes('trace-analytics-dashboards')) {
      window.location.assign(convertLegacyTraceAnalyticsUrl(window.location));
    }

    // // redirect legacy notebooks URL to current URL under observability
    // if (window.location.pathname.includes('application_analytics')) {
    //   window.location.assign(convertLegacyAppAnalyticsUrl(window.location));
    // }
    const BASE_URL = core.http.basePath.prepend('/app/observability-dashboards#');
    setupDeps.dashboard.registerDashboardProvider({
      appId: 'observability-panel',
      savedObjectsType: 'observability-panel',
      savedObjectsName: 'Observability',
      editUrlPathFn: (obj: SavedObject) => `${BASE_URL}/${obj.id}/edit`,
      viewUrlPathFn: (obj: SavedObject) => `${BASE_URL}/${obj.id}`,
      createLinkText: 'Observability Dashboard',
      createSortText: 'Observability Dashboard',
      createUrl: `${BASE_URL}/create`,
    });

    const OBSERVABILITY_APP_CATEGORIES: Record<string, AppCategory> = Object.freeze({
      observability: {
        id: 'observability',
        label: i18n.translate('core.ui.observabilityNavList.label', {
          defaultMessage: 'Observability',
        }),
        order: 1500,
      },
    });

    const appMountWithStartPage = (startPage: string) => async (params: AppMountParameters) => {
      const { Observability } = await import('./components/index');
      const [coreStart, depsStart] = await core.getStartServices();
      const dslService = new DSLService(coreStart.http);
      const savedObjects = new SavedObjects(coreStart.http);
      const timestampUtils = new TimestampUtils(dslService, pplService);

      return Observability(
        coreStart,
        depsStart,
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
      category: OBSERVABILITY_APP_CATEGORIES.observability,
      order: observabilityApplicationsPluginOrder,
      mount: appMountWithStartPage('applications'),
    });

    core.application.register({
      id: observabilityLogsID,
      title: observabilityLogsTitle,
      category: OBSERVABILITY_APP_CATEGORIES.observability,
      order: observabilityLogsPluginOrder,
      mount: appMountWithStartPage('logs'),
    });

    core.application.register({
      id: observabilityMetricsID,
      title: observabilityMetricsTitle,
      category: OBSERVABILITY_APP_CATEGORIES.observability,
      order: observabilityMetricsPluginOrder,
      mount: appMountWithStartPage('metrics'),
    });

    core.application.register({
      id: observabilityTracesID,
      title: observabilityTracesTitle,
      category: OBSERVABILITY_APP_CATEGORIES.observability,
      order: observabilityTracesPluginOrder,
      mount: appMountWithStartPage('traces'),
    });

    core.application.register({
      id: observabilityNotebookID,
      title: observabilityNotebookTitle,
      category: OBSERVABILITY_APP_CATEGORIES.observability,
      order: observabilityNotebookPluginOrder,
      mount: appMountWithStartPage('notebooks'),
    });

    core.application.register({
      id: observabilityPanelsID,
      title: observabilityPanelsTitle,
      category: OBSERVABILITY_APP_CATEGORIES.observability,
      order: observabilityPanelsPluginOrder,
      mount: appMountWithStartPage('dashboards'),
    });

    const embeddableFactory = new ObservabilityEmbeddableFactoryDefinition(async () => ({
      getAttributeService: (await core.getStartServices())[1].dashboard.getAttributeService,
      savedObjectsClient: (await core.getStartServices())[0].savedObjects.client,
      overlays: (await core.getStartServices())[0].overlays,
    }));
    setupDeps.embeddable.registerEmbeddableFactory(OBSERVABILITY_EMBEDDABLE, embeddableFactory);

    setupDeps.visualizations.registerAlias({
      name: OBSERVABILITY_EMBEDDABLE_ID,
      title: OBSERVABILITY_EMBEDDABLE_DISPLAY_NAME,
      description: OBSERVABILITY_EMBEDDABLE_DESCRIPTION,
      icon: OBSERVABILITY_EMBEDDABLE_ICON,
      aliasApp: observabilityLogsID,
      aliasPath: `#/explorer/?${CREATE_TAB_PARAM_KEY}=${CREATE_TAB_PARAM[TAB_CHART_ID]}`,
      stage: 'production',
      appExtensions: {
        visualizations: {
          docTypes: [VISUALIZATION_SAVED_OBJECT],
          toListItem: ({ id, attributes, updated_at: updatedAt }) => ({
            description: attributes?.description,
            editApp: observabilityLogsID,
            editUrl: `#/explorer/${VISUALIZATION_SAVED_OBJECT}:${id}`,
            icon: OBSERVABILITY_EMBEDDABLE_ICON,
            id,
            savedObjectType: VISUALIZATION_SAVED_OBJECT,
            title: attributes?.title,
            typeTitle: OBSERVABILITY_EMBEDDABLE_DISPLAY_NAME,
            stage: 'production',
            updated_at: updatedAt,
          }),
        },
      },
    });

    // Return methods that should be available to other plugins
    return {};
  }

  public start(core: CoreStart, startDeps: AppPluginStartDependencies): ObservabilityStart {
    core.chrome.navControls.registerRight({
      order: 10000,
      mount: toMountPoint(
        <CoreServicesContext.Provider
          value={{
            http: core.http,
            savedObjectsClient: core.savedObjects.client,
            DashboardContainerByValueRenderer:
              startDeps.dashboard.DashboardContainerByValueRenderer,
          }}
        >
          <HeaderChatButton application={core.application} />
        </CoreServicesContext.Provider>
      ),
    });
    // core.chrome.navControls.getRight$().forEach((x) => console.log(x));

    const pplService: PPLService = new PPLService(core.http);
    coreRefs.http = core.http;
    coreRefs.savedObjectsClient = core.savedObjects.client;
    coreRefs.pplService = pplService;

    return {};
  }

  public stop() {}
}
