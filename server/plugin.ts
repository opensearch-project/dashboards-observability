/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema } from '@osd/config-schema';
import { first } from 'rxjs/operators';
import {
  CoreSetup,
  CoreStart,
  ILegacyClusterClient,
  Logger,
  Plugin,
  PluginInitializerContext,
  SavedObject,
  SavedObjectsType,
  UiSettingScope,
} from '../../../src/core/server';
import { DataSourcePluginSetup } from '../../../src/plugins/data_source/server/types';
import { DataSourceManagementPlugin } from '../../../src/plugins/data_source_management/public/plugin';
import { observabilityPanelsID } from '../common/constants/shared';
import { migrateV1IntegrationToV2Integration } from './adaptors/integrations/migrations';
import { OpenSearchObservabilityPlugin } from './adaptors/opensearch_observability_plugin';
import { PPLPlugin } from './adaptors/ppl_plugin';
import { PPLParsers } from './parsers/ppl_parser';
import { registerObservabilityUISettings } from './plugin_helper/register_settings';
import { setupRoutes } from './routes/index';
import { registerSloRoutes } from './routes/slo';
import {
  getSearchSavedObject,
  getVisualizationSavedObject,
  notebookSavedObject,
} from './saved_objects/observability_saved_object';
import { sloRuleRefType, SLO_RULE_REF_SO_TYPE } from './saved_objects/slo_rule_ref';
import { SloService } from '../common/slo/slo_service';
import { InMemorySloStore } from '../common/slo/slo_store';
import type { ISloStore } from '../common/slo/slo_types';
import { SavedObjectSloStore } from './services/slo/slo_saved_object_store';
import { DirectQueryRulerClient } from './services/slo/ruler_client';
import { SloRuleRefStore } from './services/slo/slo_rule_ref_store';
import { SloStoreFactory } from './services/slo/slo_store_factory';
import { SloReconciler } from './services/slo/slo_reconciler';
import { DirectQueryStatusAggregator } from './services/slo/status_aggregator';
import { DatasourceCircuitBreaker } from './services/slo/datasource_circuit_breaker';
import { createRuleHealthChecker } from './services/slo/rule_health_checker';
import { InMemoryDatasourceService } from './services/alerting/datasource_service';
import { DatasourceDiscoveryService } from './services/alerting/datasource_discovery';
import { DirectQueryPrometheusBackend } from './services/alerting/directquery_prometheus_backend';
import { bindPromQLSearcherFromStartServices } from './services/alerting/promql_search';
import { AssistantPluginSetup, ObservabilityPluginSetup, ObservabilityPluginStart } from './types';
import type { DataPluginStart } from '../../../src/plugins/data/server';

export interface ObservabilityPluginSetupDependencies {
  dataSourceManagement: ReturnType<DataSourceManagementPlugin['setup']>;
  dataSource: DataSourcePluginSetup;
}

export class ObservabilityPlugin
  implements Plugin<ObservabilityPluginSetup, ObservabilityPluginStart> {
  private readonly logger: Logger;
  private sloService?: SloService;
  /**
   * Held over from `setup()` so `start()` can stand the reconciler up
   * with the same RulerClient the routes use. Reconciler config also
   * captured at `setup()` time because the config is read with
   * `first()` and replays don't refresh on reload.
   */
  private sloRulerClient?: DirectQueryRulerClient;
  private sloReconcilerOpts?: { enabled: boolean; intervalMs: number; graceMs: number };
  private sloReconciler?: SloReconciler;

  constructor(private readonly initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public async setup(
    core: CoreSetup,
    deps: {
      assistantDashboards?: AssistantPluginSetup;
      dataSource: ObservabilityPluginSetupDependencies;
      investigationDashboards?: unknown;
    }
  ) {
    const { assistantDashboards, dataSource } = deps;
    this.logger.debug('Observability: Setup');
    const router = core.http.createRouter();

    // Wire the PromQL searcher so server-initiated PromQL queries
    // (probe-sli, status aggregator, alert preview) all route through the
    // data plugin's search service with `strategy: 'PROMQL'` instead of
    // crafting their own transport calls. Deferred via `getStartServices`
    // so plugin setup doesn't block on the data plugin's start; the
    // searcher is only invoked from request handlers, which run after
    // both plugins have started.
    bindPromQLSearcherFromStartServices(
      (core.getStartServices as unknown) as import('opensearch-dashboards/server').StartServicesAccessor<
        {},
        { data: { search: DataPluginStart['search'] } }
      >
    );

    const dataSourceEnabled = !!dataSource;
    const openSearchObservabilityClient: ILegacyClusterClient = core.opensearch.legacy.createClient(
      'opensearch_observability',
      {
        plugins: [PPLPlugin, OpenSearchObservabilityPlugin],
      }
    );
    if (dataSourceEnabled) {
      dataSource.registerCustomApiSchema(PPLPlugin);
      dataSource.registerCustomApiSchema(OpenSearchObservabilityPlugin);
    }
    // @ts-ignore
    core.http.registerRouteHandlerContext('observability_plugin', (_context, _request) => {
      return {
        logger: this.logger,
        observabilityClient: openSearchObservabilityClient,
      };
    });

    const obsPanelType: SavedObjectsType = {
      name: 'observability-panel',
      hidden: false,
      namespaceType: 'single',
      mappings: {
        dynamic: false,
        properties: {
          title: {
            type: 'text',
          },
          description: {
            type: 'text',
          },
        },
      },
      management: {
        importableAndExportable: true,
        getInAppUrl(obj) {
          return {
            path: dataSourceEnabled ? '' : `/app/${observabilityPanelsID}#/${obj.id}`,
            uiCapabilitiesPath: 'advancedSettings.show',
          };
        },
        getTitle(obj) {
          return `Observability Settings [${obj.id}]`;
        },
      },
      migrations: {
        '3.0.0': (doc) => ({ ...doc, description: '' }),
        '3.0.1': (doc) => ({ ...doc, description: 'Some Description Text' }),
        '3.0.2': (doc) => ({
          ...doc,
          dateCreated: parseInt((doc as { dateCreated?: string }).dateCreated || '0', 10),
        }),
      },
    };

    const integrationInstanceType: SavedObjectsType = {
      name: 'integration-instance',
      hidden: false,
      namespaceType: 'single',
      management: {
        importableAndExportable: true,
        getInAppUrl(obj: SavedObject<IntegrationInstance>) {
          return {
            path: `/app/integrations#/installed/${obj.id}`,
            uiCapabilitiesPath: 'advancedSettings.show',
          };
        },
        getTitle(obj: SavedObject<IntegrationInstance>) {
          return obj.attributes.name;
        },
      },
      mappings: {
        dynamic: false,
        properties: {
          name: {
            type: 'text',
          },
          templateName: {
            type: 'text',
          },
          dataSource: {
            type: 'text',
          },
          creationDate: {
            type: 'date',
          },
          assets: {
            type: 'nested',
          },
        },
      },
    };

    const integrationTemplateType: SavedObjectsType = {
      name: 'integration-template',
      hidden: false,
      namespaceType: 'single',
      management: {
        importableAndExportable: true,
        getInAppUrl(obj: SavedObject<SerializedIntegration>) {
          return {
            path: `/app/integrations#/available/${obj.attributes.name}`,
            uiCapabilitiesPath: 'advancedSettings.show',
          };
        },
        getTitle(obj: SavedObject<SerializedIntegration>) {
          return obj.attributes.displayName ?? obj.attributes.name;
        },
      },
      mappings: {
        dynamic: false,
        properties: {
          name: {
            type: 'text',
          },
          version: {
            type: 'text',
          },
          displayName: {
            type: 'text',
          },
          license: {
            type: 'text',
          },
          type: {
            type: 'text',
          },
          labels: {
            type: 'text',
          },
          author: {
            type: 'text',
          },
          description: {
            type: 'text',
          },
          sourceUrl: {
            type: 'text',
          },
          statics: {
            type: 'nested',
          },
          components: {
            type: 'nested',
          },
          assets: {
            type: 'nested',
          },
          sampleData: {
            type: 'nested',
          },
        },
      },
      migrations: {
        '3.0.0': migrateV1IntegrationToV2Integration,
      },
    };

    core.savedObjects.registerType(obsPanelType);
    core.savedObjects.registerType(integrationInstanceType);
    core.savedObjects.registerType(integrationTemplateType);

    // SLO saved-object type. Persists the full `{ spec, status }` document;
    // the listing page filters against the top-level projections populated
    // by `SavedObjectSloStore` on write. `spec` and `status` are stored as
    // opaque JSON (`enabled: false`) — OpenSearch refuses dotted sub-paths
    // alongside a disabled parent, so all indexed projections live at the
    // top level and the store duplicates values out of spec/status on write.
    const sloDefinitionType: SavedObjectsType = {
      name: 'slo-definition',
      hidden: false,
      namespaceType: 'single',
      mappings: {
        properties: {
          name: { type: 'text' },
          description: { type: 'text' },
          datasourceId: { type: 'keyword' },
          enabled: { type: 'boolean' },
          mode: { type: 'keyword' },
          service: { type: 'keyword' },
          ownerTeams: { type: 'keyword' },
          ownerPrimaryUser: { type: 'keyword' },
          tier: { type: 'keyword' },
          primaryOwnerTeam: { type: 'keyword' },
          sliNodeType: { type: 'keyword' },
          sliBackend: { type: 'keyword' },
          sliLeafType: { type: 'keyword' },
          dimensionNames: { type: 'keyword' },
          dimensionValues: { type: 'keyword' },
          objectiveCount: { type: 'integer' },
          worstTarget: { type: 'float' },
          labelKeys: { type: 'keyword' },
          labelValues: { type: 'keyword' },
          // Last-written live state, eagerly persisted by the status pipeline
          // when the computed value diverges from this stored projection. Not
          // a source of truth — `SloLiveStatus.state` is recomputed every
          // listing call by the aggregator. Exists solely so the SO `filter`
          // clause can push the `state` facet to the index instead of paying
          // status fold-in for every matching SLO before slicing.
          cachedState: { type: 'keyword' },
          version: { type: 'integer' },
          createdAt: { type: 'date' },
          createdBy: { type: 'keyword' },
          updatedAt: { type: 'date' },
          updatedBy: { type: 'keyword' },
          spec: { type: 'object', enabled: false },
          status: { type: 'object', enabled: false },
        },
      },
      management: {
        importableAndExportable: true,
        getInAppUrl(obj) {
          return {
            path: `/app/observability-apm-slo#/slos/${obj.id}`,
            uiCapabilitiesPath: 'advancedSettings.show',
          };
        },
        getTitle(obj) {
          const attrs = obj.attributes as { name?: string; spec?: { name?: string } };
          return String(attrs.name ?? attrs.spec?.name ?? obj.id);
        },
      },
    };
    // Hoisted above `setupRoutes` so the alerting-route gate (mirrors the
    // existing `dataSourceEnabled` pattern) can read the flag at registration
    // time. Keep the same fetch downstream consumers depend on — UI settings
    // registration below reuses `observabilityConfig.alertManager?.enabled`.
    const observabilityConfig = await this.initializerContext.config
      .create<{
        alertManager: { enabled: boolean };
        slo?: {
          enabled?: boolean;
          ruleDedup?: { enabled: boolean };
          reconciler?: { enabled?: boolean; intervalMs?: number; graceMs?: number };
        };
      }>()
      .pipe(first())
      .toPromise();
    const alertManagerEnabled = observabilityConfig.alertManager?.enabled ?? false;
    // Feature-flag: SLO surfaces ship dark by default. Opt in via
    // `observability.slo.enabled: true` in `opensearch_dashboards.yml`.
    // Mirrors the alertManager.enabled pattern. When disabled we skip SO
    // type registration, route registration, and service construction —
    // the plugin acts as if SLOs don't exist.
    //
    // Toggling this value in the yml requires an OSD restart to take
    // effect. The value is captured once here at plugin setup so route
    // closures and SO-type registrations can key off it; moving the check
    // per-request would re-register OSD apps and SO types after boot,
    // which is not supported.
    const sloEnabled = observabilityConfig.slo?.enabled ?? false;
    const ruleDedupEnabled = observabilityConfig.slo?.ruleDedup?.enabled ?? true;
    this.sloReconcilerOpts = {
      enabled: observabilityConfig.slo?.reconciler?.enabled ?? true,
      intervalMs: observabilityConfig.slo?.reconciler?.intervalMs ?? 300_000,
      graceMs: observabilityConfig.slo?.reconciler?.graceMs ?? 24 * 3600 * 1000,
    };

    if (sloEnabled) {
      core.savedObjects.registerType(sloDefinitionType);
      core.savedObjects.registerType(sloRuleRefType);
      if (core.workspace.isWorkspaceEnabled()) {
        // SLO documents and slo-rule-ref refcount registry are partitioned
        // per OSD workspace via the saved-objects workspace wrapper. The
        // ruler recording-rule namespace (`slo-generated-<datasourceId>`)
        // is shared across workspaces that target the same Cortex tenant —
        // two workspaces creating SLOs over the same SLI fingerprint share
        // one rule group on the ruler, with refcount tracked separately
        // per workspace. The grace-GC pass owns recording-group cleanup
        // and fires only when the cross-workspace aggregate refcount for a
        // (datasourceId, fingerprint) tuple hits zero past the grace window.
        this.logger.info(
          'Observability: SLO is enabled on a workspace-enabled cluster. ' +
            'SLO documents and dedup refcounts are scoped per workspace; ' +
            'ruler recording rules are shared per datasource and GC-ed only ' +
            'when no workspace references them past the grace period.'
        );
      }
    }

    // Register server side APIs
    setupRoutes({
      router,
      client: openSearchObservabilityClient,
      dataSourceEnabled,
      alertManagerEnabled,
      logger: this.logger,
    });

    if (sloEnabled) {
      // SLO service + routes. Starts on `InMemorySloStore` so it's available
      // during setup; `start()` swaps it out for the saved-object-backed
      // store once the internal repository is available. The ruler client is
      // a transport abstraction — today it writes per-group via the
      // DirectQuery plugin; a future Amazon-Managed-Prometheus transport will
      // write whole namespaces atomically. Callers pass the namespace
      // (`sloRulerNamespaceFor(workspaceId)`) explicitly so the AMP invariant
      // "every rule group for workspace W lives in `slo-generated-<W>`"
      // holds regardless of transport.
      const sloLogger = {
        info: (msg: string) => this.logger.info(msg),
        warn: (msg: string) => this.logger.warn(msg),
        error: (msg: string) => this.logger.error(msg),
        debug: (msg: string) => this.logger.debug(msg),
      };
      const initialStore: ISloStore = new InMemorySloStore();
      const sloService = new SloService(sloLogger, initialStore);
      sloService.setDedupEnabled(ruleDedupEnabled);
      sloService.setPluginVersion(this.initializerContext.env.packageInfo.version);
      // Wire the DirectQuery status aggregator so SLO list/detail responses
      // surface real Cortex-derived state (healthy/breaching/warning) instead
      // of the no-op stub that always returns no_data.
      // Per-server datasource health tracker. One instance per plugin
      // start; failure counts and cooldown are in-memory and reset on
      // process restart. Logs once per open/close transition so an
      // operator sees a flapping datasource without log spam every
      // listing call.
      const sloCircuitBreaker = new DatasourceCircuitBreaker({
        onTransition: (datasourceId, transition) => {
          if (transition === 'open') {
            sloLogger.warn(
              `SLO status aggregator: datasource ${datasourceId} circuit OPEN — fast-failing to no_data until cooldown elapses`
            );
          } else {
            sloLogger.info(
              `SLO status aggregator: datasource ${datasourceId} circuit CLOSED — resumed live status reads`
            );
          }
        },
      });
      sloService.setStatusAggregator(new DirectQueryStatusAggregator(sloLogger, sloCircuitBreaker));
      this.sloService = sloService;

      const rulerClient = new DirectQueryRulerClient(this.logger);
      // Stash for `start()` so the reconciler can reuse the same ruler
      // transport the routes use. Avoids constructing a second client +
      // ensures any future configuration on the ruler client is applied
      // consistently across CRUD and GC paths.
      this.sloRulerClient = rulerClient;
      // Followups' SLO routes need an InMemoryDatasourceService + a
      // DatasourceDiscoveryService to resolve free-text Datasource IDs at
      // create/update/delete time. Without these, buildDeployContext returns
      // undefined, the SO is saved, but the ruler dual-write silently no-ops
      // (commit 4de0c0cf). Wired here to keep the SLO ruler write path live
      // on this branch.
      const sloDatasourceService = new InMemoryDatasourceService(sloLogger);
      const sloDiscoveryService = new DatasourceDiscoveryService(sloDatasourceService, sloLogger);
      // Rule-health checker probes the ruler for the SLO's expected rule
      // groups. Without it the detail page's `GET /rule_health` returns 501
      // and surfaces a "Could not load rule health: Not Implemented" toast
      // every time a user opens an SLO. Backed by the same ruler client the
      // SLO write path uses, with the default 30s in-memory cache.
      const ruleHealthChecker = createRuleHealthChecker(rulerClient, sloLogger);
      // Probe-SLI route is gated on a non-null prometheusBackend; without it
      // the wizard's "Probe SLI" button always 404s. The backend is stateless
      // (see comment in routes/index.ts beside the alerting promBackend) so
      // the second instance is fine.
      const sloPrometheusBackend = new DirectQueryPrometheusBackend(this.logger);
      registerSloRoutes({
        router,
        sloService,
        logger: this.logger,
        rulerClient,
        ruleDedupEnabled,
        datasourceService: sloDatasourceService,
        discoveryService: sloDiscoveryService,
        ruleHealthChecker,
        prometheusBackend: sloPrometheusBackend,
      });
    }

    core.savedObjects.registerType(getVisualizationSavedObject(dataSourceEnabled));
    core.savedObjects.registerType(getSearchSavedObject(dataSourceEnabled));
    if (!deps.investigationDashboards) {
      core.savedObjects.registerType(notebookSavedObject);
    }
    core.capabilities.registerProvider(() => ({
      observability: {
        show: true,
      },
    }));

    assistantDashboards?.registerMessageParser(PPLParsers);

    registerObservabilityUISettings(core.uiSettings, alertManagerEnabled);

    core.uiSettings.register({
      'observability:defaultDashboard': {
        name: 'Observability default dashboard',
        value: '',
        description: 'The default dashboard to display in Observability overview page',
        schema: schema.string(),
        scope: core.workspace.isWorkspaceEnabled()
          ? UiSettingScope.WORKSPACE
          : UiSettingScope.GLOBAL,
      },
    });

    core.uiSettings.register({
      'observability:overviewCardsDisplay': {
        name: 'Observability overview cards',
        value: true,
        description: 'Show the Observability overview page cards',
        schema: schema.boolean(),
        scope: core.workspace.isWorkspaceEnabled()
          ? UiSettingScope.WORKSPACE
          : UiSettingScope.GLOBAL,
      },
    });

    if (sloEnabled) {
      core.uiSettings.register({
        'observability.slo.ruleDedup.enabled': {
          name: 'SLO recording-rule dedup',
          value: true,
          description:
            'When enabled, SLO recording rules are shared across SLOs with equivalent ' +
            'SLI shapes via a workspace-scoped fingerprint registry. ' +
            'Saves evaluation cost on the ruler when many SLOs share a backend query.',
          schema: schema.boolean(),
          scope: core.workspace.isWorkspaceEnabled()
            ? UiSettingScope.WORKSPACE
            : UiSettingScope.GLOBAL,
        },
      });
    }

    return {};
  }

  public start(core: CoreStart) {
    this.logger.debug('Observability: Started');

    // Upgrade SLO storage from the in-memory bootstrap store to the
    // saved-object-backed store once the internal repository is available.
    //
    // Fail-loud on repository-creation failure rather than falling back to
    // the in-memory store. A durable feature silently becoming volatile is
    // a data-loss class of failure — an SLO created against the fallback
    // store vanishes on the next plugin restart, and the user has no way
    // to tell. Raise and let OSD surface the init failure; the operator
    // can disable `observability.slo.enabled` in the yml to unblock boot.
    if (this.sloService) {
      const repository = core.savedObjects.createInternalRepository([
        'slo-definition',
        SLO_RULE_REF_SO_TYPE,
      ]);
      const soStore = new SavedObjectSloStore(repository);
      this.sloService.setStore(soStore);
      const refStore = new SloRuleRefStore(
        (repository as unknown) as import('../../../src/core/server').SavedObjectsClientContract
      );
      this.sloService.setRuleRefStore(refStore);
      // Per-request store factory. Methods that receive an OSD `request`
      // (every route handler does) route through the workspace-scoped
      // saved-objects client so the WorkspaceIdConsumerWrapper engages and
      // partitions slo-definition + slo-rule-ref reads/writes per
      // workspace. The singleton stores above continue to back any path
      // that doesn't carry a request — currently nothing in production,
      // and tests that exercise the offline path.
      const storeFactory = new SloStoreFactory(core.savedObjects);
      this.sloService.setStoreFactory(storeFactory);
      this.logger.info('Observability: SLO storage upgraded to SavedObjects');

      // Reconciler: grace-GC for shared recording rules. Disabled via
      // `observability.slo.reconciler.enabled: false` in environments that
      // don't want the sweep (e.g. CI, where ruler reachability is mocked
      // and the timer would just churn warnings).
      const reconcilerOpts = this.sloReconcilerOpts;
      if (reconcilerOpts?.enabled && this.sloRulerClient) {
        this.sloReconciler = new SloReconciler(
          this.logger,
          core.savedObjects,
          core.opensearch,
          this.sloRulerClient,
          { intervalMs: reconcilerOpts.intervalMs, graceMs: reconcilerOpts.graceMs }
        );
        this.sloReconciler.start();
      }
    }

    return {};
  }

  public stop() {
    this.sloReconciler?.stop();
  }
}
