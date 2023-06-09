import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import path from 'path';
import { ValidateFunction } from 'ajv';
import { templateValidator } from '../validators';

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

function logValidationErrors(integration: string, validator: ValidateFunction<any>) {
  const errors = validator.errors?.map((e) => e.message);
  console.error(`Validation errors in ${integration}`, errors);
}

export class Integration {
  directory: string;
  name: string;

  constructor(directory: string) {
    this.directory = directory;
    this.name = path.basename(directory);
  }

  async check(): Promise<boolean> {
    if (!existsSync(this.directory)) {
      return false;
    }
    return (await this.getConfig()) !== null;
  }

  async getLatestVersion(): Promise<string | null> {
    const files = await fs.readdir(this.directory);
    const versions = files
      .filter((file) => path.extname(file) === '.json' && file.startsWith(`${this.name}-`))
      .map((file) => file.substring(this.name.length + 1, file.length - 5)) // Extract version from the file name
      .sort((a, b) => compareVersions(a, b)); // Sort versions in descending order

    if (versions.length > 0) {
      return versions[0];
    }
    return null;
  }

  async getConfig(version?: string): Promise<IntegrationTemplate | null> {
    const maybeVersion: string | null = version ? version : await this.getLatestVersion();
    if (maybeVersion === null) {
      return null;
    }
    const configFile = `${this.name}-${maybeVersion}.json`;
    const configPath = path.join(this.directory, configFile);
    const config = await fs.readFile(configPath, { encoding: 'utf-8' });
    try {
      const possibleTemplate = JSON.parse(config);
      if (!templateValidator(possibleTemplate)) {
        logValidationErrors(`${configFile}`, templateValidator);
        return null;
      }
      return possibleTemplate;
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        console.error(`Syntax errors in ${configFile}`, err);
        return null;
      }
      throw Error('Could not load integration', { cause: err });
    }
  }
}
