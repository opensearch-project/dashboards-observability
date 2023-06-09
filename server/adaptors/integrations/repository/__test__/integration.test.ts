import * as fs from 'fs/promises';
import { Integration } from '../integration';
import { Dirent, Stats } from 'fs';

jest.mock('fs/promises');

describe('Integration', () => {
  let integration: Integration;
  const sampleIntegration: IntegrationTemplate = {
    name: 'sample',
    version: '2.0.0',
    integrationType: 'sample',
    license: 'Apache-2.0',
    components: [],
    assets: {},
  };

  beforeEach(() => {
    integration = new Integration('./sample');
    jest.resetAllMocks();
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
      const invalidTemplate = { name: sampleIntegration.name, version: 2 };
      jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(invalidTemplate));
      const logValidationErrorsMock = jest.spyOn(console, 'error');

      const result = await integration.getConfig(sampleIntegration.version);

      expect(result).toBeNull();
      expect(logValidationErrorsMock).toHaveBeenCalledWith(expect.any(String), expect.any(Array));
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
      const readFileMock = jest.spyOn(fs, 'readFile').mockImplementation((..._args) => {
        // Can't find any information on how to mock an actual file not found error,
        // But at least according to the current implementation this should be equivalent.
        const error: any = new Error('ENOENT: File not found');
        error.code = 'ENOENT';
        return Promise.reject(error);
      });

      const result = await integration.getConfig(sampleIntegration.version);

      expect(readFileMock).toHaveBeenCalled();
      expect(logErrorsMock).toHaveBeenCalledWith(expect.any(String));
      expect(result).toBeNull();
    });
  });
});
