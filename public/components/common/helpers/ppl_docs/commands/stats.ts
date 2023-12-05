/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const statsCmd = `## stats
---

### Description

Use the \`stats\` command to calculate the aggregation from the search results.

The following table catalogs the aggregation functions and defines how the null and missing values are handled.

|          |             |             |
|----------|-------------|-------------|
| Function | NULL        | MISSING     |
| COUNT    | Not counted | Not counted |
| SUM      | Ignore      | Ignore      |
| AVG      | Ignore      | Ignore      |
| MAX      | Ignore      | Ignore      |
| MIN      | Ignore      | Ignore      |

### Syntax

stats &lt;aggregation&gt;... \[by-clause\]...

-   \`aggregation\`: Required. The aggregation function that must be applied to the field.
-   \`by-clause\`: Optional. One or more fields to group by. Default: If \`&lt;by-clause&gt;\` is not specified, the \`stats\` command returns one row, which is the aggregation for the entire result set.

### Aggregation Functions
---
#### COUNT

Returns a count of the number of rows in the result set. See the following example.

    os> source=accounts | stats count();
    fetched rows / total rows = 1/1
    +-----------+
    | count()   |
    |-----------|
    | 4         |
    +-----------+

#### SUM

SUM(expr): Returns the sum of the values in the expression \`expr\`. See the following example.

    os> source=accounts | stats sum(age) by gender;
    fetched rows / total rows = 2/2
    +------------+----------+
    | sum(age)   | gender   |
    |------------+----------|
    | 28         | F        |
    | 101        | M        |
    +------------+----------+

#### AVG

AVG(expr): Returns the average of the values in the expression \`expr\`. See the following example.

    os> source=accounts | stats avg(age) by gender;
    fetched rows / total rows = 2/2
    +--------------------+----------+
    | avg(age)           | gender   |
    |--------------------+----------|
    | 28.0               | F        |
    | 33.666666666666664 | M        |
    +--------------------+----------+

#### MAX

MAX(expr): Returns the largest value in the expression \`expr\`. See the following example.

    os> source=accounts | stats max(age);
    fetched rows / total rows = 1/1
    +------------+
    | max(age)   |
    |------------|
    | 36         |
    +------------+

#### MIN

MIN(expr): Returns the smallest value in the expression \`expr\`. See the following example.

    os> source=accounts | stats min(age);
    fetched rows / total rows = 1/1
    +------------+
    | min(age)   |
    |------------|
    | 28         |
    +------------+

#### VAR\_SAMP

VAR\_SAMP(expr): Returns the sample variance of a set of data in the expression \`expr\`. See the following example.

    os> source=accounts | stats var_samp(age);
    fetched rows / total rows = 1/1
    +--------------------+
    | var_samp(age)      |
    |--------------------|
    | 10.916666666666666 |
    +--------------------+

#### VAR\_POP

VAR\_POP(expr): Returns the population variance of a set of data in the expression \`expr\`. See the following example.

    os> source=accounts | stats var_pop(age);
    fetched rows / total rows = 1/1
    +----------------+
    | var_pop(age)   |
    |----------------|
    | 8.1875         |
    +----------------+

#### STDDEV\_SAMP

STDDEV\_SAMP(expr): Returns the sample standard deviation of a set of values in the expression \`expr\`. See the follwoing example. 

    os> source=accounts | stats stddev_samp(age);
    fetched rows / total rows = 1/1
    +--------------------+
    | stddev_samp(age)   |
    |--------------------|
    | 3.304037933599835  |
    +--------------------+

#### STDDEV\_POP

STDDEV\_POP(expr): Returns the population standard deviation of a set of values in the expression \`expr\`.

    os> source=accounts | stats stddev_pop(age);
    fetched rows / total rows = 1/1
    +--------------------+
    | stddev_pop(age)    |
    |--------------------|
    | 2.8613807855648994 |
    +--------------------+

### By clause

The \`by\` clause can contain fields, expressions, scalar functions, or aggregation functions. The \`span\` clause can be used in the \`by\` clause to split specific fields into buckets of the same interval. The \`stats\` command then performs the aggregation on these buckets.

The span syntax is \`span(field_expr, interval_expr)\`. By default, the interval expression in the \`span\` clause if interpreted in natural untis. If the field is a date and time type field and the interval is in date and time units, you must specify the unit in the interval expression. For example, tp split the \`age\` field into buckets of 10 years, you would use \`span(age, 10y). To split a timestamp field into hourly intervals, you would use \`span(timestamp, 1h)\`.

The following table lists the available time units.

| Span Interval Units        |
|----------------------------|
| millisecond (ms)           |
| second (s)                 |
| minute (m, case sensitive) |
| hour (h)                   |
| day (d)                    |
| week (w)                   |
| month (M, case sensitive)  |
| quarter (q)                |
| year (y)                   |

### PPL query examples

The following examples show how to use the \`stats\` command in various PPL queries.

#### Example 1: Calculate event counts

The following PPL query example calculates event counts.

    os> source=accounts | stats count();
    fetched rows / total rows = 1/1
    +-----------+
    | count()   |
    |-----------|
    | 4         |
    +-----------+

#### Example 2: Calculate a field's average

The following PPL query example calculates the average age.

    os> source=accounts | stats avg(age);
    fetched rows / total rows = 1/1
    +------------+
    | avg(age)   |
    |------------|
    | 32.25      |
    +------------+

#### Example 3: Calculate the average of a field by group

The following PPL query example calculates the average age grouped by gender.

    os> source=accounts | stats avg(age) by gender;
    fetched rows / total rows = 2/2
    +--------------------+----------+
    | avg(age)           | gender   |
    |--------------------+----------|
    | 28.0               | F        |
    | 33.666666666666664 | M        |
    +--------------------+----------+

#### Example 4: Calculate the average, sum, and count of a field by group

The following PPL query example calculates the average age, sum age and count of events by gender.

    os> source=accounts | stats avg(age), sum(age), count() grouped by gender;
    fetched rows / total rows = 2/2
    +--------------------+------------+-----------+----------+
    | avg(age)           | sum(age)   | count()   | gender   |
    |--------------------+------------+-----------+----------|
    | 28.0               | 28         | 1         | F        |
    | 33.666666666666664 | 101        | 3         | M        |
    +--------------------+------------+-----------+----------+

#### Example 5: Calculate a field's maximum

The following PPL query example calculates the maximum age.

    os> source=accounts | stats max(age);
    fetched rows / total rows = 1/1
    +------------+
    | max(age)   |
    |------------|
    | 36         |
    +------------+

#### Example 6: Calculate a field's min/max by group

The following PPL query example calculates the min/max age grouped by gender.

    os> source=accounts | stats max(age), min(age) by gender;
    fetched rows / total rows = 2/2
    +------------+------------+----------+
    | max(age)   | min(age)   | gender   |
    |------------+------------+----------|
    | 28         | 28         | F        |
    | 36         | 32         | M        |
    +------------+------------+----------+

#### Example 7: Calculate a field's distinct count

To count the number of distinct values in a field, you can use the \`DISTINCT_COUNT\` or \`DC\` function instead of the \`COUNT\` funtion.

The following PPL query calculates both the count and distinct count of the \`gender\` field for all accounts.

    os> source=accounts | stats count(gender), distinct_count(gender);
    fetched rows / total rows = 1/1
    +-----------------+--------------------------+
    | count(gender)   | distinct_count(gender)   |
    |-----------------+--------------------------|
    | 4               | 2                        |
    +-----------------+--------------------------+

#### Example 8: Calculate count by span

The following PPL query calculates age by span of 10 years.

    os> source=accounts | stats count(age) by span(age, 10) as age_span
    fetched rows / total rows = 2/2
    +--------------+------------+
    | count(age)   | age_span   |
    |--------------+------------|
    | 1            | 20         |
    | 3            | 30         |
    +--------------+------------+

#### Example 9: Calculate count by gender and span

The following PPL query calculates age by span of 10 years and groups by gender.

    os> source=accounts | stats count() as cnt by span(age, 5) as age_span, gender
    fetched rows / total rows = 3/3
    +-------+------------+----------+
    | cnt   | age_span   | gender   |
    |-------+------------+----------|
    | 1     | 25         | F        |
    | 2     | 30         | M        |
    | 1     | 35         | M        |
    +-------+------------+----------+
`;