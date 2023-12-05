/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const stringFunction = `## String
---

### CONCAT

\`CONCAT(str1, str2)\` returns \`str1\` and \`str\` concatenated strings.

Argument type: STRING, STRING

Return type: STRING

**Example**

    os> source=people | eval \`CONCAT('hello', 'world')\` = CONCAT('hello', 'world') | fields \`CONCAT('hello', 'world')\`
    fetched rows / total rows = 1/1
    +----------------------------+
    | CONCAT('hello', 'world')   |
    |----------------------------|
    | helloworld                 |
    +----------------------------+

### CONCAT\_WS

\`CONCAT\_WS(sep, str1, str2)\` is a function that concatenates two strings together, using \`sep\` as a separator between them.

Argument type: STRING, STRING, STRING

Return type: STRING

**Example**

    os> source=people | eval \`CONCAT_WS(',', 'hello', 'world')\` = CONCAT_WS(',', 'hello', 'world') | fields \`CONCAT_WS(',', 'hello', 'world')\`
    fetched rows / total rows = 1/1
    +------------------------------------+
    | CONCAT_WS(',', 'hello', 'world')   |
    |------------------------------------|
    | hello,world                        |
    +------------------------------------+

### LENGTH

\`length(str)\` is a function that returns the length of a string, measured in number of bytes.

Specification: LENGTH(STRING) -&gt; INTEGER

Argument type: STRING

Return type: INTEGER

**Example**

    os> source=people | eval \`LENGTH('helloworld')\` = LENGTH('helloworld') | fields \`LENGTH('helloworld')\`
    fetched rows / total rows = 1/1
    +------------------------+
    | LENGTH('helloworld')   |
    |------------------------|
    | 10                     |
    +------------------------+

### LIKE

\`like(string, PATTERN)\` is a function that returns \`true\` if the string matches the \`PATTERN\` value.

Two wildcards commonly used with the \`like\` operator:

- \`%\`: A percent sign represents zero, one, or multiple characters.
- \`_\`: An underscore represents a single character.

**Example**

    os> source=people | eval \`LIKE('hello world', '_ello%')\` = LIKE('hello world', '_ello%') | fields \`LIKE('hello world', '_ello%')\`
    fetched rows / total rows = 1/1
    +---------------------------------+
    | LIKE('hello world', '_ello%')   |
    |---------------------------------|
    | True                            |
    +---------------------------------+

### LOWER

\`lower(string)\` is a function that converts a string to lowercase.

Argument type: STRING

Return type: STRING

**Example**

    os> source=people | eval \`LOWER('helloworld')\` = LOWER('helloworld'), \`LOWER('HELLOWORLD')\` = LOWER('HELLOWORLD') | fields \`LOWER('helloworld')\`, \`LOWER('HELLOWORLD')\`
    fetched rows / total rows = 1/1
    +-----------------------+-----------------------+
    | LOWER('helloworld')   | LOWER('HELLOWORLD')   |
    |-----------------------+-----------------------|
    | helloworld            | helloworld            |
    +-----------------------+-----------------------+

### LTRIM

\`ltrim(str)\` is a function that trims leading space characters from a string.

Argument type: STRING

Return type: STRING

**Example**

    os> source=people | eval \`LTRIM('   hello')\` = LTRIM('   hello'), \`LTRIM('hello   ')\` = LTRIM('hello   ') | fields \`LTRIM('   hello')\`, \`LTRIM('hello   ')\`
    fetched rows / total rows = 1/1
    +---------------------+---------------------+
    | LTRIM('   hello')   | LTRIM('hello   ')   |
    |---------------------+---------------------|
    | hello               | hello               |
    +---------------------+---------------------+

### RIGHT

\`right(str, len)\` is a function that returns the rightmost \`len\` characters from a \`str\` value. \`NULL\` is returned if any argument is null.

Argument type: STRING, INTEGER

Return type: STRING

**Example**

    os> source=people | eval \`RIGHT('helloworld', 5)\` = RIGHT('helloworld', 5), \`RIGHT('HELLOWORLD', 0)\` = RIGHT('HELLOWORLD', 0) | fields \`RIGHT('helloworld', 5)\`, \`RIGHT('HELLOWORLD', 0)\`
    fetched rows / total rows = 1/1
    +--------------------------+--------------------------+
    | RIGHT('helloworld', 5)   | RIGHT('HELLOWORLD', 0)   |
    |--------------------------+--------------------------|
    | world                    |                          |
    +--------------------------+--------------------------+

### RTRIM

\`rtrim(str)\` is a function that trims trailing space characters from a string.

Argument type: STRING

Return type: STRING

**Example**

    os> source=people | eval \`RTRIM('   hello')\` = RTRIM('   hello'), \`RTRIM('hello   ')\` = RTRIM('hello   ') | fields \`RTRIM('   hello')\`, \`RTRIM('hello   ')\`
    fetched rows / total rows = 1/1
    +---------------------+---------------------+
    | RTRIM('   hello')   | RTRIM('hello   ')   |
    |---------------------+---------------------|
    |    hello            | hello               |
    +---------------------+---------------------+

### SUBSTRING

\`substring(str, start)\` or \`substring(str, start, length)\` is a function that returns a substring of the input string \`str\`. If \`length\` is not specified, the function returns the entire string from the \`start\` index.

Argument type: STRING, INTEGER, INTEGER

Return type: STRING

Synonyms: SUBSTR

**Example**

    os> source=people | eval \`SUBSTRING('helloworld', 5)\` = SUBSTRING('helloworld', 5), \`SUBSTRING('helloworld', 5, 3)\` = SUBSTRING('helloworld', 5, 3) | fields \`SUBSTRING('helloworld', 5)\`, \`SUBSTRING('helloworld', 5, 3)\`
    fetched rows / total rows = 1/1
    +------------------------------+---------------------------------+
    | SUBSTRING('helloworld', 5)   | SUBSTRING('helloworld', 5, 3)   |
    |------------------------------+---------------------------------|
    | oworld                       | owo                             |
    +------------------------------+---------------------------------+

### TRIM

\`trim\` is a function used to remove leading and trailing white space from a string.

Argument Type: STRING

Return type: STRING

**Example**

    os> source=people | eval \`TRIM('   hello')\` = TRIM('   hello'), \`TRIM('hello   ')\` = TRIM('hello   ') | fields \`TRIM('   hello')\`, \`TRIM('hello   ')\`
    fetched rows / total rows = 1/1
    +--------------------+--------------------+
    | TRIM('   hello')   | TRIM('hello   ')   |
    |--------------------+--------------------|
    | hello              | hello              |
    +--------------------+--------------------+

### UPPER

\`upper(string)\` is a function that converts a string to uppercase.

Argument type: STRING

Return type: STRING

**Example**

    os> source=people | eval \`UPPER('helloworld')\` = UPPER('helloworld'), \`UPPER('HELLOWORLD')\` = UPPER('HELLOWORLD') | fields \`UPPER('helloworld')\`, \`UPPER('HELLOWORLD')\`
    fetched rows / total rows = 1/1
    +-----------------------+-----------------------+
    | UPPER('helloworld')   | UPPER('HELLOWORLD')   |
    |-----------------------+-----------------------|
    | HELLOWORLD            | HELLOWORLD            |
    +-----------------------+-----------------------+
`;
