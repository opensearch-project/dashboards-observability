/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './index.scss';
import { i18n } from '@osd/i18n';
import {
  AppCategory,
  AppMountParameters,
  CoreSetup,
  CoreStart,
  DEFAULT_APP_CATEGORIES,
  Plugin,
} from '../../../src/core/public';
import { CREATE_TAB_PARAM, CREATE_TAB_PARAM_KEY, TAB_CHART_ID } from '../common/constants/explorer';

import {
  observabilityApplicationsID,
  observabilityApplicationsPluginOrder,
  observabilityApplicationsTitle,
  observabilityTracesTitle,
  observabilityMetricsID,
  observabilityMetricsPluginOrder,
  observabilityMetricsTitle,
  observabilityNotebookID,
  observabilityNotebookPluginOrder,
  observabilityNotebookTitle,
  observabilityTracesID,
  observabilityTracesPluginOrder,
  observabilityPanelsID,
  observabilityPanelsTitle,
  observabilityPanelsPluginOrder,
  observabilityLogsID,
  observabilityLogsTitle,
  observabilityLogsPluginOrder,
  observabilityIntegrationsID,
  observabilityIntegrationsTitle,
  observabilityIntegrationsPluginOrder,
  observabilityPluginOrder,
  DATACONNECTIONS_BASE,
  S3_DATASOURCE_TYPE,
  observabilityDataConnectionsID,
  observabilityDataConnectionsPluginOrder,
  observabilityDataConnectionsTitle,
} from '../common/constants/shared';
import { QueryManager } from '../common/query_manager';
import { VISUALIZATION_SAVED_OBJECT } from '../common/types/observability_saved_object_attributes';
import {
  setOSDHttp,
  setOSDSavedObjectsClient,
  setPPLService,
  uiSettingsService,
} from '../common/utils';
import { convertLegacyNotebooksUrl } from './components/notebooks/components/helpers/legacy_route_helpers';
import { convertLegacyTraceAnalyticsUrl } from './components/trace_analytics/components/common/legacy_route_helpers';
import { SavedObject } from '../../../src/core/public';
import { coreRefs } from './framework/core_refs';
import {
  OBSERVABILITY_EMBEDDABLE,
  OBSERVABILITY_EMBEDDABLE_DESCRIPTION,
  OBSERVABILITY_EMBEDDABLE_DISPLAY_NAME,
  OBSERVABILITY_EMBEDDABLE_ICON,
  OBSERVABILITY_EMBEDDABLE_ID,
} from './embeddable/observability_embeddable';
import { ObservabilityEmbeddableFactoryDefinition } from './embeddable/observability_embeddable_factory';
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
import { S3DataSource } from './framework/datasources/s3_datasource';
import { DataSourcePluggable } from './framework/datasource_pluggables/datasource_pluggable';
import { DirectSearch } from './components/common/search/sql_search';
import { Search } from './components/common/search/search';

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
        order: observabilityPluginOrder,
      },
    });

    // Adding a variation entails associating a key-value pair, where a change in the key results in
    // a switch of UI/services to its corresponding context. In the following cases, for an S3 datasource,
    // selecting SQL will render SQL-specific UI components or services, while selecting PPL will
    // render a set of UI components or services specific to PPL.
    const openSearchLocalDataSourcePluggable = new DataSourcePluggable().addVariationSet(
      'languages',
      'PPL',
      {
        ui: {
          QueryEditor: null,
          ConfigEditor: null,
          SidePanel: null,
          SearchBar: Search,
        },
        services: {},
      }
    );

    const s3DataSourcePluggable = new DataSourcePluggable()
      .addVariationSet('languages', 'SQL', {
        ui: {
          QueryEditor: null,
          ConfigEditor: null,
          SidePanel: null,
          SearchBar: DirectSearch,
        },
        services: {
          data_fetcher: null,
        },
      })
      .addVariationSet('languages', 'PPL', {
        ui: {
          QueryEditor: null,
          ConfigEditor: null,
          SidePanel: null,
          SearchBar: DirectSearch,
        },
        services: {
          data_fetcher: null,
        },
      });

    // below datasource types is referencing:
    // https://github.com/opensearch-project/sql/blob/feature/job-apis/core/src/main/java/org/opensearch/sql/datasource/model/DataSourceType.java
    const dataSourcePluggables = {
      DEFAULT_INDEX_PATTERNS: openSearchLocalDataSourcePluggable,
      spark: s3DataSourcePluggable,
      s3glue: s3DataSourcePluggable,
      // prometheus: openSearchLocalDataSourcePluggable
    };

    const appMountWithStartPage = (startPage: string) => async (params: AppMountParameters) => {
      const { Observability } = await import('./components/index');
      const [coreStart, depsStart] = await core.getStartServices();
      const dslService = new DSLService(coreStart.http);
      const savedObjects = new SavedObjects(coreStart.http);
      const timestampUtils = new TimestampUtils(dslService, pplService);
      return Observability(
        coreStart,
        depsStart as AppPluginStartDependencies,
        params,
        pplService,
        dslService,
        savedObjects,
        timestampUtils,
        qm,
        startPage,
        dataSourcePluggables // just pass down for now due to time constraint, later may better expose this as context
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

    core.application.register({
      id: observabilityIntegrationsID,
      title: observabilityIntegrationsTitle,
      category: DEFAULT_APP_CATEGORIES.management,
      order: observabilityIntegrationsPluginOrder,
      mount: appMountWithStartPage('integrations'),
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
    const pplService: PPLService = new PPLService(core.http);

    coreRefs.http = core.http;
    coreRefs.savedObjectsClient = core.savedObjects.client;
    coreRefs.pplService = pplService;
    coreRefs.toasts = core.notifications.toasts;
    coreRefs.chrome = core.chrome;
    coreRefs.dataSources = startDeps.data.dataSources;
    coreRefs.application = core.application;

    const { dataSourceService, dataSourceFactory } = startDeps.data.dataSources;

    // register all s3 datasources
    dataSourceFactory.registerDataSourceType(S3_DATASOURCE_TYPE, S3DataSource);
    core.http.get(`${DATACONNECTIONS_BASE}`).then((s3DataSources) => {
      s3DataSources.map((s3ds) => {
        dataSourceService.registerDataSource(
          dataSourceFactory.getDataSourceInstance(S3_DATASOURCE_TYPE, {
            name: s3ds.name,
            type: s3ds.connector.toLowerCase(),
            metadata: s3ds,
          })
        );
      });
    });

    return {};
  }

  public stop() {}
}
