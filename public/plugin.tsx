/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { htmlIdGenerator } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import React from 'react';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  App,
  AppCategory,
  AppMountParameters,
  AppNavLinkStatus,
  AppUpdater,
  CoreSetup,
  CoreStart,
  DEFAULT_APP_CATEGORIES,
  Plugin,
  PluginInitializerContext,
  SavedObject,
} from '../../../src/core/public';
import { toMountPoint } from '../../../src/plugins/opensearch_dashboards_react/public/';
import { createGetterSetter } from '../../../src/plugins/opensearch_dashboards_utils/public';
import {
  DATA_SOURCE_TYPES,
  OBS_S3_DATA_SOURCE,
  S3_DATA_SOURCE_GROUP_DISPLAY_NAME,
  S3_DATA_SOURCE_GROUP_SPARK_DISPLAY_NAME,
} from '../common/constants/data_sources';
import { CREATE_TAB_PARAM, CREATE_TAB_PARAM_KEY, TAB_CHART_ID } from '../common/constants/explorer';
import {
  DATACONNECTIONS_BASE,
  S3_DATA_SOURCE_TYPE,
  SECURITY_PLUGIN_ACCOUNT_API,
  observabilityApplicationsID,
  observabilityApplicationsPluginOrder,
  observabilityApplicationsTitle,
  observabilityGettingStartedID,
  observabilityGettingStartedPluginOrder,
  observabilityGettingStartedTitle,
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
  observabilityAlertingID,
  observabilityAlertingPluginOrder,
  observabilityAlertingTitle,
  observabilityOverviewID,
  observabilityOverviewPluginOrder,
  observabilityOverviewTitle,
  observabilityPanelsID,
  observabilityPanelsPluginOrder,
  observabilityPanelsTitle,
  observabilityPluginOrder,
  observabilityServicesNewNavID,
  observabilityServicesPluginOrder,
  observabilityServicesTitle,
  observabilityTracesID,
  observabilityTracesNewNavID,
  observabilityTracesPluginOrder,
  observabilityTracesTitle,
} from '../common/constants/shared';
import {
  APM_ENABLED_SETTING,
  observabilityApmServicesID,
  observabilityApmServicesTitle,
  observabilityApmServicesPluginOrder,
  observabilityApmApplicationMapID,
  observabilityApmApplicationMapTitle,
  observabilityApmApplicationMapPluginOrder,
  observabilityApmSloID,
  observabilityApmSloTitle,
  observabilityApmSloPluginOrder,
} from '../common/constants/apm';
import { QueryManager } from '../common/query_manager';
import {
  RenderAccelerationDetailsFlyoutParams,
  RenderAccelerationFlyoutParams,
  RenderAssociatedObjectsDetailsFlyoutParams,
} from '../common/types/data_connections';
import { VISUALIZATION_SAVED_OBJECT } from '../common/types/observability_saved_object_attributes';
import {
  setOSDHttp,
  setOSDSavedObjectsClient,
  setOverviewPage,
  setPPLService,
  uiSettingsService,
} from '../common/utils';
import { DirectSearch } from './components/common/search/direct_search';
import { Search } from './components/common/search/search';
import { AccelerationDetailsFlyout } from './components/datasources/components/manage/accelerations/acceleration_details_flyout';
import { CreateAcceleration } from './components/datasources/components/manage/accelerations/create_accelerations_flyout';
import { AssociatedObjectsDetailsFlyout } from './components/datasources/components/manage/associated_objects/associated_objects_details_flyout';
import { convertLegacyNotebooksUrl } from './components/notebooks/components/helpers/legacy_route_helpers';
import {
  convertLegacyTraceAnalyticsUrl,
  convertTraceAnalyticsNewNavUrl,
} from './components/trace_analytics/components/common/legacy_route_helpers';
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
import { registerAllPluginNavGroups } from './plugin_helpers/plugin_nav';
import { setupOverviewPage } from './plugin_helpers/plugin_overview';
import DSLService from './services/requests/dsl';
import PPLService from './services/requests/ppl';
import { MLCommonsRCFService } from './services/requests/ml_commons_rcf';
import SavedObjects from './services/saved_objects/event_analytics/saved_objects';
import TimestampUtils from './services/timestamp/timestamp';
import {
  AppPluginStartDependencies,
  ObservabilitySetup,
  ObservabilityStart,
  SetupDependencies,
} from './types';

interface PublicConfig {
  query_assist: {
    enabled: boolean;
  };
  summarize: {
    enabled: boolean;
  };
  alertManager: {
    enabled: boolean;
  };
  slo?: {
    enabled: boolean;
  };
}

export const [
  getRenderAccelerationDetailsFlyout,
  setRenderAccelerationDetailsFlyout,
] = createGetterSetter<
  ({
    acceleration,
    dataSourceName,
    handleRefresh,
    dataSourceMDSId,
  }: RenderAccelerationDetailsFlyoutParams) => void
>('renderAccelerationDetailsFlyout');

export const [
  getRenderAssociatedObjectsDetailsFlyout,
  setRenderAssociatedObjectsDetailsFlyout,
] = createGetterSetter<
  ({
    tableDetail,
    dataSourceName,
    handleRefresh,
    dataSourceMDSId,
  }: RenderAssociatedObjectsDetailsFlyoutParams) => void
>('renderAssociatedObjectsDetailsFlyout');

export const [
  getRenderCreateAccelerationFlyout,
  setRenderCreateAccelerationFlyout,
] = createGetterSetter<
  ({
    dataSource,
    dataSourceMDSId,
    databaseName,
    tableName,
    handleRefresh,
  }: RenderAccelerationFlyoutParams) => void
>('renderCreateAccelerationFlyout');

export class ObservabilityPlugin
  implements
    Plugin<ObservabilitySetup, ObservabilityStart, SetupDependencies, AppPluginStartDependencies> {
  private config: PublicConfig;
  constructor(initializerContext: PluginInitializerContext) {
    this.config = initializerContext.config.get<PublicConfig>();
  }
  private mdsFlagStatus: boolean = false;
  private apmEnabled: boolean = false;
  private appUpdater$ = new BehaviorSubject<AppUpdater>(() => ({}));
  private apmAppUpdater$ = new BehaviorSubject<AppUpdater>(() => ({}));
  private traceAnalyticsAppUpdater$ = new BehaviorSubject<AppUpdater>(() => ({}));
  // Updaters for dynamic feature-flag-controlled apps. Visibility is set in
  // `start()` from `capabilities.observability.{alertManagerEnabled,sloEnabled}`,
  // which the server-side switcher resolves from the DynamicConfigService.
  private alertingAppUpdater$ = new BehaviorSubject<AppUpdater>(() => ({}));
  private apmSloAppUpdater$ = new BehaviorSubject<AppUpdater>(() => ({}));

  public async setup(
    core: CoreSetup<AppPluginStartDependencies>,
    setupDeps: SetupDependencies
  ): Promise<ObservabilitySetup> {
    uiSettingsService.init(core.uiSettings, core.notifications);
    const pplService = new PPLService(core.http);
    const qm = new QueryManager();
    setPPLService(pplService);
    setOSDHttp(core.http);
    core.getStartServices().then(([coreStart]) => {
      setOSDSavedObjectsClient(coreStart.savedObjects.client);
    });

    const page = setupOverviewPage(setupDeps.contentManagement!);
    setOverviewPage(page);
    this.mdsFlagStatus = !!setupDeps.dataSource;

    // Read APM enabled setting from GLOBAL scope
    try {
      const apmSettingValue = core.uiSettings.get(APM_ENABLED_SETTING);
      this.apmEnabled = apmSettingValue ?? false;
    } catch (_error) {
      // Handle authentication errors during setup
      this.apmEnabled = false;
    }

    // redirect legacy notebooks URL to current URL under observability
    if (window.location.pathname.includes('notebooks-dashboards')) {
      window.location.assign(convertLegacyNotebooksUrl(window.location));
    }

    // redirect legacy trace analytics URL to current URL under observability
    if (window.location.pathname.includes('trace-analytics-dashboards')) {
      window.location.assign(convertLegacyTraceAnalyticsUrl(window.location));
    }

    // if MDS is not enabled register observability dashboards & PPL visualizations in core
    if (!setupDeps.dataSource) {
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
    }

    const OBSERVABILITY_APP_CATEGORIES: Record<string, AppCategory> = Object.freeze({
      observability: {
        id: 'observability',
        label: i18n.translate('core.ui.observabilityNavList.label', {
          defaultMessage: 'Observability',
        }),
        order: observabilityPluginOrder,
      },
    });

    const APPLICATION_MONITORING_CATEGORY: AppCategory = {
      id: 'applicationMonitoring',
      label: i18n.translate('observability.ui.applicationMonitoringNav.label', {
        defaultMessage: 'Application Monitoring',
      }),
      order: 800,
    };

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

    const appMountWithStartPage = (startPage: string, defaultRoute?: string) => async (
      params: AppMountParameters
    ) => {
      const { Observability } = await import('./components/index');
      const [coreStart, depsStart] = await core.getStartServices();
      const dslService = new DSLService(coreStart.http);
      const savedObjects = new SavedObjects(coreStart.http);
      const timestampUtils = new TimestampUtils(dslService, pplService);
      const { dataSourceManagement } = setupDeps;

      const mlCommonsRCFService = new MLCommonsRCFService(coreStart.http);

      return Observability(
        coreStart,
        depsStart,
        params,
        pplService,
        dslService,
        mlCommonsRCFService,
        savedObjects,
        timestampUtils,
        qm,
        startPage,
        dataSourcePluggables, // just pass down for now due to time constraint, later may better expose this as context
        dataSourceManagement,
        coreStart.savedObjects,
        defaultRoute
      );
    };

    core.application.register({
      id: observabilityMetricsID,
      title: observabilityMetricsTitle,
      category: OBSERVABILITY_APP_CATEGORIES.observability,
      order: observabilityMetricsPluginOrder,
      mount: appMountWithStartPage('metrics'),
    });

    if (!setupDeps.dataSource) {
      core.application.register({
        id: observabilityApplicationsID,
        title: observabilityApplicationsTitle,
        category: OBSERVABILITY_APP_CATEGORIES.observability,
        order: observabilityApplicationsPluginOrder,
        mount: appMountWithStartPage('applications'),
      });
    }

    core.application.register({
      id: observabilityIntegrationsID,
      title: observabilityIntegrationsTitle,
      category: DEFAULT_APP_CATEGORIES.management,
      order: observabilityIntegrationsPluginOrder,
      mount: appMountWithStartPage('integrations'),
    });

    if (core.chrome.navGroup.getNavGroupEnabled()) {
      core.application.register({
        id: observabilityOverviewID,
        title: observabilityOverviewTitle,
        category: DEFAULT_APP_CATEGORIES.observability,
        order: observabilityOverviewPluginOrder,
        mount: appMountWithStartPage('overview'),
      });

      core.application.register({
        id: observabilityGettingStartedID,
        title: observabilityGettingStartedTitle,
        category: DEFAULT_APP_CATEGORIES.observability,
        order: observabilityGettingStartedPluginOrder,
        mount: appMountWithStartPage('gettingStarted'),
      });

      if (this.apmEnabled) {
        // When UI setting enabled, register BOTH sets of apps
        // Visibility controlled by explore.discoverTracesEnabled capability in start()

        // APM apps - visible when traces capability enabled
        core.application.register({
          id: observabilityApmServicesID,
          title: observabilityApmServicesTitle,
          category: APPLICATION_MONITORING_CATEGORY,
          order: observabilityApmServicesPluginOrder,
          mount: appMountWithStartPage('apm-services', '/services'),
          updater$: this.apmAppUpdater$,
        });

        core.application.register({
          id: observabilityApmApplicationMapID,
          title: observabilityApmApplicationMapTitle,
          category: APPLICATION_MONITORING_CATEGORY,
          order: observabilityApmApplicationMapPluginOrder,
          mount: appMountWithStartPage('apm-application-map', '/application-map'),
          updater$: this.apmAppUpdater$,
        });

        // SLO app registers unconditionally. Visibility is controlled at
        // request time by the dynamic capability flag — see the merged
        // updater below. The merge keeps the existing APM-vs-Trace-Analytics
        // gate (driven by `explore.discoverTracesEnabled`) and layers the
        // SLO capability on top so either input can hide the link.
        core.application.register({
          id: observabilityApmSloID,
          title: observabilityApmSloTitle,
          category: APPLICATION_MONITORING_CATEGORY,
          order: observabilityApmSloPluginOrder,
          mount: appMountWithStartPage('apm-slo', '/slos'),
          // Naive spread would let a later `visible` override an earlier
          // `hidden`, so `navLinkStatus` is merged explicitly with `hidden`
          // taking precedence.
          updater$: combineLatest([this.apmAppUpdater$, this.apmSloAppUpdater$]).pipe(
            map(([apmUpdater, sloUpdater]) => (app: App) => {
              // `AppUpdater` may legally return `undefined`; default both
              // to `{}` so the merge below doesn't crash on a no-op
              // updater.
              const apmUpdate = apmUpdater(app) ?? {};
              const sloUpdate = sloUpdater(app) ?? {};
              const eitherHidden =
                apmUpdate.navLinkStatus === AppNavLinkStatus.hidden ||
                sloUpdate.navLinkStatus === AppNavLinkStatus.hidden;
              return {
                ...apmUpdate,
                ...sloUpdate,
                navLinkStatus: eitherHidden
                  ? AppNavLinkStatus.hidden
                  : sloUpdate.navLinkStatus ?? apmUpdate.navLinkStatus,
              };
            })
          ),
        });

        // Trace Analytics apps - visible when traces capability DISABLED (fallback)
        core.application.register({
          id: observabilityTracesNewNavID,
          title: observabilityTracesTitle,
          order: observabilityTracesPluginOrder,
          category: DEFAULT_APP_CATEGORIES.investigate,
          mount: appMountWithStartPage('traces', '/traces'),
          updater$: this.traceAnalyticsAppUpdater$,
        });

        core.application.register({
          id: observabilityServicesNewNavID,
          title: observabilityServicesTitle,
          order: observabilityServicesPluginOrder,
          category: DEFAULT_APP_CATEGORIES.investigate,
          mount: appMountWithStartPage('traces', '/services'),
          updater$: this.traceAnalyticsAppUpdater$,
        });
      } else {
        // UI setting disabled, only Trace Analytics is available (current fallback behavior)
        core.application.register({
          id: observabilityTracesNewNavID,
          title: observabilityTracesTitle,
          order: observabilityTracesPluginOrder,
          category: DEFAULT_APP_CATEGORIES.investigate,
          mount: appMountWithStartPage('traces', '/traces'),
        });

        core.application.register({
          id: observabilityServicesNewNavID,
          title: observabilityServicesTitle,
          order: observabilityServicesPluginOrder,
          category: DEFAULT_APP_CATEGORIES.investigate,
          mount: appMountWithStartPage('traces', '/services'),
        });
      }
    } else {
      // Old navigation - always trace analytics
      core.application.register({
        id: observabilityTracesID,
        title: observabilityTracesTitle,
        category: OBSERVABILITY_APP_CATEGORIES.observability,
        order: observabilityTracesPluginOrder,
        mount: appMountWithStartPage('traces'),
      });
      // deprecated in new Nav Groups and when MDS is enabled.
      if (!setupDeps.dataSource) {
        core.application.register({
          id: observabilityPanelsID,
          title: observabilityPanelsTitle,
          category: OBSERVABILITY_APP_CATEGORIES.observability,
          order: observabilityPanelsPluginOrder,
          mount: appMountWithStartPage('dashboards'),
        });
        core.application.register({
          id: observabilityLogsID,
          title: observabilityLogsTitle,
          category: OBSERVABILITY_APP_CATEGORIES.observability,
          order: observabilityLogsPluginOrder,
          mount: appMountWithStartPage('logs'),
        });
      }
    }

    core.application.register({
      id: observabilityNotebookID,
      title: observabilityNotebookTitle,
      category: OBSERVABILITY_APP_CATEGORIES.observability,
      order: observabilityNotebookPluginOrder,
      mount: appMountWithStartPage('notebooks'),
      updater$: this.appUpdater$,
    });

    // Alerting app registers unconditionally. Visibility flipped in
    // `start()` from `capabilities.observability.alertManagerEnabled`.
    core.application.register({
      id: observabilityAlertingID,
      title: observabilityAlertingTitle,
      category: OBSERVABILITY_APP_CATEGORIES.observability,
      order: observabilityAlertingPluginOrder,
      euiIconType: 'bell',
      mount: appMountWithStartPage('alerting'),
      updater$: this.alertingAppUpdater$,
    });

    // Register the alerting + SLO nav-group entries unconditionally; their
    // visibility is governed by `capabilities.observability.{alertManagerEnabled,sloEnabled}`
    // through the per-app updaters set up above.
    registerAllPluginNavGroups(core, this.apmEnabled, APPLICATION_MONITORING_CATEGORY, true, true);

    const embeddableFactory = new ObservabilityEmbeddableFactoryDefinition(async () => ({
      getAttributeService: (await core.getStartServices())[1].dashboard.getAttributeService,
      savedObjectsClient: (await core.getStartServices())[0].savedObjects.client,
      overlays: (await core.getStartServices())[0].overlays,
    }));
    setupDeps.embeddable.registerEmbeddableFactory(OBSERVABILITY_EMBEDDABLE, embeddableFactory);

    registerAsssitantDependencies(setupDeps.assistantDashboards);

    // Register the "Create alert rule" entry under Explore's Query Panel
    // "Actions" menu only when our `alertManagerEnabled` capability is on.
    //
    // Explore's registry has only `getIsEnabled` (greys out) and no
    // `isVisible` hook, so to actually *hide* a duplicate when the
    // alerting-dashboards-plugin also registers its own "Create monitor"
    // entry we must skip `register()` entirely. We can't read capabilities
    // synchronously at setup time, so we defer registration until
    // `getStartServices()` resolves — that fires after capabilities are
    // populated and well before any user can open the actions menu. The
    // alerting plugin uses the mirror condition (registers only when our
    // capability is *off*), so exactly one entry exists at any time.
    if (setupDeps.explore) {
      const exploreSetup = setupDeps.explore;
      // Lazy-load the flyout host once, at module scope of this closure — not
      // per-render. Defining `React.lazy` inside the action's `component`
      // would create a fresh lazy wrapper on every parent render, defeating
      // the dynamic-import cache and re-triggering Suspense each time.
      const LazyExploreCreateMonitor = React.lazy(async () => {
        const mod = await import('./components/alerting/explore_create_monitor');
        return { default: mod.ExploreCreateMonitor };
      });

      core
        .getStartServices()
        .then(([coreStart]) => {
          const capabilities = coreStart.application.capabilities as
            | { observability?: { alertManagerEnabled?: boolean } }
            | undefined;
          if (!capabilities?.observability?.alertManagerEnabled) {
            return;
          }
          exploreSetup.queryPanelActionsRegistry.register({
            id: 'observability-create-logs-monitor-from-explore',
            order: 1,
            actionType: 'flyout',
            getLabel: () =>
              i18n.translate('observability.alerting.exploreCreateMonitor.actionLabel', {
                defaultMessage: 'Create alert rule',
              }),
            getIcon: () => 'bell',
            getIsEnabled: (deps) => {
              // Reuse the alerting plugin's PPL capability — they own the
              // agent config + cluster gate; we just light up alongside
              // theirs so users see this option when PPL alerting is on.
              const liveCapabilities = coreRefs.application?.capabilities as
                | { alertingDashboards?: { pplV2?: boolean } }
                | undefined;
              if (!liveCapabilities?.alertingDashboards?.pplV2) return false;
              // AOSS clusters can't host monitors; the button greys out.
              const isAOSS =
                (deps.query as { dataset?: { dataSource?: { type?: string } } })?.dataset
                  ?.dataSource?.type === 'OpenSearch Serverless';
              return !isAOSS;
            },
            component: (props) => {
              const dataset = (props.dependencies.query as {
                dataset?: {
                  dataSource?: { id?: string; title?: string; name?: string };
                  title?: string;
                  timeFieldName?: string;
                };
              }).dataset;
              const exploreContext = {
                dataSourceId: dataset?.dataSource?.id,
                dataSourceName: dataset?.dataSource?.title ?? dataset?.dataSource?.name,
                indexPattern: dataset?.title,
                timeFieldName: dataset?.timeFieldName,
                queryInEditor:
                  props.dependencies.queryInEditor ||
                  (props.dependencies.query as { query?: string })?.query ||
                  '',
              };
              return (
                <React.Suspense fallback={null}>
                  <LazyExploreCreateMonitor
                    exploreContext={exploreContext}
                    onClose={props.closeFlyout}
                  />
                </React.Suspense>
              );
            },
          });
        })
        .catch((error) => {
          // Surface failures from the deferred-registration path. Without
          // this catch, a `getStartServices()` rejection (rare, but
          // possible during a failed start lifecycle or late teardown)
          // would become an unhandled promise rejection and the
          // registration silently no-op. Matches the existing
          // `console.error` precedent below for the S3 datasource path.

          console.error('Failed to register Explore "Create alert rule" action', error);
        });
    }

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
    coreRefs.data = startDeps.data;
    coreRefs.application = core.application;
    coreRefs.dashboard = startDeps.dashboard;
    coreRefs.queryAssistEnabled = this.config.query_assist.enabled;
    coreRefs.summarizeEnabled = this.config.summarize.enabled;
    // Resolved from the dynamic-config-backed capability so AppConfig flips
    // take effect on the next page load. Components
    // (`apm/pages/services_home`, `apm/pages/service_details`) read this ref.
    const observabilityCapabilities = core.application.capabilities.observability as
      | { alertManagerEnabled?: boolean; sloEnabled?: boolean }
      | undefined;
    const sloEnabledFromCapability = !!observabilityCapabilities?.sloEnabled;
    const alertManagerEnabledFromCapability = !!observabilityCapabilities?.alertManagerEnabled;
    coreRefs.sloEnabled = sloEnabledFromCapability;

    // Hide nav links whose dynamic capability says off. The apps register
    // unconditionally, so URL access still works for users who type the
    // path directly — the dynamic flag is a UI gate, not an access gate.
    if (!alertManagerEnabledFromCapability) {
      this.alertingAppUpdater$.next(() => ({
        navLinkStatus: AppNavLinkStatus.hidden,
      }));
    }
    // SLO updater is merged with `apmAppUpdater$` at register time so the
    // APM-vs-Trace-Analytics gate still applies.
    if (!sloEnabledFromCapability) {
      this.apmSloAppUpdater$.next(() => ({
        navLinkStatus: AppNavLinkStatus.hidden,
      }));
    }
    coreRefs.overlays = core.overlays;
    coreRefs.dataSource = startDeps.dataSource;
    coreRefs.navigation = startDeps.navigation;
    coreRefs.contentManagement = startDeps.contentManagement;
    coreRefs.workspaces = core.workspaces;

    if (core.application.capabilities.investigation?.enabled) {
      this.appUpdater$.next(() => ({
        navLinkStatus: AppNavLinkStatus.hidden,
      }));
    }

    // APM vs Trace Analytics visibility controlled by explore.discoverTracesEnabled capability
    // Only applies when UI setting enabled (both app sets registered)
    if (this.apmEnabled) {
      if (core.application.capabilities.explore?.discoverTracesEnabled) {
        // Traces ENABLED: Show APM, hide Trace Analytics
        this.traceAnalyticsAppUpdater$.next(() => ({
          navLinkStatus: AppNavLinkStatus.hidden,
        }));
      } else {
        // Traces DISABLED: Hide APM, show Trace Analytics (fallback)
        this.apmAppUpdater$.next(() => ({
          navLinkStatus: AppNavLinkStatus.hidden,
        }));
      }
    }

    // redirect trace URL based on new navigation
    if (window.location.pathname.includes(observabilityTracesID)) {
      convertTraceAnalyticsNewNavUrl(window.location);
    }

    const { dataSourceService, dataSourceFactory } = startDeps.data.dataSources;
    dataSourceFactory.registerDataSourceType(S3_DATA_SOURCE_TYPE, S3DataSource);

    const getDataSourceTypeLabel = (type: string) => {
      if (type === DATA_SOURCE_TYPES.S3Glue) return S3_DATA_SOURCE_GROUP_DISPLAY_NAME;
      if (type === DATA_SOURCE_TYPES.SPARK) return S3_DATA_SOURCE_GROUP_SPARK_DISPLAY_NAME;
      return `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
    };

    // register all s3 datasources only if mds feature flag is disabled
    if (!this.mdsFlagStatus) {
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
    }

    core.http.intercept({
      request: catalogRequestIntercept(),
    });

    // Use overlay service to render flyouts
    const renderAccelerationDetailsFlyout = ({
      acceleration,
      dataSourceName,
      handleRefresh,
      dataSourceMDSId,
    }: RenderAccelerationDetailsFlyoutParams) => {
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

    const renderAssociatedObjectsDetailsFlyout = ({
      tableDetail,
      dataSourceName,
      handleRefresh,
      dataSourceMDSId,
    }: RenderAssociatedObjectsDetailsFlyoutParams) => {
      const associatedObjectsDetailsFlyout = core.overlays.openFlyout(
        toMountPoint(
          <AssociatedObjectsDetailsFlyout
            tableDetail={tableDetail}
            datasourceName={dataSourceName}
            resetFlyout={() => associatedObjectsDetailsFlyout.close()}
            handleRefresh={handleRefresh}
            dataSourceMDSId={dataSourceMDSId}
          />
        )
      );
    };
    setRenderAssociatedObjectsDetailsFlyout(renderAssociatedObjectsDetailsFlyout);

    const renderCreateAccelerationFlyout = ({
      dataSource,
      databaseName,
      tableName,
      handleRefresh,
      dataSourceMDSId,
    }: RenderAccelerationFlyoutParams) => {
      const createAccelerationFlyout = core.overlays.openFlyout(
        toMountPoint(
          <CreateAcceleration
            selectedDatasource={dataSource}
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
