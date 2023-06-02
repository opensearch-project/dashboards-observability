/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import { IntegrationsRepository } from '../integrations_repository';

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
  },
}));

describe('IntegrationsRepository', () => {
  const mockReadFile = fs.promises.readFile as jest.MockedFunction<typeof fs.promises.readFile>;
  const repository = new IntegrationsRepository();

  beforeEach(() => {
    jest.clearAllMocks();
    repository._clear();
  });

  it('should initialize the repository', async () => {
    const buffer = '[{"name": "Template 1"}, {"name": "Template 2"}]';
    mockReadFile.mockResolvedValue(buffer);

    await repository.init();

    expect(mockReadFile).toHaveBeenCalledWith(repository.repositoryPath, 'utf-8');
    expect(repository.repository).toEqual([{ name: 'Template 1' }, { name: 'Template 2' }]);
    expect(repository.initialized).toBe(true);
  });

  it('should return the repository', async () => {
    const buffer = '[{"name": "Template 1"}, {"name": "Template 2"}]';
    mockReadFile.mockResolvedValue(buffer);

    const result = await repository.get();

    expect(result).toEqual([{ name: 'Template 1' }, { name: 'Template 2' }]);
    expect(repository.initialized).toBe(true);
  });

  it('should return a template by name', async () => {
    const buffer = '[{"name": "Template 1"}, {"name": "Template 2"}]';
    mockReadFile.mockResolvedValue(buffer);

    const result = await repository.getByName('Template 2');

    expect(result).toEqual({ name: 'Template 2' });
    expect(repository.initialized).toBe(true);
  });

  it('should reject when template is not found by name', async () => {
    const buffer = '[{"name": "Template 1"}, {"name": "Template 2"}]';
    mockReadFile.mockResolvedValue(buffer);

    await expect(repository.getByName('Template 3')).rejects.toEqual({
      message: 'Integration template with name Template 3 not found',
      statusCode: 404,
    });
    expect(repository.initialized).toBe(true);
  });
});
