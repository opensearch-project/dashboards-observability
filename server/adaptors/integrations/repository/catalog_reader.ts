/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

type IntegrationPart = 'assets' | 'data' | 'schemas' | 'static';

interface CatalogReader {
  readFile: (filename: string, type?: IntegrationPart) => Promise<string>;
  readFileRaw: (filename: string, type?: IntegrationPart) => Promise<Buffer>;
  readDir: (filename: string) => Promise<string[]>;
  isDirectory: (filename: string) => Promise<boolean>;
}
