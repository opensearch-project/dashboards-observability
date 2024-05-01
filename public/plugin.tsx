/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { i18n } from '@osd/i18n';
import { htmlIdGenerator } from '@elastic/eui';
import {
  AppCategory,
  AppMountParameters,
  CoreSetup,
  CoreStart,
  DEFAULT_APP_CATEGORIES,
  Plugin,
  PluginInitializerContext,
  SavedObject,
} from '../../../src/core/public';
import { toMountPoint } from '../../../src/plugins/opensearch_dashboards_react/public/';
import { createGetterSetter } from '../../../src/plugins/opensearch_dashboards_utils/public';
import { CREATE_TAB_PARAM, CREATE_TAB_PARAM_KEY, TAB_CHART_ID } from '../common/constants/explorer';
import {
  DATACONNECTIONS_BASE,
  S3_DATASOURCE_TYPE,
  SECURITY_PLUGIN_ACCOUNT_API,
  observabilityApplicationsID,
  observabilityApplicationsPluginOrder,
  observabilityApplicationsTitle,
  observabilityDataConnectionsID,
  observabilityDataConnectionsPluginOrder,
  observabilityDataConnectionsTitle,
  observabilityIntegrationsID,
  observabilityIntegrationsPluginOrder,
  observabilityIntegrationsTitle,
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
  observabilityPluginOrder,
  observabilityTracesID,
  observabilityTracesPluginOrder,
  observabilityTracesTitle,
} from '../common/constants/shared';
import { QueryManager } from '../common/query_manager';
import { AssociatedObject, CachedAcceleration } from '../common/types/data_connections';
import { VISUALIZATION_SAVED_OBJECT } from '../common/types/observability_saved_object_attributes';
import {
  setOSDHttp,
  setOSDSavedObjectsClient,
  setPPLService,
  uiSettingsService,
} from '../common/utils';
import { DirectSearch } from './components/common/search/direct_search';
import { Search } from './components/common/search/search';
import { AccelerationDetailsFlyout } from './components/datasources/components/manage/accelerations/acceleration_details_flyout';
import { CreateAcceleration } from './components/datasources/components/manage/accelerations/create_accelerations_flyout';
import { AssociatedObjectsDetailsFlyout } from './components/datasources/components/manage/associated_objects/associated_objects_details_flyout';
import { convertLegacyNotebooksUrl } from './components/notebooks/components/helpers/legacy_route_helpers';
import { convertLegacyTraceAnalyticsUrl } from './components/trace_analytics/components/common/legacy_route_helpers';
import { registerAsssitantDependencies } from './dependencies/register_assistant';
import {
  OBSERVABILITY_EMBEDDABLE,
  OBSERVABILITY_EMBEDDABLE_DESCRIPTION,
  OBSERVABILITY_EMBEDDABLE_DISPLAY_NAME,
  OBSERVABILITY_EMBEDDABLE_ICON,
  OBSERVABILITY_EMBEDDABLE_ID,
} from './embeddable/observability_embeddable';
import { ObservabilityEmbeddableFactoryDefinition } from './embeddable/observability_embeddable_factory';
import { catalogRequestIntercept } from './framework/catalog_cache/cache_intercept';
import {
  useLoadAccelerationsToCache,
  useLoadDatabasesToCache,
  useLoadTableColumnsToCache,
  useLoadTablesToCache,
} from './framework/catalog_cache/cache_loader';
import { CatalogCacheManager } from './framework/catalog_cache/cache_manager';
import { coreRefs } from './framework/core_refs';
import { DataSourcePluggable } from './framework/datasource_pluggables/datasource_pluggable';
import { S3DataSource } from './framework/datasources/s3_datasource';
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
import {
  DATA_SOURCE_TYPES,
  OBS_S3_DATA_SOURCE,
  S3_DATA_SOURCE_GROUP_DISPLAY_NAME,
  S3_DATA_SOURCE_GROUP_SPARK_DISPLAY_NAME,
} from '../common/constants/data_sources';

interface PublicConfig {
  query_assist: {
    enabled: boolean;
  };
  summarize: {
    enabled: boolean;
  };
}

export const [
  getRenderAccelerationDetailsFlyout,
  setRenderAccelerationDetailsFlyout,
] = createGetterSetter<
  (
    acceleration: CachedAcceleration,
    dataSourceName: string,
    handleRefresh?: () => void,
    dataSourceMDSId?: string
  ) => void
>('renderAccelerationDetailsFlyout');

export const [
  getRenderAssociatedObjectsDetailsFlyout,
  setRenderAssociatedObjectsDetailsFlyout,
] = createGetterSetter<
  (
    tableDetail: AssociatedObject,
    datasourceName: string,
    handleRefresh?: () => void,
    dataSourceMDSId?: string
  ) => void
>('renderAssociatedObjectsDetailsFlyout');

export const [
  getRenderCreateAccelerationFlyout,
  setRenderCreateAccelerationFlyout,
] = createGetterSetter<
  (
    dataSource: string,
    dataSourceMDSId?: string,
    databaseName?: string,
    tableName?: string,
    handleRefresh?: () => void
  ) => void
>('renderCreateAccelerationFlyout');

export class ObservabilityPlugin
  implements
    Plugin<ObservabilitySetup, ObservabilityStart, SetupDependencies, AppPluginStartDependencies> {
  private config: PublicConfig;
  constructor(initializerContext: PluginInitializerContext) {
    this.config = initializerContext.config.get<PublicConfig>();
  }

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
      const { dataSourceManagement } = setupDeps;
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
        dataSourcePluggables, // just pass down for now due to time constraint, later may better expose this as context
        dataSourceManagement,
        coreStart.savedObjects
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

    core.application.register({
      id: observabilityDataConnectionsID,
      title: observabilityDataConnectionsTitle,
      category: DEFAULT_APP_CATEGORIES.management,
      order: observabilityDataConnectionsPluginOrder,
      mount: appMountWithStartPage('dataconnections'),
    });

    setupDeps.managementOverview?.register({
      id: observabilityDataConnectionsID,
      title: observabilityDataConnectionsTitle,
      order: 9070,
      description: i18n.translate('observability.dataconnectionsDescription', {
        defaultMessage: 'Manage compatible data connections with OpenSearch Dashboards.',
      }),
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

    registerAsssitantDependencies(setupDeps.assistantDashboards);

    // Return methods that should be available to other plugins
    return {};
  }

  public start(core: CoreStart, startDeps: AppPluginStartDependencies): ObservabilityStart {
    const pplService: PPLService = new PPLService(core.http);
    const dslService = new DSLService(core.http);

    coreRefs.core = core;
    coreRefs.http = core.http;
    coreRefs.savedObjectsClient = core.savedObjects.client;
    coreRefs.pplService = pplService;
    coreRefs.dslService = dslService;
    coreRefs.toasts = core.notifications.toasts;
    coreRefs.chrome = core.chrome;
    coreRefs.dataSources = startDeps.data.dataSources;
    coreRefs.application = core.application;
    coreRefs.dashboard = startDeps.dashboard;
    coreRefs.queryAssistEnabled = this.config.query_assist.enabled;
    coreRefs.summarizeEnabled = this.config.summarize.enabled;
    coreRefs.overlays = core.overlays;
    coreRefs.dataSource = startDeps.dataSource;

    const { dataSourceService, dataSourceFactory } = startDeps.data.dataSources;
    dataSourceFactory.registerDataSourceType(S3_DATA_SOURCE_TYPE, S3DataSource);

    const getDataSourceTypeLabel = (type: string) => {
      if (type === DATA_SOURCE_TYPES.S3Glue) return S3_DATA_SOURCE_GROUP_DISPLAY_NAME;
      if (type === DATA_SOURCE_TYPES.SPARK) return S3_DATA_SOURCE_GROUP_SPARK_DISPLAY_NAME;
      return `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
    };

    // register all s3 datasources
    const registerDataSources = () => {
      try {
        core.http.get(`${DATACONNECTIONS_BASE}`).then((s3DataSources) => {
          s3DataSources.map((s3ds) => {
            dataSourceService.registerDataSource(
              dataSourceFactory.getDataSourceInstance(S3_DATA_SOURCE_TYPE, {
                id: htmlIdGenerator(OBS_S3_DATA_SOURCE)(),
                name: s3ds.name,
                type: s3ds.connector.toLowerCase(),
                metadata: {
                  ...s3ds.properties,
                  ui: {
                    label: s3ds.name,
                    typeLabel: getDataSourceTypeLabel(s3ds.connector.toLowerCase()),
                    groupType: s3ds.connector.toLowerCase(),
                    selector: {
                      displayDatasetsAsSource: false,
                    },
                  },
                },
              })
            );
          });
        });
      } catch (error) {
        console.error('Error registering S3 datasources', error);
      }
    };

    dataSourceService.registerDataSourceFetchers([
      { type: S3_DATA_SOURCE_TYPE, registerDataSources },
    ]);

    if (startDeps.securityDashboards) {
      core.http
        .get(SECURITY_PLUGIN_ACCOUNT_API)
        .then(() => {
          registerDataSources();
        })
        .catch((e) => {
          if (e?.response?.status !== 401) {
            // accounts api should not return any error status other than 401 if security installed,
            // this datasource register is included just in case
            registerDataSources();
          }
        });
    } else {
      registerDataSources();
    }

    core.http.intercept({
      request: catalogRequestIntercept(),
    });

    // Use overlay service to render flyouts
    const renderAccelerationDetailsFlyout = (
      acceleration: CachedAcceleration,
      dataSourceName: string,
      handleRefresh?: () => void,
      dataSourceMDSId?: string
    ) => {
      const accelerationDetailsFlyout = core.overlays.openFlyout(
        toMountPoint(
          <AccelerationDetailsFlyout
            acceleration={acceleration}
            dataSourceName={dataSourceName}
            resetFlyout={() => accelerationDetailsFlyout.close()}
            handleRefresh={handleRefresh}
            dataSourceMDSId={dataSourceMDSId}
          />
        )
      );
    };
    setRenderAccelerationDetailsFlyout(renderAccelerationDetailsFlyout);

    const renderAssociatedObjectsDetailsFlyout = (
      tableDetail: AssociatedObject,
      datasourceName: string,
      handleRefresh?: () => void,
      dataSourceMDSId?: string
    ) => {
      const associatedObjectsDetailsFlyout = core.overlays.openFlyout(
        toMountPoint(
          <AssociatedObjectsDetailsFlyout
            tableDetail={tableDetail}
            datasourceName={datasourceName}
            resetFlyout={() => associatedObjectsDetailsFlyout.close()}
            handleRefresh={handleRefresh}
            dataSourceMDSId={dataSourceMDSId}
          />
        )
      );
    };
    setRenderAssociatedObjectsDetailsFlyout(renderAssociatedObjectsDetailsFlyout);

    const renderCreateAccelerationFlyout = (
      selectedDatasource: string,
      dataSourceMDSId?: string,
      databaseName?: string,
      tableName?: string,
      handleRefresh?: () => void
    ) => {
      const createAccelerationFlyout = core.overlays.openFlyout(
        toMountPoint(
          <CreateAcceleration
            selectedDatasource={selectedDatasource}
            resetFlyout={() => createAccelerationFlyout.close()}
            databaseName={databaseName}
            tableName={tableName}
            refreshHandler={handleRefresh}
            dataSourceMDSId={dataSourceMDSId}
          />
        )
      );
    };
    setRenderCreateAccelerationFlyout(renderCreateAccelerationFlyout);

    const CatalogCacheManagerInstance = CatalogCacheManager;
    const useLoadDatabasesToCacheHook = useLoadDatabasesToCache;
    const useLoadTablesToCacheHook = useLoadTablesToCache;
    const useLoadTableColumnsToCacheHook = useLoadTableColumnsToCache;
    const useLoadAccelerationsToCacheHook = useLoadAccelerationsToCache;
    // Export so other plugins can use this flyout
    return {
      renderAccelerationDetailsFlyout,
      renderAssociatedObjectsDetailsFlyout,
      renderCreateAccelerationFlyout,
      CatalogCacheManagerInstance,
      useLoadDatabasesToCacheHook,
      useLoadTablesToCacheHook,
      useLoadTableColumnsToCacheHook,
      useLoadAccelerationsToCacheHook,
    };
  }

  public stop() {}
}
