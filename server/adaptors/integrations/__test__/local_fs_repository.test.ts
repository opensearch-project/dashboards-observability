/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This file is used as integration tests for Integrations Repository functionality.
 */

import { TemplateManager } from '../repository/repository';
import { IntegrationReader } from '../repository/integration_reader';
import path from 'path';
import * as fs from 'fs/promises';
import { deepCheck } from '../repository/utils';
import { FileSystemDataAdaptor } from '../repository/fs_data_adaptor';
import { expectOkResult } from './custom_expects';

const repository: TemplateManager = new TemplateManager([
  new FileSystemDataAdaptor(path.join(__dirname, '../__data__/repository')),
]);

describe('The local repository', () => {
  it('Should only contain valid integration directories or files.', async () => {
    const directory = path.join(__dirname, '../__data__/repository');
    const folders = await fs.readdir(directory);
    await Promise.all(
      folders.map(async (folder) => {
        const integPath = path.join(directory, folder);
        if (!(await fs.lstat(integPath)).isDirectory()) {
          // If it's not a directory (e.g. a README), skip it
          return Promise.resolve(null);
        }
        // Otherwise, all directories must be integrations
        const integ = new IntegrationReader(integPath);
        const config = await integ.getConfig();
        expectOkResult(config, { integration: integ.name });
      })
    );
  });

  it('Should pass deep validation for all local integrations.', async () => {
    const integrations: IntegrationReader[] = await repository.getIntegrationList();
    await Promise.all(
      integrations.map(async (integ: IntegrationReader) => {
        const result = await deepCheck(integ);
        expectOkResult(result, { integration: integ.name });
      })
    );
  });
});

describe('Local Nginx Integration', () => {
  it('Should serialize without errors', async () => {
    const integration = await repository.getIntegration('nginx');

    await expect(integration?.serialize()).resolves.toEqual({
      ok: true,
      value: expect.anything(),
    });
  });

  it('Should serialize to include the config', async () => {
    const integration = await repository.getIntegration('nginx');
    const config = await integration!.getConfig();
    const serialized = await integration!.serialize();

    expect(serialized).toEqual({
      ok: true,
      value: expect.anything(),
    });
    expect(serialized.value).toMatchObject(config.value!);
  });
});
