/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

interface CatalogReader {
  readFile: (filename: string) => Promise<string>;
  readFileRaw: (filename: string) => Promise<Buffer>;
  readDir: (filename: string) => Promise<string[]>;
  isDirectory: (filename: string) => Promise<boolean>;
}
