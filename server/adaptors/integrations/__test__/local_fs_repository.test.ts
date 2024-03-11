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
        await expect(integ.getConfig()).resolves.toMatchObject({ ok: true });
      })
    );
  });

  it('Should pass deep validation for all local integrations.', async () => {
    const integrations: IntegrationReader[] = await repository.getIntegrationList();
    await Promise.all(
      integrations.map(async (i) => {
        const result = await deepCheck(i);
        if (!result.ok) {
          console.error(result.error);
        }
        expect(result.ok).toBe(true);
      })
    );
  });
});

describe('Local Nginx Integration', () => {
  it('Should serialize without errors', async () => {
    const integration = await repository.getIntegration('nginx');

    await expect(integration?.serialize()).resolves.toHaveProperty('ok', true);
  });

  it('Should serialize to include the config', async () => {
    const integration = await repository.getIntegration('nginx');
    const config = await integration!.getConfig();
    const serialized = await integration!.serialize();

    expect(serialized).toHaveProperty('ok', true);
    expect((serialized as { value: object }).value).toMatchObject(
      (config as { value: object }).value
    );
  });
});
