/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const topCmd = `## top
---
### Description

Use the \`top\` command to find the most common tuple of values for all
fields in the field list.

### Syntax

top \[N\] &lt;field-list&gt; \[by-clause\]

-   \`N\`: The number of results you want to see. Default is 10.
-   \`field-list\`: Required. The comma-delimited field list.
-   \`by-clause\`: Optional. One or more fields to group by.

#### Example 1: Find the most common values in a field

The following PPL query example finds the most common gender.

    os> source=accounts | top 1 gender;
    fetched rows / total rows = 1/1
    +------------+
    | gender     |
    |------------|
    | M          |
    +------------+

#### Example 2: Find the most common values grouped by gender

The following PPL query example finds the most common age grouped by gender.

    os> source=accounts | top 1 age by gender;
    fetched rows / total rows = 2/2
    +----------+----------+
    | gender   | age      |
    |----------+----------|
    | F        | 39       |
    | M        | 31       |
    +----------+----------+

#### Limitation
The \`top\` command is not rewritten to Query DSL. It's only run on the coordinating node.
`;
