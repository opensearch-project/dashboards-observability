/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ILegacyClusterClient, IRouter, Logger } from '../../../../src/core/server';
import { DSLFacet } from '../services/facets/dsl_facet';
import { PPLFacet } from '../services/facets/ppl_facet';
import SavedObjectFacet from '../services/facets/saved_objects';
import { QueryService } from '../services/queryService';
import { registerAppAnalyticsRouter } from './application_analytics/app_analytics_router';
import { PanelsRouter } from './custom_panels/panels_router';
import { VisualizationsRouter } from './custom_panels/visualizations_router';
import { registerDataConnectionsRoute } from './data_connections/data_connections_router';
import { registerDatasourcesRoute } from './datasources/datasources_router';
import { registerDslRoute } from './dsl';
import { registerEventAnalyticsRouter } from './event_analytics/event_analytics_router';
import { registerGettingStartedRoutes } from './getting_started/getting_started_router';
import { registerIntegrationsRoute } from './integrations/integrations_router';
import { registerMetricsRoute } from './metrics/metrics_rounter';
import { registerNoteRoute } from './notebooks/noteRouter';
import { registerParaRoute } from './notebooks/paraRouter';
import { registerSqlRoute } from './notebooks/sqlRouter';
import { registerVizRoute } from './notebooks/vizRouter';
import { registerPplRoute } from './ppl';
import { registerQueryAssistRoutes } from './query_assist/routes';
import { MLCommonsRCFFacet } from '../services/facets/ml_commons_rcf_facet';
import { registerMLCommonsRCFRoute } from './ml_commons_rcf';
import { registerTraceAnalyticsDslRouter } from './trace_analytics_dsl_router';
import { registerAlertingRoutes } from './alerting';
import {
  HttpOpenSearchBackend,
  MonitorMutationService,
  DirectQueryPrometheusBackend,
} from '../services/alerting';

export function setupRoutes({
  router,
  client,
  dataSourceEnabled,
  alertManagerEnabled,
  logger,
}: {
  router: IRouter;
  client: ILegacyClusterClient;
  dataSourceEnabled: boolean;
  alertManagerEnabled: boolean;
  logger: Logger;
}) {
  PanelsRouter(router);
  VisualizationsRouter(router);
  registerPplRoute({ router, facet: new PPLFacet(client) });
  registerDslRoute({ router, facet: new DSLFacet(client) }, dataSourceEnabled);
  registerEventAnalyticsRouter({ router, savedObjectFacet: new SavedObjectFacet(client) });
  registerAppAnalyticsRouter(router);

  // TODO remove trace analytics route when DSL route for autocomplete is added
  registerTraceAnalyticsDslRouter(router, dataSourceEnabled);

  // notebooks routes
  registerParaRoute(router);
  registerNoteRoute(router);
  registerVizRoute(router, dataSourceEnabled);
  const queryService = new QueryService(client, logger);
  registerSqlRoute(router, queryService, dataSourceEnabled);

  registerMetricsRoute(router, dataSourceEnabled);
  registerIntegrationsRoute(router);
  registerDataConnectionsRoute(router, dataSourceEnabled);
  registerDatasourcesRoute(router, dataSourceEnabled);

  // query assist is part of log explorer, which will be disabled if datasource is enabled
  if (!dataSourceEnabled) {
    registerQueryAssistRoutes(router);
  }

  registerGettingStartedRoutes(router);
  registerMLCommonsRCFRoute({ router, facet: new MLCommonsRCFFacet() });

  // Alerting routes — gated by `observability.alertManager.enabled`
  // (mirrors the existing `dataSourceEnabled` plumbing pattern). When the
  // flag is off the routes are never registered, so curl returns 404 for
  // both mutations and the AM config endpoint.
  if (alertManagerEnabled) {
    // Only construct the genuinely stateless deps at server start. The
    // per-request `MultiBackendAlertService` and `PrometheusMetadataService`
    // instances — both of which hold a `SavedObjectDatasourceService` — are
    // built inside each route handler so the per-request scoped SavedObjects
    // client never bleeds across concurrent requests.
    const osBackend = new HttpOpenSearchBackend(logger);
    const promBackend = new DirectQueryPrometheusBackend(logger);
    const mutationSvc = new MonitorMutationService(logger);

    registerAlertingRoutes(router, {
      osBackend,
      promBackend,
      mutationSvc,
      logger,
      enableMetadataRoutes: true,
    });
  }
}
