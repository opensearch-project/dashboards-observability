/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Repository } from '../repository/repository';
import { Integration } from '../repository/integration';
import path from 'path';

describe('The local repository', () => {
  it('Should pass shallow validation for all local integrations.', async () => {
    const repository: Repository = new Repository(path.join(__dirname, '../__data__/repository'));
    const integrations: Integration[] = await repository.getIntegrationList();
    await Promise.all(integrations.map((i) => expect(i.check()).resolves.toBeTruthy()));
  });

  it('Should pass deep validation for all local integrations.', async () => {
    const repository: Repository = new Repository(path.join(__dirname, '../__data__/repository'));
    const integrations: Integration[] = await repository.getIntegrationList();
    await Promise.all(integrations.map((i) => expect(i.deepCheck()).resolves.toBeTruthy()));
  });

  it('Should not have a type that is not imported in the config', async () => {
    const repository: Repository = new Repository(path.join(__dirname, '../__data__/repository'));
    const integrations: Integration[] = await repository.getIntegrationList();
    for (const integration of integrations) {
      const config = await integration.getConfig();
      const components = config!.components.map((x) => x.name);
      expect(components).toContain(config!.type);
    }
  });
});
