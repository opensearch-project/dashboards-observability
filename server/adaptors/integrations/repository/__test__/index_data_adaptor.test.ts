/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IntegrationReader } from '../integration_reader';
import { JsonCatalogDataAdaptor } from '../json_data_adaptor';
import { TEST_INTEGRATION_CONFIG } from '../../../../../test/constants';
import { savedObjectsClientMock } from '../../../../../../../src/core/server/mocks';
import { IndexDataAdaptor } from '../index_data_adaptor';
import { SavedObjectsClientContract } from '../../../../../../../src/core/server';

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

// Copy of json_data_adaptor.test.ts with new reader type
// Since implementation at time of writing is to defer to json adaptor
describe('Index Data Adaptor', () => {
  let mockClient: SavedObjectsClientContract;

  beforeEach(() => {
    mockClient = savedObjectsClientMock.create();
    mockClient.find = jest.fn().mockResolvedValue({
      saved_objects: TEST_CATALOG_NO_SERIALIZATION.map((item) => ({
        attributes: item,
      })),
    });
  });

  it('Should correctly identify repository type', async () => {
    const adaptor = new IndexDataAdaptor(mockClient);
    await expect(adaptor.getDirectoryType()).resolves.toBe('repository');
  });

  it('Should correctly identify integration type after filtering', async () => {
    const adaptor = new JsonCatalogDataAdaptor(TEST_CATALOG_NO_SERIALIZATION);
    const joined = await adaptor.join('sample1');
    await expect(joined.getDirectoryType()).resolves.toBe('integration');
  });

  it('Should correctly retrieve integration versions', async () => {
    const adaptor = new IndexDataAdaptor(mockClient);
    const versions = await adaptor.findIntegrationVersions('sample2');
    expect((versions as { value: string[] }).value).toHaveLength(2);
  });

  it('Should correctly supply latest integration version for IntegrationReader', async () => {
    const adaptor = new IndexDataAdaptor(mockClient);
    const reader = new IntegrationReader('sample2', adaptor.join('sample2'));
    const version = await reader.getLatestVersion();
    expect(version).toBe('2.1.0');
  });

  it('Should find integration names', async () => {
    const adaptor = new IndexDataAdaptor(mockClient);
    const integResult = await adaptor.findIntegrations();
    const integs = (integResult as { value: string[] }).value;
    integs.sort();

    expect(integs).toEqual(['sample1', 'sample2']);
  });

  it('Should reject any attempts to read a file with a type', async () => {
    const adaptor = new IndexDataAdaptor(mockClient);
    const result = await adaptor.readFile('logs-1.0.0.json', 'schemas');
    await expect(result.error?.message).toBe(
      'JSON adaptor does not support subtypes (isConfigLocalized: true)'
    );
  });

  it('Should reject any attempts to read a raw file', async () => {
    const adaptor = new JsonCatalogDataAdaptor(TEST_CATALOG_NO_SERIALIZATION);
    const result = await adaptor.readFileRaw('logo.svg', 'static');
    await expect(result.error?.message).toBe(
      'JSON adaptor does not support raw files (isConfigLocalized: true)'
    );
  });

  it('Should reject nested directory searching', async () => {
    const adaptor = new JsonCatalogDataAdaptor(TEST_CATALOG_NO_SERIALIZATION);
    const result = await adaptor.findIntegrations('sample1');
    await expect(result.error?.message).toBe(
      'Finding integrations for custom dirs not supported for JSONreader'
    );
  });

  it('Should report unknown directory type if integration list is empty', async () => {
    const adaptor = new JsonCatalogDataAdaptor([]);
    await expect(adaptor.getDirectoryType()).resolves.toBe('unknown');
  });
});
