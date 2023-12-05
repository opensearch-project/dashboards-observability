/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import { TemplateManager } from '../repository';
import { IntegrationReader } from '../integration_reader';
import path from 'path';
import { JsonCatalogDataAdaptor } from '../json_data_adaptor';

describe('JSON Data Adaptor', () => {
  it('Should be able to deserialize a serialized integration', async () => {
    const repository: TemplateManager = new TemplateManager(
      path.join(__dirname, '../../__data__/repository')
    );
    const fsIntegration: IntegrationReader = (await repository.getIntegration('nginx'))!;
    const fsConfig = await fsIntegration.getConfig();
    const serialized = await fsIntegration.serialize();

    const adaptor: JsonCatalogDataAdaptor = new JsonCatalogDataAdaptor([serialized]);
    const jsonIntegration = new IntegrationReader('nginx', adaptor);

    expect(jsonIntegration.getConfig()).resolves.toEqual(fsConfig);
  });
});
