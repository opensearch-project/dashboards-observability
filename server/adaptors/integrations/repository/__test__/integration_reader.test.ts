/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import { IntegrationReader } from '../integration_reader';
import { Dirent, Stats } from 'fs';
import * as path from 'path';
import { TEST_INTEGRATION_CONFIG } from '../../../../../test/constants';

jest.mock('fs/promises');

describe('Integration', () => {
  let integration: IntegrationReader;

  beforeEach(() => {
    integration = new IntegrationReader('./sample');
    jest.spyOn(fs, 'lstat').mockResolvedValue({ isDirectory: () => true } as Stats);
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
    it('should return an error if the directory does not exist', async () => {
      const spy = jest
        .spyOn(fs, 'lstat')
        .mockResolvedValueOnce({ isDirectory: () => false } as Stats);

      const result = await integration.getConfig();

      expect(spy).toHaveBeenCalled();
      expect(result.error?.message).toContain('not a valid integration directory');
    });

    it('should return the parsed config template if it is valid', async () => {
      jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(TEST_INTEGRATION_CONFIG));
      jest.spyOn(fs, 'lstat').mockResolvedValueOnce({ isDirectory: () => true } as Stats);

      const result = await integration.getConfig(TEST_INTEGRATION_CONFIG.version);

      expect(result).toEqual({ ok: true, value: TEST_INTEGRATION_CONFIG });
    });

    it('should return an error if the config template is invalid', async () => {
      const invalidTemplate = { ...TEST_INTEGRATION_CONFIG, version: 2 };
      jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(invalidTemplate));

      const result = await integration.getConfig(TEST_INTEGRATION_CONFIG.version);

      expect(result.error?.message).toBe('data/version must be string');
    });

    it('should return an error if the config file has syntax errors', async () => {
      jest.spyOn(fs, 'readFile').mockResolvedValue('Invalid JSON');

      const result = await integration.getConfig(TEST_INTEGRATION_CONFIG.version);

      expect(result.error?.message).toBe('Unable to parse file as JSON or NDJson');
    });

    it('should return an error if the integration config does not exist', async () => {
      integration.directory = './empty-directory';
      const readFileMock = jest.spyOn(fs, 'readFile').mockImplementation((..._args) => {
        // Can't find any information on how to mock an actual file not found error,
        // But at least according to the current implementation this should be equivalent.
        const error: Error = new Error('ENOENT: File not found');
        (error as { code?: string }).code = 'ENOENT';
        return Promise.reject(error);
      });

      const result = await integration.getConfig(TEST_INTEGRATION_CONFIG.version);

      expect(readFileMock).toHaveBeenCalled();
      expect(result.error?.message).toContain('File not found');
    });
  });

  describe('getAssets', () => {
    it('should return linked saved object assets when available', async () => {
      jest
        .spyOn(fs, 'readFile')
        .mockResolvedValueOnce(JSON.stringify(TEST_INTEGRATION_CONFIG))
        .mockResolvedValue('{"name":"asset1"}\n{"name":"asset2"}');

      const result = await integration.getAssets(TEST_INTEGRATION_CONFIG.version);

      expect(result.ok).toBe(true);
      expect((result as { value: { savedObjects: unknown } }).value.savedObjects).toEqual([
        { name: 'asset1' },
        { name: 'asset2' },
      ]);
    });

    it('should return an error if the provided version has no config', async () => {
      jest.spyOn(fs, 'readFile').mockRejectedValueOnce(new Error('ENOENT: File not found'));
      const result = await integration.getAssets();

      expect(result.error?.message).toContain('File not found');
    });

    it('should return an error if the saved object assets are invalid', async () => {
      jest
        .spyOn(fs, 'readFile')
        .mockResolvedValueOnce(JSON.stringify(TEST_INTEGRATION_CONFIG))
        .mockResolvedValue('{"unclosed":');

      const result = await integration.getAssets(TEST_INTEGRATION_CONFIG.version);

      expect(result.error?.message).toBe('Unable to parse file as JSON or NDJson');
    });
  });

  describe('getSchemas', () => {
    it('should retrieve mappings and schemas for all components in the config', async () => {
      const sampleConfig = {
        ...TEST_INTEGRATION_CONFIG,
        components: [
          { name: 'logs', version: '1.0.0' },
          { name: 'component2', version: '2.0.0' },
        ],
      };

      jest
        .spyOn(fs, 'readFile')
        .mockResolvedValueOnce(JSON.stringify(sampleConfig))
        .mockResolvedValueOnce(JSON.stringify({ mapping: 'mapping1' }))
        .mockResolvedValueOnce(JSON.stringify({ mapping: 'mapping2' }));

      const result = await integration.getSchemas();

      expect(result).toMatchObject({ ok: true });
      expect((result as { value: unknown }).value).toStrictEqual({
        mappings: {
          logs: { mapping: 'mapping1' },
          component2: { mapping: 'mapping2' },
        },
      });
    });

    it('should reject with an error if the config is invalid', async () => {
      jest.spyOn(fs, 'readFile').mockResolvedValueOnce(
        JSON.stringify({
          ...TEST_INTEGRATION_CONFIG,
          name: undefined,
        })
      );
      const result = await integration.getSchemas();

      expect(result.error?.message).toBe("data must have required property 'name'");
    });

    it('should reject with an error if a mapping file is invalid', async () => {
      jest
        .spyOn(fs, 'readFile')
        .mockResolvedValueOnce(JSON.stringify(TEST_INTEGRATION_CONFIG))
        .mockRejectedValueOnce(new Error('Could not load schema'));

      const result = await integration.getSchemas();
      expect(result.error?.message).toBe('Could not load schema');
    });
  });

  describe('getStatic', () => {
    it('should return data as a buffer if the static is present', async () => {
      const readFileMock = jest
        .spyOn(fs, 'readFile')
        .mockResolvedValue(Buffer.from('logo data', 'ascii'));

      const result = await integration.getStatic('logo.png');

      expect(result.ok).toBe(true);
      expect((result as { value: unknown }).value).toStrictEqual(Buffer.from('logo data', 'ascii'));
      expect(readFileMock).toBeCalledWith(path.join('sample', 'static', 'logo.png'));
    });

    it('should return an error if the static file is not found', async () => {
      jest.spyOn(fs, 'readFile').mockImplementation((..._args) => {
        const error: Error = new Error('ENOENT: File not found');
        (error as { code?: string }).code = 'ENOENT';
        return Promise.reject(error);
      });
      const result = await integration.getStatic('/logo.png');
      await expect(result.error?.message).toContain('File not found');
    });
  });

  describe('getSampleData', () => {
    it('should return sample data', async () => {
      const readFileMock = jest
        .spyOn(fs, 'readFile')
        .mockResolvedValueOnce(
          JSON.stringify({
            ...TEST_INTEGRATION_CONFIG,
            sampleData: {
              path: 'sample.json',
            },
          })
        )
        .mockResolvedValue('[{"sample": true}]');

      const result = await integration.getSampleData();

      expect(result.value).toStrictEqual({ sampleData: [{ sample: true }] });
      expect(readFileMock).toBeCalledWith(path.join('sample', 'data', 'sample.json'), {
        encoding: 'utf-8',
      });
    });

    it("should return null if there's no sample data", async () => {
      jest.spyOn(fs, 'readFile').mockResolvedValueOnce(
        JSON.stringify({
          ...TEST_INTEGRATION_CONFIG,
        })
      );

      const result = await integration.getSampleData();

      expect(result.ok).toBe(true);
      expect((result as { value: { sampleData: unknown } }).value.sampleData).toBeNull();
    });

    it('should catch and fail gracefully on invalid sample data', async () => {
      jest
        .spyOn(fs, 'readFile')
        .mockResolvedValueOnce(
          JSON.stringify({
            ...TEST_INTEGRATION_CONFIG,
            sampleData: {
              path: 'sample.json',
            },
          })
        )
        .mockResolvedValue('[{"closingBracket": false]');

      const result = await integration.getSampleData();

      expect(result.error?.message).toBe('Unable to parse file as JSON or NDJson');
    });
  });
});
