/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import { Integration } from '../integration';
import { Dirent, Stats } from 'fs';
import * as path from 'path';

jest.mock('fs/promises');

describe('Integration', () => {
  let integration: Integration;
  const sampleIntegration: IntegrationTemplate = {
    name: 'sample',
    version: '2.0.0',
    license: 'Apache-2.0',
    type: 'logs',
    components: [
      {
        name: 'logs',
        version: '1.0.0',
      },
    ],
    assets: {
      savedObjects: {
        name: 'sample',
        version: '1.0.1',
      },
    },
  };

  beforeEach(() => {
    integration = new Integration('./sample');
  });

  describe('check', () => {
    it('should return false if the directory does not exist', async () => {
      const spy = jest.spyOn(fs, 'stat').mockResolvedValue({ isDirectory: () => false } as Stats);

      const result = await integration.check();

      expect(spy).toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('should return true if the directory exists and getConfig returns a valid template', async () => {
      jest.spyOn(fs, 'stat').mockResolvedValue({ isDirectory: () => true } as Stats);
      integration.getConfig = jest.fn().mockResolvedValue(sampleIntegration);

      const result = await integration.check();

      expect(result).toBe(true);
    });

    it('should return false if the directory exists but getConfig returns null', async () => {
      jest.spyOn(fs, 'stat').mockResolvedValue({ isDirectory: () => true } as Stats);
      integration.getConfig = jest.fn().mockResolvedValue(null);

      const result = await integration.check();

      expect(result).toBe(false);
    });
  });

  describe('getLatestVersion', () => {
    it('should return the latest version if there are JSON files matching the integration name', async () => {
      const files: unknown[] = ['sample-1.0.0.json', 'sample-2.0.0.json'];
      jest.spyOn(fs, 'readdir').mockResolvedValue(files as Dirent[]);

      const result = await integration.getLatestVersion();

      expect(result).toBe('2.0.0');
    });

    it('should return null if there are no JSON files matching the integration name', async () => {
      const files: unknown[] = ['other-1.0.0.json', 'other-2.0.0.json'];
      jest.spyOn(fs, 'readdir').mockResolvedValue(files as Dirent[]);

      const result = await integration.getLatestVersion();

      expect(result).toBeNull();
    });

    it('should ignore files without a decimal version', async () => {
      const files: unknown[] = ['sample-1.0.0.json', 'sample-2.0.two.json', 'sample-three.json'];
      jest.spyOn(fs, 'readdir').mockResolvedValue(files as Dirent[]);

      const result = await integration.getLatestVersion();

      expect(result).toBe('1.0.0');
    });
  });

  describe('getConfig', () => {
    it('should return the parsed config template if it is valid', async () => {
      jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(sampleIntegration));

      const result = await integration.getConfig(sampleIntegration.version);

      expect(result).toEqual(sampleIntegration);
    });

    it('should return null and log validation errors if the config template is invalid', async () => {
      const invalidTemplate = { ...sampleIntegration, version: 2 };
      jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(invalidTemplate));
      const logValidationErrorsMock = jest.spyOn(console, 'error');

      const result = await integration.getConfig(sampleIntegration.version);

      expect(result).toBeNull();
      expect(logValidationErrorsMock).toHaveBeenCalled();
    });

    it('should return null and log syntax errors if the config file has syntax errors', async () => {
      jest.spyOn(fs, 'readFile').mockResolvedValue('Invalid JSON');
      const logSyntaxErrorsMock = jest.spyOn(console, 'error');

      const result = await integration.getConfig(sampleIntegration.version);

      expect(result).toBeNull();
      expect(logSyntaxErrorsMock).toHaveBeenCalledWith(expect.any(String), expect.any(SyntaxError));
    });

    it('should return null and log errors if the integration config does not exist', async () => {
      integration.directory = './non-existing-directory';
      const logErrorsMock = jest.spyOn(console, 'error');
      jest.spyOn(fs, 'readFile').mockImplementation((..._args) => {
        // Can't find any information on how to mock an actual file not found error,
        // But at least according to the current implementation this should be equivalent.
        const error: any = new Error('ENOENT: File not found');
        error.code = 'ENOENT';
        return Promise.reject(error);
      });

      const result = await integration.getConfig(sampleIntegration.version);

      expect(jest.spyOn(fs, 'readFile')).toHaveBeenCalled();
      expect(logErrorsMock).toHaveBeenCalledWith(expect.any(String));
      expect(result).toBeNull();
    });
  });

  describe('getAssets', () => {
    it('should return linked saved object assets when available', async () => {
      integration.getConfig = jest.fn().mockResolvedValue(sampleIntegration);
      jest.spyOn(fs, 'readFile').mockResolvedValue('{"name":"asset1"}\n{"name":"asset2"}');

      const result = await integration.getAssets(sampleIntegration.version);

      expect(result.savedObjects).toEqual([{ name: 'asset1' }, { name: 'asset2' }]);
    });

    it('should reject a return if the provided version has no config', async () => {
      integration.getConfig = jest.fn().mockResolvedValue(null);

      expect(integration.getAssets()).rejects.toThrowError();
    });

    it('should log an error if the saved object assets are invalid', async () => {
      const logErrorsMock = jest.spyOn(console, 'error');
      integration.getConfig = jest.fn().mockResolvedValue(sampleIntegration);
      jest.spyOn(fs, 'readFile').mockResolvedValue('{"unclosed":');

      const result = await integration.getAssets(sampleIntegration.version);

      expect(logErrorsMock).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
      expect(result.savedObjects).toBeUndefined();
    });
  });

  describe('getSchemas', () => {
    it('should retrieve mappings and schemas for all components in the config', async () => {
      const sampleConfig = {
        components: [
          { name: 'component1', version: '1.0.0' },
          { name: 'component2', version: '2.0.0' },
        ],
      };
      integration.getConfig = jest.fn().mockResolvedValue(sampleConfig);

      const mappingFile1 = 'component1-1.0.0.mapping.json';
      const mappingFile2 = 'component2-2.0.0.mapping.json';

      jest
        .spyOn(fs, 'readFile')
        .mockResolvedValueOnce(JSON.stringify({ mapping: 'mapping1' }))
        .mockResolvedValueOnce(JSON.stringify({ mapping: 'mapping2' }));

      const result = await integration.getSchemas();

      expect(result).toEqual({
        mappings: {
          component1: { mapping: 'mapping1' },
          component2: { mapping: 'mapping2' },
        },
      });

      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(integration.directory, 'schemas', mappingFile1),
        { encoding: 'utf-8' }
      );
      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(integration.directory, 'schemas', mappingFile2),
        { encoding: 'utf-8' }
      );
    });

    it('should reject with an error if the config is null', async () => {
      integration.getConfig = jest.fn().mockResolvedValue(null);

      await expect(integration.getSchemas()).rejects.toThrowError(
        'Attempted to get assets of invalid config'
      );
    });

    it('should reject with an error if a mapping file is invalid', async () => {
      const sampleConfig = {
        components: [{ name: 'component1', version: '1.0.0' }],
      };
      integration.getConfig = jest.fn().mockResolvedValue(sampleConfig);
      jest.spyOn(fs, 'readFile').mockRejectedValueOnce(new Error('Could not load schema'));

      await expect(integration.getSchemas()).rejects.toThrowError('Could not load schema');
    });
  });

  describe('getStatic', () => {
    it('should return data as a buffer if the static is present', async () => {
      const readFileMock = jest
        .spyOn(fs, 'readFile')
        .mockResolvedValue(Buffer.from('logo data', 'ascii'));
      expect(await integration.getStatic('/logo.png')).toStrictEqual(
        Buffer.from('logo data', 'ascii')
      );
      expect(readFileMock).toBeCalledWith(path.join('sample', 'static', 'logo.png'));
    });

    it('should return null and log an error if the static file is not found', async () => {
      const logErrorsMock = jest.spyOn(console, 'error');
      jest.spyOn(fs, 'readFile').mockImplementation((..._args) => {
        const error: any = new Error('ENOENT: File not found');
        error.code = 'ENOENT';
        return Promise.reject(error);
      });
      expect(await integration.getStatic('/logo.png')).toBeNull();
      expect(logErrorsMock).toBeCalledWith(expect.any(String));
    });
  });
});
