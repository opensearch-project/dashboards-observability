/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const sortCmd = `## sort 
---
### Description

Use the \`sort\` command to sort search results by a specified field.

### Syntax

sort &lt;\[+\|-\] sort-field&gt;...

-   \`sort-field\`: Required. The field to sort.
-   \[+\|-\]: Optional. A plus sign \[+\] indicates ascending order, with null and missing values first. A minus sign \[-\] indicates descending order, with null and missing values last. Default is ascending order.

#### Example 1: Sort by one field

The following PPL query example shows how to sort documents, with the \`age\` field in ascending order.

    os> source=accounts | sort age | fields account_number, age;
    fetched rows / total rows = 4/4
    +------------------+-------+
    | account_number   | age   |
    |------------------+-------|
    | 13               | 28    |
    | 1                | 32    |
    | 18               | 33    |
    | 6                | 36    |
    +------------------+-------+

#### Example 2: Sort by one field and return all results

The following PPL query example shows how to sort and return all documents, with the \`age\` field in ascending order.

    os> source=accounts | sort age | fields account_number, age;
    fetched rows / total rows = 4/4
    +------------------+-------+
    | account_number   | age   |
    |------------------+-------|
    | 13               | 28    |
    | 1                | 32    |
    | 18               | 33    |
    | 6                | 36    |
    +------------------+-------+

#### Example 3: Sort by one field in descending order

The following PPL query example shows how to sort all documents, with the \`age\` field in descending order.

    os> source=accounts | sort - age | fields account_number, age;
    fetched rows / total rows = 4/4
    +------------------+-------+
    | account_number   | age   |
    |------------------+-------|
    | 6                | 36    |
    | 18               | 33    |
    | 1                | 32    |
    | 13               | 28    |
    +------------------+-------+

#### Example 4: Sort multiple fields in both ascending and descending order 

The following PPL query example shows how to sort all documents in ascending and descending order, with the \`gender\` field in ascending order and the \`age\` field in descending order.

    os> source=accounts | sort + gender, - age | fields account_number, gender, age;
    fetched rows / total rows = 4/4
    +------------------+----------+-------+
    | account_number   | gender   | age   |
    |------------------+----------+-------|
    | 13               | F        | 28    |
    | 6                | M        | 36    |
    | 18               | M        | 33    |
    | 1                | M        | 32    |
    +------------------+----------+-------+

#### Example 5: Sort by field, including null values

The following PPL query example shows how to sort by the \`employer\` field using the default order (ascending order, with null first).

    os> source=accounts | sort employer | fields employer;
    fetched rows / total rows = 4/4
    +------------+
    | employer   |
    |------------|
    | null       |
    | Netagy     |
    | Pyrami     |
    | Quility    |
    +------------+
`;