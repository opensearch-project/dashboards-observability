/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TemplateManager } from '../repository';
import { IntegrationReader } from '../integration_reader';
import path from 'path';
import { JsonCatalogDataAdaptor } from '../json_data_adaptor';
import { TEST_INTEGRATION_CONFIG } from '../../../../../test/constants';

// Simplified catalog for integration searching -- Do not use for full deserialization tests.
const TEST_CATALOG_NO_SERIALIZATION: SerializedIntegration[] = [
  {
    ...(TEST_INTEGRATION_CONFIG as SerializedIntegration),
    name: 'sample1',
  },
  {
    ...(TEST_INTEGRATION_CONFIG as SerializedIntegration),
    name: 'sample2',
  },
  {
    ...(TEST_INTEGRATION_CONFIG as SerializedIntegration),
    name: 'sample2',
    version: '2.1.0',
  },
];

describe('JSON Data Adaptor', () => {
  it('Should be able to deserialize a serialized integration', async () => {
    const repository: TemplateManager = new TemplateManager(
      path.join(__dirname, '../../__data__/repository')
    );
    const fsIntegration: IntegrationReader = (await repository.getIntegration('nginx'))!;
    const fsConfig = await fsIntegration.getConfig();
    const serialized = await fsIntegration.serialize();

    expect(serialized.ok).toBe(true);
    if (!serialized.ok) {
      return; // Trick typescript into allowing access to serialized.value
    }

    const adaptor: JsonCatalogDataAdaptor = new JsonCatalogDataAdaptor([serialized.value]);
    const jsonIntegration = new IntegrationReader('nginx', adaptor);

    await expect(jsonIntegration.getConfig()).resolves.toMatchObject(fsConfig);
  });

  it('Should filter its list on join', async () => {
    const adaptor = new JsonCatalogDataAdaptor(TEST_CATALOG_NO_SERIALIZATION);
    const joined = await adaptor.join('sample1');
    expect(joined.integrationsList).toHaveLength(1);
  });

  it('Should correctly identify repository type', async () => {
    const adaptor = new JsonCatalogDataAdaptor(TEST_CATALOG_NO_SERIALIZATION);
    await expect(adaptor.getDirectoryType()).resolves.toBe('repository');
  });

  it('Should correctly identify integration type after filtering', async () => {
    const adaptor = new JsonCatalogDataAdaptor(TEST_CATALOG_NO_SERIALIZATION);
    const joined = await adaptor.join('sample1');
    await expect(joined.getDirectoryType()).resolves.toBe('integration');
  });

  it('Should correctly retrieve integration versions', async () => {
    const adaptor = new JsonCatalogDataAdaptor(TEST_CATALOG_NO_SERIALIZATION);
    const versions = await adaptor.findIntegrationVersions('sample2');
    expect((versions as { value: string[] }).value).toHaveLength(2);
  });

  it('Should correctly supply latest integration version for IntegrationReader', async () => {
    const adaptor = new JsonCatalogDataAdaptor(TEST_CATALOG_NO_SERIALIZATION);
    const reader = new IntegrationReader('sample2', adaptor.join('sample2'));
    const version = await reader.getLatestVersion();
    expect(version).toBe('2.1.0');
  });
});
