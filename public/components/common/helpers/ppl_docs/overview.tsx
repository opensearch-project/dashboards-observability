/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const overview = `## Overview
---
Piped Processing Language (PPL) is a query language that focuses on processing data in a sequential, step-by-step manner. PPL uses the pipe (|) operator to combine commands to find and retrieve data. It is the primary language used with observability in OpenSearch and supports multi-data queries. These are read-only requests to process data
and return results.

Currently, OpenSearch users can query data using either Query DSL or
SQL. Query DSL is powerful and fast. However, it has a steep learning
curve, and was not designed as a human interface to easily create ad hoc
queries and explore user data. SQL allows users to extract and analyze
data in OpenSearch in a declarative manner. OpenSearch now makes its
search and query engine robust by introducing Piped Processing Language
(PPL). It enables users to extract insights from OpenSearch with a
sequence of commands delimited by pipes () syntax. It enables
developers, DevOps engineers, support engineers, site reliability
engineers (SREs), and IT managers to effectively discover and explore
log, monitoring and observability data stored in OpenSearch.

The capabilities of [Query Workbench](https://opensearch.org/docs/latest/dashboards/query-workbench/), a comprehensive and
integrated visual query tool currently supporting only SQL, to run
on-demand PPL commands, and view and save results as text and JSON. We
also add a new interactive standalone command line tool, the PPL CLI, to
run on-demand PPL commands, and view and save results as text and JSON.

The query start with search command and then flowing a set of command
delimited by pipe ( for example, the following query retrieve firstname
and lastname from accounts if age large than 18.

\`\`\` 
source=accounts
| where age > 18
| fields firstname, lastname
\`\`\`
`;
