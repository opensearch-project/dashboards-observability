/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * The OpenSearch Contributors require contributions made to
 * this file be licensed under the Apache-2.0 license or a
 * compatible open source license.
 *
 * Modifications Copyright OpenSearch Contributors. See
 * GitHub history for details.
 */

export const stringFunction = `## String
---

### CONCAT

**Description**

Usage: CONCAT(str1, str2) returns str1 and str strings concatenated
together.

Argument type: STRING, STRING

Return type: STRING

Example:

    os> source=people | eval \`CONCAT('hello', 'world')\` = CONCAT('hello', 'world') | fields \`CONCAT('hello', 'world')\`
    fetched rows / total rows = 1/1
    +----------------------------+
    | CONCAT('hello', 'world')   |
    |----------------------------|
    | helloworld                 |
    +----------------------------+

### CONCAT\_WS

**Description**

Usage: CONCAT\_WS(sep, str1, str2) returns str1 concatenated with str2
using sep as a separator between them.

Argument type: STRING, STRING, STRING

Return type: STRING

Example:

    os> source=people | eval \`CONCAT_WS(',', 'hello', 'world')\` = CONCAT_WS(',', 'hello', 'world') | fields \`CONCAT_WS(',', 'hello', 'world')\`
    fetched rows / total rows = 1/1
    +------------------------------------+
    | CONCAT_WS(',', 'hello', 'world')   |
    |------------------------------------|
    | hello,world                        |
    +------------------------------------+

### LENGTH

**Description**

Specifications:

1.  LENGTH(STRING) -&gt; INTEGER

Usage: length(str) returns length of string measured in bytes.

Argument type: STRING

Return type: INTEGER

Example:

    os> source=people | eval \`LENGTH('helloworld')\` = LENGTH('helloworld') | fields \`LENGTH('helloworld')\`
    fetched rows / total rows = 1/1
    +------------------------+
    | LENGTH('helloworld')   |
    |------------------------|
    | 10                     |
    +------------------------+

### LIKE

**Description**

Usage: like(string, PATTERN) return true if the string match the
PATTERN.

There are two wildcards often used in conjunction with the LIKE
operator:

-   \`%\` - The percent sign represents zero, one, or multiple characters
-   \`_\` - The underscore represents a single character

Example:

    os> source=people | eval \`LIKE('hello world', '_ello%')\` = LIKE('hello world', '_ello%') | fields \`LIKE('hello world', '_ello%')\`
    fetched rows / total rows = 1/1
    +---------------------------------+
    | LIKE('hello world', '_ello%')   |
    |---------------------------------|
    | True                            |
    +---------------------------------+

### LOWER

**Description**

Usage: lower(string) converts the string to lowercase.

Argument type: STRING

Return type: STRING

Example:

    os> source=people | eval \`LOWER('helloworld')\` = LOWER('helloworld'), \`LOWER('HELLOWORLD')\` = LOWER('HELLOWORLD') | fields \`LOWER('helloworld')\`, \`LOWER('HELLOWORLD')\`
    fetched rows / total rows = 1/1
    +-----------------------+-----------------------+
    | LOWER('helloworld')   | LOWER('HELLOWORLD')   |
    |-----------------------+-----------------------|
    | helloworld            | helloworld            |
    +-----------------------+-----------------------+

### LTRIM

**Description**

Usage: ltrim(str) trims leading space characters from the string.

Argument type: STRING

Return type: STRING

Example:

    os> source=people | eval \`LTRIM('   hello')\` = LTRIM('   hello'), \`LTRIM('hello   ')\` = LTRIM('hello   ') | fields \`LTRIM('   hello')\`, \`LTRIM('hello   ')\`
    fetched rows / total rows = 1/1
    +---------------------+---------------------+
    | LTRIM('   hello')   | LTRIM('hello   ')   |
    |---------------------+---------------------|
    | hello               | hello               |
    +---------------------+---------------------+

### RIGHT

**Description**

Usage: right(str, len) returns the rightmost len characters from the
string str, or NULL if any argument is NULL.

Argument type: STRING, INTEGER

Return type: STRING

Example:

    os> source=people | eval \`RIGHT('helloworld', 5)\` = RIGHT('helloworld', 5), \`RIGHT('HELLOWORLD', 0)\` = RIGHT('HELLOWORLD', 0) | fields \`RIGHT('helloworld', 5)\`, \`RIGHT('HELLOWORLD', 0)\`
    fetched rows / total rows = 1/1
    +--------------------------+--------------------------+
    | RIGHT('helloworld', 5)   | RIGHT('HELLOWORLD', 0)   |
    |--------------------------+--------------------------|
    | world                    |                          |
    +--------------------------+--------------------------+

### RTRIM

**Description**

Usage: rtrim(str) trims trailing space characters from the string.

Argument type: STRING

Return type: STRING

Example:

    os> source=people | eval \`RTRIM('   hello')\` = RTRIM('   hello'), \`RTRIM('hello   ')\` = RTRIM('hello   ') | fields \`RTRIM('   hello')\`, \`RTRIM('hello   ')\`
    fetched rows / total rows = 1/1
    +---------------------+---------------------+
    | RTRIM('   hello')   | RTRIM('hello   ')   |
    |---------------------+---------------------|
    |    hello            | hello               |
    +---------------------+---------------------+

### SUBSTRING

**Description**

Usage: substring(str, start) or substring(str, start, length) returns
substring using start and length. With no length, entire string from
start is returned.

Argument type: STRING, INTEGER, INTEGER

Return type: STRING

Synonyms: SUBSTR

Example:

    os> source=people | eval \`SUBSTRING('helloworld', 5)\` = SUBSTRING('helloworld', 5), \`SUBSTRING('helloworld', 5, 3)\` = SUBSTRING('helloworld', 5, 3) | fields \`SUBSTRING('helloworld', 5)\`, \`SUBSTRING('helloworld', 5, 3)\`
    fetched rows / total rows = 1/1
    +------------------------------+---------------------------------+
    | SUBSTRING('helloworld', 5)   | SUBSTRING('helloworld', 5, 3)   |
    |------------------------------+---------------------------------|
    | oworld                       | owo                             |
    +------------------------------+---------------------------------+

### TRIM

**Description**

Argument Type: STRING

Return type: STRING

Example:

    os> source=people | eval \`TRIM('   hello')\` = TRIM('   hello'), \`TRIM('hello   ')\` = TRIM('hello   ') | fields \`TRIM('   hello')\`, \`TRIM('hello   ')\`
    fetched rows / total rows = 1/1
    +--------------------+--------------------+
    | TRIM('   hello')   | TRIM('hello   ')   |
    |--------------------+--------------------|
    | hello              | hello              |
    +--------------------+--------------------+

### UPPER

**Description**

Usage: upper(string) converts the string to uppercase.

Argument type: STRING

Return type: STRING

Example:

    os> source=people | eval \`UPPER('helloworld')\` = UPPER('helloworld'), \`UPPER('HELLOWORLD')\` = UPPER('HELLOWORLD') | fields \`UPPER('helloworld')\`, \`UPPER('HELLOWORLD')\`
    fetched rows / total rows = 1/1
    +-----------------------+-----------------------+
    | UPPER('helloworld')   | UPPER('HELLOWORLD')   |
    |-----------------------+-----------------------|
    | HELLOWORLD            | HELLOWORLD            |
    +-----------------------+-----------------------+
`;
