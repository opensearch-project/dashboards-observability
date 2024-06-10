# AWS RDS Integration Assets

API: http://opensearch-dashboards:5601/api/saved_objects/_import?overwrite=true

- [Assets](aws_rds-1.0.0.ndjson)

## Asset List

The next table details the assets

| Name                                        |     Type      |                                                Description                                                 |
| ------------------------------------------- | :-----------: | :--------------------------------------------------------------------------------------------------------: |
| `ss4o_logs_rds-*-*`                         | index-pattern |                                             The Index Pattern                                              |
| `AWS RDS Log Event Overview`                |   dashboard   |                                    The pre-canned dashboard for AWS RDS                                    |
| `[AWS RDS] Filters`                         | visualization |                      [Controls] Interactive controls for easy dashboard manipulation                       |
| `[AWS RDS] Slowquery`                       | visualization |  [Metric] Shows the latest slow queries that took more time than specified in the slow query parameters.   |
| `[AWS RDS] Slow Query History`              | visualization |         [Vertical Bar] Presents a timeline representation of slow queries over a specified period.         |
| `[AWS RDS] Average Slow Query Time History` | visualization |              [Pie] : Provides a historical trend of average execution times for slow queries.              |
| `[AWS RDS] Total Slow Queries`              | visualization |              [Metric] Depicts the total count of slow queries within a specified time frame.               |
| `[AWS RDS] Top Slow Query IP Table`         | visualization |                     [Line] Lists the IP addresses that initiated the most slow queries                     |
| `[AWS RDS] Slow Query Scatter Plot`         | visualization | [Line] A scatter plot illustrating slow queries against two different parameters such as time and duration |
| `[AWS RDS] Average Slow Query Duration`     | visualization |                   [Metric] Represents the average time taken by slow queries to execute                    |
| `[AWS RDS] Slow Query Pie`                  | visualization |                         [Pie] A pie chart showing the distribution of slow queries                         |
| `[AWS RDS] Slow Query Table Pie`            | visualization |                        [Table] A pie chart showing the distribution of slow queries                        |
| `[AWS RDS] Top Slow Query`                  | visualization |                             [Table] Top 10 source showing the slowest queries                              |
| `[AWS RDS] Lock`                            | visualization |              [Table] A visualization showing the number of active locks in your RDS instance               |
| `[AWS RDS] Total Deadlock Queries`          | visualization |            [Table] Represents the total count of deadlock scenarios encountered in the database            |
| `[AWS RDS] Deadlock History`                | visualization |                   [Table] Provides a timeline showing occurrences of deadlock scenarios                    |
| `[AWS RDS] Error Data`                      | visualization |              [Table] Represents data related to various errors occurred in your RDS instance               |
| `[AWS RDS] Audit Data`                      | visualization |             [Table] overview of audit logs, showing actions that have been tracked for review              |
| `[AWS RDS] Total Error Logs`                | visualization |            [Line] Displays the total count of error logs recorded within a specific time frame             |
| `[AWS RDS] Error History`                   | visualization |          [Line] Provides a timeline representation of the errors occurred over a certain period.           |
| `[AWS RDS] Audoit History`                  | visualization |      [Line] Provides a timeline representation of the audited events occurred over a certain period.       |
| `[AWS RDS] General Search`                  |    search     |                                     The pre-canned search for AWS RDS                                      |

## Dashboard

![](../static/dashboard.png)
