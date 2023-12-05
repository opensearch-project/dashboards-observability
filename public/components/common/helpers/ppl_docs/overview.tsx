/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const overview = `## Overview
---
Piped Processing Language (PPL) is a query language for OpenSearch that processes data in a sequential, step-by-step manner. PPL uses a set of commands, connected by pipes (|), to process data and return results. (Note that the requests and results are read only.) 

You can query data in OpenSearch using [PPL](https://opensearch.org/docs/latest/search-plugins/sql/ppl/index/), [Query DSL](https://opensearch.org/docs/latest/query-dsl/index/), or [SQL](https://opensearch.org/docs/latest/search-plugins/sql/sql/index/).

PPL is designed to be easy to use. You don't need to learn a complex syntax or understand how OpenSearch works behind the scene. Just write the commands you need, and PPL will take care of the rest. 

PPL is the primary language used with observability in OpenSearch, and it supports queries across multiple data sources. Developers, DevOps engineers, support engineers, site reliability engineers (SREs), and IT managers find it useful for exploring and discovering log, monitoring, and observability data. For example, you can use PPL to:

- Find all log messages that contain a specific error code. 
- Identify trends in your data over time. 
- Group similar data points.
- Calculate statistics for your data.

PPL is available in OpenSearch Dashboards and in a standalone command-line tool. Within OpenSearch Dashboards, you can use [Query Workbench](https://opensearch.org/docs/latest/dashboards/query-workbench/) to run on-demand PPL commands and view and save the results as text and JSON. The [PPL command line interface (CLI)](https://opensearch.org/docs/latest/search-plugins/sql/cli/) is a standalone Python application that you can launch with the \`opensearchsql\` command. The PPL CLI is useful for running on-demand PPL commands and viewing and saving the results as text and JSON.

Here's an example of a PPL query. This query retrieves the first and last names of all accounts where the age is greater than 18.

\`\`\` 
source=accounts
| where age > 18
| fields firstname, lastname
\`\`\`
`;
