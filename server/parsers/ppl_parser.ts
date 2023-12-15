/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const extractPPLQueries = (content: string) => {
    return Array.from(content.matchAll(/(^|[\n\r]|:)\s*(source\s*=\s*.+)/gi)).map(
        (match) => match[2]
    );
};

export const PPLParsers = {
    id: 'ppl_visualization_message',
    async parserProvider(interaction) {
        const ppls: string[] = interaction.additional_info?.["PPLTool.output"]?.flatMap((item: string) => {
            let ppl: string = ""
            try {
                const outputResp = JSON.parse(item);
                ppl = outputResp.ppl;
            } catch (e) {
                ppl = item;
            }

            return extractPPLQueries(ppl);
        });

        if (!ppls.length) return [];

        const statsPPLs = ppls.filter((ppl) => /\|\s*stats\s+[^|]+\sby\s/i.test(ppl));
        if (!statsPPLs.length) {
            return [];
        }

        return statsPPLs.map((query) => ({
            type: 'output',
            content: query,
            contentType: 'ppl_visualization',
            suggestedActions: [
                {
                    message: 'View details',
                    actionType: 'view_ppl_visualization',
                    metadata: { query, question: interaction.input },
                },
            ],
        }));
    },
};
