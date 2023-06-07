import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Provides relatively low-level operations for reading the repository on the file system.
 * Using this class is preferred to direct access.
 */
export class RepositoryFileSystem {
  repoDirectory: string;

  constructor(repoDirectory: string) {
    this.repoDirectory = repoDirectory;
  }

  async get_integration_latest(name: string): Promise<string | null> {
    const integrationDirectory = path.join(this.repoDirectory, name);

    try {
      const files = await fs.readdir(integrationDirectory);
      const versions = files
        .filter((file) => path.extname(file) === '.json' && file.startsWith(`${name}-`))
        .map((file) => file.substring(name.length + 1, file.length - 5)) // Extract version from the file name
        .sort((a, b) => compareVersions(a, b)); // Sort versions in descending order

      if (versions.length > 0) {
        const latestVersion = versions[0];
        return path.join(integrationDirectory, `${name}-${latestVersion}.json`);
      }
    } catch (error) {
      console.error(`Error reading integration directory: ${integrationDirectory}`, error);
    }

    return null;
  }

  async get_latest_integrations(): Promise<string[]> {
    try {
      const directories = await fs.readdir(this.repoDirectory);
      const integrationDirectories = directories
        .map((directory) => path.join(this.repoDirectory, directory))
        .filter(async (directory) => (await fs.lstat(directory)).isDirectory());

      const integrationConfigs = [];

      for (const integrationDirectory of integrationDirectories) {
        const integrationName = path.basename(integrationDirectory);
        const latestConfig = await this.get_integration_latest(integrationName);
        if (latestConfig) {
          integrationConfigs.push(latestConfig);
        }
      }

      return integrationConfigs;
    } catch (error) {
      console.error(`Error reading integration directories in: ${this.repoDirectory}`, error);
      return [];
    }
  }
}

// Helper function to compare version numbers
function compareVersions(a: string, b: string) {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aValue = i < aParts.length ? aParts[i] : 0;
    const bValue = i < bParts.length ? bParts[i] : 0;

    if (aValue > bValue) {
      return -1; // a > b
    } else if (aValue < bValue) {
      return 1; // a < b
    }
  }

  return 0; // a == b
}
