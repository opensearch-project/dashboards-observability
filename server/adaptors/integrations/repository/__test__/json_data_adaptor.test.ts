/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TemplateManager } from '../repository';
import { IntegrationReader } from '../integration_reader';
import path from 'path';
import { JsonCatalogDataAdaptor } from '../json_data_adaptor';
import { TEST_INTEGRATION_CONFIG } from '../../../../../test/constants';

const TEST_CATALOG: SerializedIntegration[] = [
  {
    config: {
      ...TEST_INTEGRATION_CONFIG,
      name: 'sample1',
    },
  },
  {
    config: {
      ...TEST_INTEGRATION_CONFIG,
      name: 'sample2',
    },
  },
];

describe('JSON Data Adaptor', () => {
  it.skip('Should be able to deserialize a serialized integration', async () => {
    const repository: TemplateManager = new TemplateManager(
      path.join(__dirname, '../../__data__/repository')
    );
    const fsIntegration: IntegrationReader = (await repository.getIntegration('nginx'))!;
    const fsConfig = await fsIntegration.getConfig();
    const serialized = await fsIntegration.serialize();

    expect(serialized.ok).toBe(true);
    if (!serialized.ok) {
      return; // Trick type system into allowing access to value
    }

    const adaptor: JsonCatalogDataAdaptor = new JsonCatalogDataAdaptor([serialized.value]);
    const jsonIntegration = new IntegrationReader('nginx', adaptor);

    expect(jsonIntegration.getConfig()).resolves.toEqual(fsConfig);
  });

  it('Should filter its list on join', async () => {
    const adaptor = new JsonCatalogDataAdaptor(TEST_CATALOG);
    const joined = await adaptor.join('sample1');
    expect(joined.integrationsList).toHaveLength(1);
  });

  it('Should correctly identify repository type', async () => {
    const adaptor = new JsonCatalogDataAdaptor(TEST_CATALOG);
    expect(adaptor.getDirectoryType()).resolves.toBe('repository');
  });

  it('Should correctly identify integration type after filtering', async () => {
    const adaptor = new JsonCatalogDataAdaptor(TEST_CATALOG);
    const joined = await adaptor.join('sample1');
    expect(joined.getDirectoryType()).resolves.toBe('integration');
  });
});
