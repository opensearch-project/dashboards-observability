/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageParser } from '../types';

const extractPPLQueries = (content: string) => {
  return Array.from(content.matchAll(/(^|[\n\r]|:)\s*(source\s*=\s*.+)/gi)).map(
    (match) => match[2]
  );
};

export const PPLParsers: MessageParser = {
  id: 'ppl_visualization_message',
  async parserProvider(interaction) {
    const ppls: string[] =
      (interaction.additional_info?.['PPLTool.output'] as string[] | null)?.flatMap(
        (item: string) => {
          let ppl: string = '';
          try {
            const outputResp = JSON.parse(item);
            ppl = outputResp.ppl;
          } catch (e) {
            ppl = item;
          }

          return extractPPLQueries(ppl);
        }
      ) || [];

    if (!ppls.length) return [];

    return ppls.map((query) => {
      const finalQuery = query
        .replace(/`/g, '') // workaround for https://github.com/opensearch-project/dashboards-observability/issues/509, https://github.com/opensearch-project/dashboards-observability/issues/557
        .replace(/\bSPAN\(/g, 'span('); // workaround for https://github.com/opensearch-project/dashboards-observability/issues/759
      return {
        type: 'output',
        content: finalQuery,
        contentType: 'ppl_data_grid',
        fullWidth: true,
      };
    });
  },
};
