/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export function tryParseNDJson(content: string): object[] | null {
  try {
    const objects = [];
    for (const line of content.split('\n')) {
      if (line.trim() === '') {
        // Other OSD ndjson parsers skip whitespace lines
        continue;
      }
      objects.push(JSON.parse(line));
    }
    return objects;
  } catch (err) {
    return null;
  }
}
