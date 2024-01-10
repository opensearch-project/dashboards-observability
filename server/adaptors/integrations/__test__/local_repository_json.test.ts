/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Serialization tests for integrations in the local repository.
 */

import { TemplateManager } from '../repository/repository';
import { IntegrationReader, foldResults } from '../repository/integration_reader';
import path from 'path';
import * as fs from 'fs/promises';
import { JsonCatalogDataAdaptor } from '../repository/json_data_adaptor';

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
  return foldResults(serializedIntegrationResults);
};

describe('The Local Serialized Catalog', () => {
  it('Should serialize without errors', async () => {
    const serialized = await fetchSerializedIntegrations();
    expect(serialized.ok).toBe(true);
  });

  it('Should pass deep validation for all serialized integrations', async () => {
    const serialized = await fetchSerializedIntegrations();
    const repository = new TemplateManager(
      '.',
      new JsonCatalogDataAdaptor(serialized.value as SerializedIntegration[])
    );

    for (const integ of await repository.getIntegrationList()) {
      const validationResult = await integ.deepCheck();
      await expect(validationResult).toHaveProperty('ok', true);
    }
  });

  it('Should correctly retrieve a logo', async () => {
    const serialized = await fetchSerializedIntegrations();
    const repository = new TemplateManager(
      '.',
      new JsonCatalogDataAdaptor(serialized.value as SerializedIntegration[])
    );
    const integration = (await repository.getIntegration('nginx')) as IntegrationReader;
    const logoStatic = await integration.getStatic('logo.svg');

    expect(logoStatic).toHaveProperty('ok', true);
    expect((logoStatic.value as Buffer).length).toBeGreaterThan(1000);
  });

  it('Should correctly retrieve a gallery image', async () => {
    const serialized = await fetchSerializedIntegrations();
    const repository = new TemplateManager(
      '.',
      new JsonCatalogDataAdaptor(serialized.value as SerializedIntegration[])
    );
    const integration = (await repository.getIntegration('nginx')) as IntegrationReader;
    const logoStatic = await integration.getStatic('dashboard1.png');

    expect(logoStatic).toHaveProperty('ok', true);
    expect((logoStatic.value as Buffer).length).toBeGreaterThan(1000);
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

    await expect(integration.deepCheck()).resolves.toHaveProperty('ok', false);
  });

  it('Should correctly fail an integration without assets', async () => {
    const TEST_INTEGRATION = 'nginx';
    const serialized = await fetchSerializedIntegrations();
    const transformedSerialized = (serialized.value as SerializedIntegration[])
      .filter((integ: { name: string; components: unknown[] }) => integ.name === TEST_INTEGRATION)
      .map((integ) => {
        return {
          ...integ,
          assets: {} as SerializedIntegrationAssets,
        };
      });
    const integration = new IntegrationReader(
      TEST_INTEGRATION,
      new JsonCatalogDataAdaptor(transformedSerialized)
    );

    await expect(integration.deepCheck()).resolves.toHaveProperty('ok', false);
  });
});
