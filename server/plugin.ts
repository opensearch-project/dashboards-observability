/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CoreSetup,
  CoreStart,
  ILegacyClusterClient,
  Logger,
  Plugin,
  PluginInitializerContext,
  SavedObject,
  SavedObjectsType,
} from '../../../src/core/server';
import { DataSourcePluginSetup } from '../../../src/plugins/data_source/server/types';
import { DataSourceManagementPlugin } from '../../../src/plugins/data_source_management/public/plugin';
import { migrateV1IntegrationToV2Integration } from './adaptors/integrations/migrations';
import { OpenSearchObservabilityPlugin } from './adaptors/opensearch_observability_plugin';
import { PPLPlugin } from './adaptors/ppl_plugin';
import { PPLParsers } from './parsers/ppl_parser';
import { setupRoutes } from './routes/index';
import {
  searchSavedObject,
  visualizationSavedObject,
} from './saved_objects/observability_saved_object';
import { AssistantPluginSetup, ObservabilityPluginSetup, ObservabilityPluginStart } from './types';

export interface ObservabilityPluginSetupDependencies {
  dataSourceManagement: ReturnType<DataSourceManagementPlugin['setup']>;
  dataSource: DataSourcePluginSetup;
}

export class ObservabilityPlugin
  implements Plugin<ObservabilityPluginSetup, ObservabilityPluginStart> {
  private readonly logger: Logger;

  constructor(private readonly initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public async setup(
    core: CoreSetup,
    deps: {
      assistantDashboards?: AssistantPluginSetup;
      dataSource: ObservabilityPluginSetupDependencies;
    }
  ) {
    const { assistantDashboards, dataSource } = deps;
    this.logger.debug('Observability: Setup');
    const router = core.http.createRouter();

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

    // Register server side APIs
    setupRoutes({ router, client: openSearchObservabilityClient, dataSourceEnabled });

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
