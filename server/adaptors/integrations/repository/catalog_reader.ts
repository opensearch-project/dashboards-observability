/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

interface CatalogReader {
  readFile: (filename: string) => Promise<string>;
  readDir: (filename: string) => Promise<string[]>;
  isIntegration: (filename: string) => Promise<boolean>;
  isRepository: (filename: string) => Promise<boolean>;
}
