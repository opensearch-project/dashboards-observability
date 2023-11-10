/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import { TemplateManager } from '../repository';
import { IntegrationReader } from '../integration';
import { Dirent, Stats } from 'fs';
import path from 'path';

jest.mock('fs/promises');

describe('Repository', () => {
  let repository: TemplateManager;

  beforeEach(() => {
    repository = new TemplateManager('path/to/directory');
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getIntegrationList', () => {
    it('should return an array of Integration instances', async () => {
      jest.spyOn(fs, 'readdir').mockResolvedValue((['folder1', 'folder2'] as unknown) as Dirent[]);
      jest.spyOn(fs, 'lstat').mockResolvedValue({ isDirectory: () => true } as Stats);
      jest
        .spyOn(IntegrationReader.prototype, 'getConfig')
        .mockResolvedValue({ ok: true, value: {} as any });

      const integrations = await repository.getIntegrationList();

      expect(integrations).toHaveLength(2);
      expect(integrations[0]).toBeInstanceOf(IntegrationReader);
      expect(integrations[1]).toBeInstanceOf(IntegrationReader);
    });

    it('should filter out null values from the integration list', async () => {
      jest.spyOn(fs, 'readdir').mockResolvedValue((['folder1', 'folder2'] as unknown) as Dirent[]);

      // Mock fs.lstat to return a mix of directories and files
      jest.spyOn(fs, 'lstat').mockImplementation(async (toLstat) => {
        if (toLstat.toString().startsWith(path.join('path', 'to', 'directory', 'folder1'))) {
          return { isDirectory: () => true } as Stats;
        } else {
          return { isDirectory: () => false } as Stats;
        }
      });

      jest
        .spyOn(IntegrationReader.prototype, 'getConfig')
        .mockResolvedValue({ ok: true, value: {} as any });

      const integrations = await repository.getIntegrationList();

      expect(integrations).toHaveLength(1);
      expect(integrations[0]).toBeInstanceOf(IntegrationReader);
    });

    it('should handle errors and return an empty array', async () => {
      jest.spyOn(fs, 'readdir').mockRejectedValue(new Error('Mocked error'));

      const integrations = await repository.getIntegrationList();

      expect(integrations).toEqual([]);
    });
  });

  describe('getIntegration', () => {
    it('should return an Integration instance if it exists and passes the check', async () => {
      jest.spyOn(fs, 'lstat').mockResolvedValue({ isDirectory: () => true } as Stats);
      jest
        .spyOn(IntegrationReader.prototype, 'getConfig')
        .mockResolvedValue({ ok: true, value: {} as any });

      const integration = await repository.getIntegration('integrationName');

      expect(integration).toBeInstanceOf(IntegrationReader);
    });

    it('should return null if the integration does not exist or fails checks', async () => {
      jest
        .spyOn(IntegrationReader.prototype, 'getConfig')
        .mockResolvedValue({ ok: false, error: new Error() });

      const integration = await repository.getIntegration('invalidIntegration');

      expect(integration).toBeNull();
    });
  });
});
