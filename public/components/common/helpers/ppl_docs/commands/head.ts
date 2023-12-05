/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const headCmd = `## head
---

### Description

Use the \`head\` command to return the first N number of lines from a search result.

### Syntax

head \[N\]

-   \`N\`: Optional. The number of results you want to see. Default is 10.

#### Example 1: Get first 10 results

The following PPL query example shows how to use \`head\` to get the first 10 search results. 
    os> source=accounts | fields firstname, age | head;
    fetched rows / total rows = 10/10
    +---------------+-----------+
    | firstname     | age       |
    |---------------+-----------|
    | Amber         | 32        |
    | Hattie        | 36        |
    | Nanette       | 28        |
    | Dale          | 33        |
    | Elinor        | 36        |
    | Virginia      | 39        |
    | Dillard       | 34        |
    | Mcgee         | 39        |
    | Aurelia       | 37        |
    | Fulton        | 23        |
    +---------------+-----------+

#### Example 2: Get first N results

The following PPL query example shows how to use \`head\` to get a speficied number of search results. In this example, N is 3. 

    os> source=accounts | fields firstname, age | head 3;
    fetched rows / total rows = 3/3
    +---------------+-----------+
    | firstname     | age       |
    |---------------+-----------|
    | Amber         | 32        |
    | Hattie        | 36        |
    | Nanette       | 28        |
    +---------------+-----------+

#### Limitation
The \`head\` command is not rewritten to Query DSL. It's only run on the coordinating node.
`;