/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

interface CatalogReader {
  readFile: (filename: string) => Promise<string>;
  readDir: (filename: string) => Promise<string[]>;
  isDir: (filename: string) => Promise<boolean>;
}
