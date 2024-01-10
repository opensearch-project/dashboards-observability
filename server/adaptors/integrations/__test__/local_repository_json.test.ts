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
      console.log(integ.name, validationResult);
      await expect(validationResult).toHaveProperty('ok', true);
    }
  });
});
