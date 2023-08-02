/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Repository } from '../repository/repository';
import { Integration } from '../repository/integration';
import path from 'path';
import * as fs from 'fs/promises';

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
        const integ = new Integration(integPath);
        await expect(integ.check()).resolves.toBe(true);
      })
    );
  });

  it('Should pass deep validation for all local integrations.', async () => {
    const repository: Repository = new Repository(path.join(__dirname, '../__data__/repository'));
    const integrations: Integration[] = await repository.getIntegrationList();
    await Promise.all(integrations.map((i) => expect(i.deepCheck()).resolves.toBeTruthy()));
  });
});
