/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

export const assetMapper = (tutorialId: string) => {
  switch (tutorialId) {
    case 'otel':
      return 'otel-index-patterns-1.0.0.ndjson';
    case 'nginx':
      return 'nginx-1.0.0.ndjson';
    case 'java':
      return 'java-tutorial-1.0.0.ndjson';
    case 'python':
      return 'python-tutorial-1.0.0.ndjson';
    case 'golang':
      return 'golang-tutorial-1.0.0.ndjson';
    case 'csv':
      return 'fluent-bit-csv-upload-1.0.0.ndjson';
    case 'data-prepper':
      return 'dummy.ndjson';
    default:
      return '';
  }
};

export const loadAssetsFromFile = async (tutorialId: string) => {
  try {
    const fileName = assetMapper(tutorialId);
    const filePath = path.join(__dirname, `assets/${fileName}`);
    const fileData = await fs.promises.readFile(filePath, 'utf8');
    return fileData;
  } catch (error) {
    throw new Error('Issue is loading asset');
  }
};
