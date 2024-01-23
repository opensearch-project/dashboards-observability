/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { first } from 'rxjs/operators';
import { ObservabilityConfig } from '.';
import {
  CoreSetup,
  CoreStart,
  ILegacyClusterClient,
  Logger,
  Plugin,
  PluginInitializerContext,
  SavedObjectsType,
} from '../../../src/core/server';
import { OpenSearchObservabilityPlugin } from './adaptors/opensearch_observability_plugin';
import { PPLPlugin } from './adaptors/ppl_plugin';
import { setupRoutes } from './routes/index';
import {
  searchSavedObject,
  visualizationSavedObject,
} from './saved_objects/observability_saved_object';
import { ObservabilityPluginSetup, ObservabilityPluginStart, AssistantPluginSetup } from './types';
import { PPLParsers } from './parsers/ppl_parser';

export class ObservabilityPlugin
  implements Plugin<ObservabilityPluginSetup, ObservabilityPluginStart> {
  private readonly logger: Logger;

  constructor(private readonly initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public async setup(core: CoreSetup, deps: { assistantDashboards?: AssistantPluginSetup }) {
    const { assistantDashboards } = deps;
    this.logger.debug('Observability: Setup');
    const router = core.http.createRouter();
    const config = await this.initializerContext.config
      .create<ObservabilityConfig>()
      .pipe(first())
      .toPromise();
    const openSearchObservabilityClient: ILegacyClusterClient = core.opensearch.legacy.createClient(
      'opensearch_observability',
      {
        plugins: [PPLPlugin, OpenSearchObservabilityPlugin],
      }
    );

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
        getInAppUrl() {
          return {
            path: `/app/management/observability/settings`,
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
        '3.0.2': (doc) => ({ ...doc, dateCreated: parseInt(doc.dateCreated || '0', 10) }),
      },
    };

    const integrationInstanceType: SavedObjectsType = {
      name: 'integration-instance',
      hidden: false,
      namespaceType: 'single',
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

    core.savedObjects.registerType(obsPanelType);
    core.savedObjects.registerType(integrationInstanceType);

    // Register server side APIs
    setupRoutes({ router, client: openSearchObservabilityClient, config });

    core.savedObjects.registerType(visualizationSavedObject);
    core.savedObjects.registerType(searchSavedObject);
    core.capabilities.registerProvider(() => ({
      observability: {
        show: true,
      },
    }));

    assistantDashboards?.registerMessageParser(PPLParsers);

    return {};
  }

  public start(_core: CoreStart) {
    this.logger.debug('Observability: Started');
    return {};
  }

  public stop() {}
}
