/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const mathFunction = `## Math
---

### ABS

\`abs\` is an absolute value function. 

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type: INTEGER/LONG/FLOAT/DOUBLE

**Example**

    os> source=people | eval \`ABS(-1)\` = ABS(-1) | fields \`ABS(-1)\`
    fetched rows / total rows = 1/1
    +-----------+
    | ABS(-1)   |
    |-----------|
    | 1         |
    +-----------+

### ACOS

\`acos(x)\` is an arc cosine function. The function expects the values in the range of \`-1\` to \`1\`, and returns \`NULL\` if the values aren't in that range.

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type: DOUBLE

**Example**

    os> source=people | eval \`ACOS(0)\` = ACOS(0) | fields \`ACOS(0)\`
    fetched rows / total rows = 1/1
    +--------------------+
    | ACOS(0)            |
    |--------------------|
    | 1.5707963267948966 |
    +--------------------+

### ASIN

\`asin(x)\` is an arc sine function. The function expects the values in the range of \`-1\` to \`1\`, and returns \`NULL\` if the values aren't in that range.

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type: DOUBLE

**Example**

    os> source=people | eval \`ASIN(0)\` = ASIN(0) | fields \`ASIN(0)\`
    fetched rows / total rows = 1/1
    +-----------+
    | ASIN(0)   |
    |-----------|
    | 0.0       |
    +-----------+

### ATAN

\`atan(x)\` is an arc tangent function that returns arc tangent of a value \`x\`.

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type: DOUBLE

**Example**

    os> source=people | eval \`ATAN(2)\` = ATAN(2), \`ATAN(2, 3)\` = ATAN(2, 3) | fields \`ATAN(2)\`, \`ATAN(2, 3)\`
    fetched rows / total rows = 1/1
    +--------------------+--------------------+
    | ATAN(2)            | ATAN(2, 3)         |
    |--------------------+--------------------|
    | 1.1071487177940904 | 0.5880026035475675 |
    +--------------------+--------------------+

### ATAN2

\`atan2(y, x)\` is an arc tangent function that calculates the angle from a specified point to the coordinate oriign as measured from the positive x-axis.

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type: DOUBLE

**Example**

    os> source=people | eval \`ATAN2(2, 3)\` = ATAN2(2, 3) | fields \`ATAN2(2, 3)\`
    fetched rows / total rows = 1/1
    +--------------------+
    | ATAN2(2, 3)        |
    |--------------------|
    | 0.5880026035475675 |
    +--------------------+

### CEIL

\`ceil(x)\` is a function that returns the smallest integer value that is greater than or equal to the specified value.

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type: INTEGER

**Example**

    os> source=people | eval \`CEIL(2.75)\` = CEIL(2.75) | fields \`CEIL(2.75)\`
    fetched rows / total rows = 1/1
    +--------------+
    | CEIL(2.75)   |
    |--------------|
    | 3            |
    +--------------+

### CONV

\`CONV(x, a, b)\` is a function that converts the number \`x\` from \`a\` base to \`b\` base.

Argument type: x: STRING, a: INTEGER, b: INTEGER

Return type: STRING

**Example**

    os> source=people | eval \`CONV('12', 10, 16)\` = CONV('12', 10, 16), \`CONV('2C', 16, 10)\` = CONV('2C', 16, 10), \`CONV(12, 10, 2)\` = CONV(12, 10, 2), \`CONV(1111, 2, 10)\` = CONV(1111, 2, 10) | fields \`CONV('12', 10, 16)\`, \`CONV('2C', 16, 10)\`, \`CONV(12, 10, 2)\`, \`CONV(1111, 2, 10)\`
    fetched rows / total rows = 1/1
    +----------------------+----------------------+-------------------+---------------------+
    | CONV('12', 10, 16)   | CONV('2C', 16, 10)   | CONV(12, 10, 2)   | CONV(1111, 2, 10)   |
    |----------------------+----------------------+-------------------+---------------------|
    | c                    | 44                   | 1100              | 15                  |
    +----------------------+----------------------+-------------------+---------------------+

### COS

\`cos(x)\` is a cosine function, with \`x\` in radians.

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type: DOUBLE

**Example**

    os> source=people | eval \`COS(0)\` = COS(0) | fields \`COS(0)\`
    fetched rows / total rows = 1/1
    +----------+
    | COS(0)   |
    |----------|
    | 1.0      |
    +----------+

### COT

\`cot(x)\` is a cotangent function. An out-of-range error is returned if \`x\` equals \`0\`.

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type: DOUBLE

**Example**

    os> source=people | eval \`COT(1)\` = COT(1) | fields \`COT(1)\`
    fetched rows / total rows = 1/1
    +--------------------+
    | COT(1)             |
    |--------------------|
    | 0.6420926159343306 |
    +--------------------+

### CRC32

\`crc32\` is a function that calculates the cyclic redundancy check (CRC) value of a given string as a 32-bit unsigned value. 

Argument type: STRING

Return type: LONG

**Example**

    os> source=people | eval \`CRC32('MySQL')\` = CRC32('MySQL') | fields \`CRC32('MySQL')\`
    fetched rows / total rows = 1/1
    +------------------+
    | CRC32('MySQL')   |
    |------------------|
    | 3259397556       |
    +------------------+

### DEGREES

\`degrees(x)\` is a function that converts \`x\` from radians to degrees.

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type: DOUBLE

**Example**

    os> source=people | eval \`DEGREES(1.57)\` = DEGREES(1.57) | fields \`DEGREES(1.57)\`
    fetched rows / total rows  = 1/1
    +-------------------+
    | DEGREES(1.57)     |
    |-------------------|
    | 89.95437383553924 |
    +-------------------+

### E

\`E()\` is a function that returns Euler's number.

Return type: DOUBLE

**Example**

    os> source=people | eval \`E()\` = E() | fields \`E()\`
    fetched rows / total rows = 1/1
    +-------------------+
    | E()               |
    |-------------------|
    | 2.718281828459045 |
    +-------------------+

### EXP

\`exp(x)\` is a function that returns \`e\` raised to the power of \`x\`.

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type: INTEGER

**Example**

    os> source=people | eval \`EXP(2)\` = EXP(2) | fields \`EXP(2)\`
    fetched rows / total rows = 1/1
    +------------------+
    | EXP(2)           |
    |------------------|
    | 7.38905609893065 |
    +------------------+

### FLOOR

\`floor(x)\` is a function that returns the largest integer less than or equal to the specified value.

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type: INTEGER

**Example**

    os> source=people | eval \`FLOOR(2.75)\` = FLOOR(2.75) | fields \`FLOOR(2.75)\`
    fetched rows / total rows = 1/1
    +---------------+
    | FLOOR(2.75)   |
    |---------------|
    | 2             |
    +---------------+

### LN

\`ln(x)\` is a function that returns the natural logarithm of \`x\`.

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type: DOUBLE

**Example**

    os> source=people | eval \`LN(2)\` = LN(2) | fields \`LN(2)\`
    fetched rows / total rows = 1/1
    +--------------------+
    | LN(2)              |
    |--------------------|
    | 0.6931471805599453 |
    +--------------------+

### LOG

\`log(x)\` is a function that returns the natural logarithm of \`x\`.

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type: DOUBLE

**Example**

    os> source=people | eval \`LOG(2)\` = LOG(2), \`LOG(2, 8)\` = LOG(2, 8) | fields \`LOG(2)\`, \`LOG(2, 8)\`
    fetched rows / total rows = 1/1
    +--------------------+-------------+
    | LOG(2)             | LOG(2, 8)   |
    |--------------------+-------------|
    | 0.6931471805599453 | 3.0         |
    +--------------------+-------------+

### LOG2

\`log2(x)\` is a function that calculates the base-2 logarithm of \`x\`.

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type: DOUBLE

**Example**

    os> source=people | eval \`LOG2(8)\` = LOG2(8) | fields \`LOG2(8)\`
    fetched rows / total rows = 1/1
    +-----------+
    | LOG2(8)   |
    |-----------|
    | 3.0       |
    +-----------+

### LOG10

\`log10(x)\` is a function that calculates the base-10 logarithm of \`x\`.

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type: DOUBLE

**Example**

    os> source=people | eval \`LOG10(100)\` = LOG10(100) | fields \`LOG10(100)\`
    fetched rows / total rows = 1/1
    +--------------+
    | LOG10(100)   |
    |--------------|
    | 2.0          |
    +--------------+

### MOD

\`MOD(n, m)\` is a function that calculates the remainder of the number \`n\` divided by \`m\`.

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type: Wider type between types \`n\` and \`m\` if \`m\` is a nonzero value. \`NULL\` is returned if \`m\` equals \`0\`.

**Example**

    os> source=people | eval \`MOD(3, 2)\` = MOD(3, 2), \`MOD(3.1, 2)\` = MOD(3.1, 2) | fields \`MOD(3, 2)\`, \`MOD(3.1, 2)\`
    fetched rows / total rows = 1/1
    +-------------+---------------+
    | MOD(3, 2)   | MOD(3.1, 2)   |
    |-------------+---------------|
    | 1           | 1.1           |
    +-------------+---------------+

### PI

\`PI()\` is a function that returns the constant pi.

Return type: DOUBLE

**Example**

    os> source=people | eval \`PI()\` = PI() | fields \`PI()\`
    fetched rows / total rows = 1/1
    +-------------------+
    | PI()              |
    |-------------------|
    | 3.141592653589793 |
    +-------------------+

### POW

\`POW(x, y)\` is a function that calculates the value of \`x\` raised to the power of \`y\`. Bad inputs return \`NULL\` results.

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type: DOUBLE

Synonyms: [POWER](#power)

**Example**

    os> source=people | eval \`POW(3, 2)\` = POW(3, 2), \`POW(-3, 2)\` = POW(-3, 2), \`POW(3, -2)\` = POW(3, -2) | fields \`POW(3, 2)\`, \`POW(-3, 2)\`, \`POW(3, -2)\`
    fetched rows / total rows = 1/1
    +-------------+--------------+--------------------+
    | POW(3, 2)   | POW(-3, 2)   | POW(3, -2)         |
    |-------------+--------------+--------------------|
    | 9.0         | 9.0          | 0.1111111111111111 |
    +-------------+--------------+--------------------+

### POWER

\`POWER(x, y)\` is a function that calculates the value of \`x\` raised to the power of \`y\`. Bad inputs return \`NULL\` results.

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type: DOUBLE

Synonyms: [POW](#pow)

**Example**

    os> source=people | eval \`POWER(3, 2)\` = POWER(3, 2), \`POWER(-3, 2)\` = POWER(-3, 2), \`POWER(3, -2)\` = POWER(3, -2) | fields \`POWER(3, 2)\`, \`POWER(-3, 2)\`, \`POWER(3, -2)\`
    fetched rows / total rows = 1/1
    +---------------+----------------+--------------------+
    | POWER(3, 2)   | POWER(-3, 2)   | POWER(3, -2)       |
    |---------------+----------------+--------------------|
    | 9.0           | 9.0            | 0.1111111111111111 |
    +---------------+----------------+--------------------+

### RADIANS

\`radians(x)\` is a function that converts \`x\` from degrees to radians.

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type: DOUBLE

**Example**

    os> source=people | eval \`RADIANS(90)\` = RADIANS(90) | fields \`RADIANS(90)\`
    fetched rows / total rows  = 1/1
    +--------------------+
    | RADIANS(90)        |
    |--------------------|
    | 1.5707963267948966 |
    +--------------------+

### RAND

\`RAND()/RAND(N)\` is a function that returns a random floating-point value in the range \`0 &lt;= value &lt; 1.0\`. If integer \`N\` is specified, the seed is
initialized prior to execution. One implication of this behavior is with
identical argument \`N\`, \`rand(N)\` returns the same value each time and thus
produces a repeatable sequence of column values.

Argument type: INTEGER

Return type: FLOAT

**Example**

    os> source=people | eval \`RAND(3)\` = RAND(3) | fields \`RAND(3)\`
    fetched rows / total rows = 1/1
    +------------+
    | RAND(3)    |
    |------------|
    | 0.73105735 |
    +------------+

### ROUND

\`ROUND(x, d)\` is a function that rounds the argument \`x\` to \`d\` decimal places. \`d\` defaults to \`0\` if value is not specified.

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type map:

(INTEGER/LONG \[,INTEGER\]) -&gt; LONG (FLOAT/DOUBLE \[,INTEGER\]) -&gt;
LONG

**Example**

    os> source=people | eval \`ROUND(12.34)\` = ROUND(12.34), \`ROUND(12.34, 1)\` = ROUND(12.34, 1), \`ROUND(12.34, -1)\` = ROUND(12.34, -1), \`ROUND(12, 1)\` = ROUND(12, 1) | fields \`ROUND(12.34)\`, \`ROUND(12.34, 1)\`, \`ROUND(12.34, -1)\`, \`ROUND(12, 1)\`
    fetched rows / total rows = 1/1
    +----------------+-------------------+--------------------+----------------+
    | ROUND(12.34)   | ROUND(12.34, 1)   | ROUND(12.34, -1)   | ROUND(12, 1)   |
    |----------------+-------------------+--------------------+----------------|
    | 12.0           | 12.3              | 10.0               | 12             |
    +----------------+-------------------+--------------------+----------------+

### SIGN

\`sign\` is a  function that returns the sign of the argument as -1, 0, or 1, depending on whether the number is negative, zero, or positive.

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type: INTEGER

**Example**

    os> source=people | eval \`SIGN(1)\` = SIGN(1), \`SIGN(0)\` = SIGN(0), \`SIGN(-1.1)\` = SIGN(-1.1) | fields \`SIGN(1)\`, \`SIGN(0)\`, \`SIGN(-1.1)\`
    fetched rows / total rows = 1/1
    +-----------+-----------+--------------+
    | SIGN(1)   | SIGN(0)   | SIGN(-1.1)   |
    |-----------+-----------+--------------|
    | 1         | 0         | -1           |
    +-----------+-----------+--------------+

### SIN

\`sin(x)\` is a sine function, with \`x\` in radians.

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type: DOUBLE

**Example**

    os> source=people | eval \`SIN(0)\` = SIN(0) | fields \`SIN(0)\`
    fetched rows / total rows = 1/1
    +----------+
    | SIN(0)   |
    |----------|
    | 0.0      |
    +----------+

### SQRT

\`sqrt\` is a function that salculates the square root of a non-negative value \`x\`.

Argument type: INTEGER/LONG/FLOAT/DOUBLE

Return type map:

(Non-negative) INTEGER/LONG/FLOAT/DOUBLE -&gt; DOUBLE (Negative)
INTEGER/LONG/FLOAT/DOUBLE -&gt; NULL

**Example**

    os> source=people | eval \`SQRT(4)\` = SQRT(4), \`SQRT(4.41)\` = SQRT(4.41) | fields \`SQRT(4)\`, \`SQRT(4.41)\`
    fetched rows / total rows = 1/1
    +-----------+--------------+
    | SQRT(4)   | SQRT(4.41)   |
    |-----------+--------------|
    | 2.0       | 2.1          |
    +-----------+--------------+
`;
