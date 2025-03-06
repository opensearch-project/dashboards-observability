/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Serialization tests for integrations in the local repository.
 */

import { TemplateManager } from '../repository/repository';
import { IntegrationReader } from '../repository/integration_reader';
import path from 'path';
import * as fs from 'fs/promises';
import { JsonCatalogDataAdaptor } from '../repository/json_data_adaptor';
import { deepCheck, foldResults } from '../repository/utils';
import { expectErrorResult, expectOkResult } from './custom_expects';

const fetchSerializedIntegrations = async (): Promise<Result<SerializedIntegration[], Error>> => {
  const directory = path.join(__dirname, '../__data__/repository');
  const folders = await fs.readdir(directory);
  const readers = await Promise.all(
    folders.map(async (folder) => {
      const integPath = path.join(directory, folder);
      if (!(await fs.lstat(integPath)).isDirectory()) {
        // If it's not a directory (e.g. a README), skip it
        return Promise.resolve(null);
      }
      // Otherwise, all directories must be integrations
      return new IntegrationReader(integPath);
    })
  );
  const serializedIntegrationResults = await Promise.all(
    (readers.filter((x) => x !== null) as IntegrationReader[]).map((r) => r.serialize())
  );
  const folded = foldResults(serializedIntegrationResults);
  expectOkResult(folded);
  return folded;
};

describe('The Local Serialized Catalog', () => {
  it('Should serialize without errors', async () => {
    const serialized = await fetchSerializedIntegrations();
    expectOkResult(serialized);
  });

  it('Should pass deep validation for all serialized integrations', async () => {
    const serialized = await fetchSerializedIntegrations();
    const repository = new TemplateManager([
      new JsonCatalogDataAdaptor(serialized.value as SerializedIntegration[]),
    ]);

    for (const integ of await repository.getIntegrationList()) {
      const validationResult = await deepCheck(integ);
      expectOkResult(validationResult);
    }
  });

  it('Should correctly retrieve a logo', async () => {
    const serialized = await fetchSerializedIntegrations();
    const repository = new TemplateManager([
      new JsonCatalogDataAdaptor(serialized.value as SerializedIntegration[]),
    ]);
    const integration = (await repository.getIntegration('nginx')) as IntegrationReader;
    const logoStatic = await integration.getStatic('logo.svg');

    expectOkResult(logoStatic);
    expect((logoStatic.value as Buffer).length).toBeGreaterThan(100);
  });

  it('Should correctly retrieve a gallery image', async () => {
    const serialized = await fetchSerializedIntegrations();
    const repository = new TemplateManager([
      new JsonCatalogDataAdaptor(serialized.value as SerializedIntegration[]),
    ]);
    const integration = (await repository.getIntegration('nginx')) as IntegrationReader;
    const logoStatic = await integration.getStatic('dashboard1.png');

    expectOkResult(logoStatic);
    expect((logoStatic.value as Buffer).length).toBeGreaterThan(1000);
  });

  it('Should correctly retrieve a dark mode logo', async () => {
    const TEST_INTEGRATION = 'nginx';
    const serialized = await fetchSerializedIntegrations();
    const config = (serialized.value as SerializedIntegration[]).filter(
      (integ: { name: string; components: unknown[] }) => integ.name === TEST_INTEGRATION
    )[0];

    if (!config.statics) {
      throw new Error('NginX integration missing statics (invalid test)');
    }
    config.statics.darkModeGallery = config.statics.gallery;
    config.statics.darkModeLogo = {
      ...(config.statics.logo as SerializedStaticAsset),
      path: 'dark_logo.svg',
    };

    const reader = new IntegrationReader('nginx', new JsonCatalogDataAdaptor([config]));

    expectOkResult(await reader.getStatic('dark_logo.svg'));
  });

  it('Should correctly re-serialize', async () => {
    const TEST_INTEGRATION = 'nginx';
    const serialized = await fetchSerializedIntegrations();
    const config = (serialized.value as SerializedIntegration[]).filter(
      (integ: { name: string }) => integ.name === TEST_INTEGRATION
    )[0];

    const reader = new IntegrationReader('nginx', new JsonCatalogDataAdaptor([config]));
    const reserialized = await reader.serialize();

    expectOkResult(reserialized);
    expect(reserialized.value).toEqual(config);
  });

  it('Should correctly re-serialize with dark mode values', async () => {
    const TEST_INTEGRATION = 'nginx';
    const serialized = await fetchSerializedIntegrations();
    const config = (serialized.value as SerializedIntegration[]).filter(
      (integ: { name: string }) => integ.name === TEST_INTEGRATION
    )[0];

    if (!config.statics) {
      throw new Error('NginX integration missing statics (invalid test)');
    }
    config.statics.darkModeGallery = config.statics.gallery;
    config.statics.darkModeLogo = {
      ...(config.statics.logo as SerializedStaticAsset),
      path: 'dark_logo.svg',
    };

    const reader = new IntegrationReader('nginx', new JsonCatalogDataAdaptor([config]));
    const reserialized = await reader.serialize();

    expectOkResult(reserialized);
    expect(reserialized.value).toEqual(config);
  });
});

describe('Integration validation', () => {
  it('Should correctly fail an integration without schemas', async () => {
    const TEST_INTEGRATION = 'nginx';
    const serialized = await fetchSerializedIntegrations();
    const transformedSerialized = (serialized.value as SerializedIntegration[])
      .filter((integ: { name: string; components: unknown[] }) => integ.name === TEST_INTEGRATION)
      .map((integ) => {
        return {
          ...integ,
          components: [] as SerializedIntegrationComponent[],
        };
      });
    const integration = new IntegrationReader(
      TEST_INTEGRATION,
      new JsonCatalogDataAdaptor(transformedSerialized)
    );

    expectErrorResult(await deepCheck(integration));
  });

  it('Should correctly fail an integration without assets', async () => {
    const TEST_INTEGRATION = 'nginx';
    const serialized = await fetchSerializedIntegrations();
    const transformedSerialized = (serialized.value as SerializedIntegration[])
      .filter((integ: { name: string; components: unknown[] }) => integ.name === TEST_INTEGRATION)
      .map((integ) => {
        return {
          ...integ,
          assets: [] as SerializedIntegrationAsset[],
        };
      });
    const integration = new IntegrationReader(
      TEST_INTEGRATION,
      new JsonCatalogDataAdaptor(transformedSerialized)
    );

    expectErrorResult(await deepCheck(integration));
  });
});

describe('JSON Catalog with invalid data', () => {
  it('Should report an error if images are missing data', async () => {
    const TEST_INTEGRATION = 'nginx';
    const serialized = await fetchSerializedIntegrations();
    const baseConfig = (serialized.value as SerializedIntegration[]).filter(
      (integ: { name: string; components: unknown[] }) => integ.name === TEST_INTEGRATION
    )[0];

    if (!baseConfig.statics) {
      throw new Error('NginX integration missing statics (invalid test)');
    }

    baseConfig.statics = {
      logo: { path: 'logo.svg' } as SerializedStaticAsset,
      darkModeLogo: { path: 'dm_logo.svg' } as SerializedStaticAsset,
      gallery: [{ path: '1.png' }] as SerializedStaticAsset[],
      darkModeGallery: [{ path: 'dm_1.png' }] as SerializedStaticAsset[],
    };
    const reader = new IntegrationReader(
      TEST_INTEGRATION,
      new JsonCatalogDataAdaptor([baseConfig])
    );

    for (const img of ['logo.svg', 'dm_logo.svg', '1.png', 'dm_1.png']) {
      expectErrorResult(await reader.getStatic(img));
    }
  });

  it('Should report an error on read if a schema has invalid JSON', async () => {
    const TEST_INTEGRATION = 'nginx';
    const serialized = await fetchSerializedIntegrations();
    const baseConfig = (serialized.value as SerializedIntegration[]).filter(
      (integ: { name: string; components: unknown[] }) => integ.name === TEST_INTEGRATION
    )[0];

    expect(baseConfig.components.length).toBeGreaterThanOrEqual(2);
    baseConfig.components[1].data = '{"invalid_json": true';

    const reader = new IntegrationReader(
      TEST_INTEGRATION,
      new JsonCatalogDataAdaptor([baseConfig])
    );

    expectErrorResult(await reader.getSchemas());
  });
});
