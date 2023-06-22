/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import { Repository } from '../repository';
import { Integration } from '../integration';
import { Dirent, Stats } from 'fs';
import path from 'path';

jest.mock('fs/promises');

describe('Repository', () => {
  let repository: Repository;

  beforeEach(() => {
    repository = new Repository('path/to/directory');
  });

  describe('getIntegrationList', () => {
    it('should return an array of Integration instances', async () => {
      // Mock fs.readdir to return a list of folders
      jest.spyOn(fs, 'readdir').mockResolvedValue((['folder1', 'folder2'] as unknown) as Dirent[]);

      // Mock fs.lstat to return a directory status
      jest.spyOn(fs, 'lstat').mockResolvedValue({ isDirectory: () => true } as Stats);

      // Mock Integration check method to always return true
      jest.spyOn(Integration.prototype, 'check').mockResolvedValue(true);

      const integrations = await repository.getIntegrationList();

      expect(integrations).toHaveLength(2);
      expect(integrations[0]).toBeInstanceOf(Integration);
      expect(integrations[1]).toBeInstanceOf(Integration);
    });

    it('should filter out null values from the integration list', async () => {
      jest.spyOn(fs, 'readdir').mockResolvedValue((['folder1', 'folder2'] as unknown) as Dirent[]);

      // Mock fs.lstat to return a mix of directories and files
      jest.spyOn(fs, 'lstat').mockImplementation(async (toLstat) => {
        if (toLstat === path.join('path', 'to', 'directory', 'folder1')) {
          return { isDirectory: () => true } as Stats;
        } else {
          return { isDirectory: () => false } as Stats;
        }
      });

      jest.spyOn(Integration.prototype, 'check').mockResolvedValue(true);

      const integrations = await repository.getIntegrationList();

      expect(integrations).toHaveLength(1);
      expect(integrations[0]).toBeInstanceOf(Integration);
    });

    it('should handle errors and return an empty array', async () => {
      jest.spyOn(fs, 'readdir').mockRejectedValue(new Error('Mocked error'));

      const integrations = await repository.getIntegrationList();

      expect(integrations).toEqual([]);
    });
  });

  describe('getIntegration', () => {
    it('should return an Integration instance if it exists and passes the check', async () => {
      jest.spyOn(Integration.prototype, 'check').mockResolvedValue(true);

      const integration = await repository.getIntegration('integrationName');

      expect(integration).toBeInstanceOf(Integration);
    });

    it('should return null if the integration does not exist or fails the check', async () => {
      jest.spyOn(Integration.prototype, 'check').mockResolvedValue(false);

      const integration = await repository.getIntegration('invalidIntegration');

      expect(integration).toBeNull();
    });
  });
});
