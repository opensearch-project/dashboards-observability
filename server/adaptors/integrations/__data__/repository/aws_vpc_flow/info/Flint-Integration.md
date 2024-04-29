# VPC Flow Integration

Amazon Virtual Private Cloud flow logs capture information about the IP traffic going to and from network interfaces in a VPC. Use the logs to investigate network traffic patterns and identify threats and risks across your VPC network.

OpenSearch integrations offers a schematic support for AWS VPC flow based on the OpenTelemetry specifications.

*`The following steps describe the entire procedure for publishing, ingestion, transformation and projection of the data into a meaningful and insightful manner.`*

## Ingestion

#### Publish flow logs to Amazon S3

Flow logs can publish flow log data to Amazon S3.
When publishing to Amazon S3, flow log data is published to an existing Amazon S3 bucket that you specify. Flow log records for all of the monitored network interfaces are published to a series of log file objects that are stored in the bucket. If the flow log captures data for a VPC, the flow log publishes flow log records for all of the network interfaces in the selected VPC.

#### Files Format

VPC Flow Logs collects flow log records, consolidates them into log files, and then publishes the log files to the Amazon S3 bucket at 5-minute intervals. Each log file contains flow log records for the IP traffic recorded in the previous five minutes.
The maximum file size for a log file is 75 MB. If the log file reaches the file size limit within the 5-minute period, the flow log stops adding flow log records to it. Then it publishes the flow log to the Amazon S3 bucket, and creates a new log file.
In Amazon S3, the **Last modified** field for the flow log file indicates the date and time at which the file was uploaded to the Amazon S3 bucket. This is later than the timestamp in the file name, and differs by the amount of time taken to upload the file to the Amazon S3 bucket.

**Log file format**

* **Text** – Plain text. This is the default format.
* **Parquet** – Apache Parquet is a columnar data format. Queries on data in Parquet format are 10 to 100 times faster compared to queries on data in plain text. Data in Parquet format with Gzip compression takes 20 percent less storage space than plain text with Gzip compression.


**Log file options:**

**Hive-compatible S3 prefixes** – Enable Hive-compatible prefixes instead of importing partitions into your Hive-compatible tools. Before you run queries, use the **MSCK REPAIR TABLE** command.

**Hourly partitions** – If you have a large volume of logs and typically target queries to a specific hour, you can get faster results and save on query costs by partitioning logs on an hourly basis.

By default, the files are delivered to the following location.

```
bucket-and-optional-prefix/AWSLogs/account_id/vpcflowlogs/region/year/month/day/
```

If you enable Hive-compatible S3 prefixes, the files are delivered to the following location.

```
bucket-and-optional-prefix/AWSLogs/aws-account-id=account_id/aws-service=vpcflowlogs/aws-region=region/year=year/month=month/day=day/
```

If you enable hourly partitions, the files are delivered to the following location.

```
bucket-and-optional-prefix/AWSLogs/account_id/vpcflowlogs/region/year/month/day/hour/
```

If you enable Hive-compatible partitions and partition the flow log per hour, the files are delivered to the following location.

```
bucket-and-optional-prefix/AWSLogs/aws-account-id=account_id/aws-service=vpcflowlogs/aws-region=region/year=year/month=month/day=day/hour=hour/
```

**Log file names**
The file name of a log file is based on the flow log ID, Region, and creation date and time. File names use the following format.

```
aws_account_id_vpcflowlogs_region_flow_log_id_YYYYMMDDTHHmmZ_hash.log.gz
```

* * *

## Table Definition

#### Create Table VPC flow logs

The following statement creates an Amazon VPC table definition for Amazon VPC flow logs.
When you create a flow log with a custom format, you create a table with fields that match the fields that you specified when you created the flow log in the same order that you specified them.

Enter a DDL statement like the following into the OpenSearch workbench query editor:

The next statement creates a table that has the columns for Amazon VPC flow logs versions 2 through 5 as documented in [Flow log records](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html#flow-log-records). If you use a different set of columns or order of columns, modify the statement accordingly.

```
CREATE EXTERNAL TABLE IF NOT EXISTS `vpc_flow_logs` (
  version int,
  account_id string,
  interface_id string,
  srcaddr string,
  dstaddr string,
  srcport int,
  dstport int,
  protocol bigint,
  packets bigint,
  bytes bigint,
  start bigint,
  `end` bigint,
  action string,
  log_status string,
  vpc_id string,
  subnet_id string,
  instance_id string,
  tcp_flags int,
  type string,
  pkt_srcaddr string,
  pkt_dstaddr string,
  region string,
  az_id string,
  sublocation_type string,
  sublocation_id string,
  pkt_src_aws_service string,
  pkt_dst_aws_service string,
  flow_direction string,
  traffic_path int
)
PARTITIONED BY (`date` date)
ROW FORMAT DELIMITED
FIELDS TERMINATED BY ' '
LOCATION 's3://DOC-EXAMPLE-BUCKET/prefix/AWSLogs/{account_id}/vpcflowlogs/{region_code}/'
TBLPROPERTIES ("skip.header.line.count"="1");
```



* The `PARTITIONED BY` clause uses the `date` type. This makes it possible to use mathematical operators in queries to select what's older or newer than a certain date.
* For a VPC flow log with a different custom format, modify the fields to match the fields that you specified when you created the flow log.
* Modify the `LOCATION 's3://DOC-EXAMPLE-BUCKET/prefix/AWSLogs/`*`{`*`account_id}/vpcflowlogs/`*`{`*`region_code}/'` to point to the Amazon S3 bucket that contains your log data.
* Run the DDL statement in OpenSearch Query Workbench console under the specific `datasource`. After the query completes, GLUE registers the `vpc_flow_logs` table, making the data in it ready for you to issue queries.


### Creating tables for flow logs in Apache Parquet format

The following procedure creates an Amazon VPC table for Amazon VPC flow logs in Apache Parquet format.

1. Enter the next DDL statement into the OpenSearch workbench query editor, following the guidelines in the [Common considerations](https://docs.aws.amazon.com/athena/latest/ug/vpc-flow-logs.html#vpc-flow-logs-common-considerations) section. This will creates a table that has the columns for Amazon VPC flow logs versions 2 through 5 as documented in [Flow log records](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html#flow-log-records) in Parquet format, Hive partitioned hourly.
2. If you do not have hourly partitions, remove `hour` from the `PARTITIONED BY` clause.

```
CREATE EXTERNAL TABLE IF NOT EXISTS vpc_flow_logs_parquet (
  version int,
  account_id string,
  interface_id string,
  srcaddr string,
  dstaddr string,
  srcport int,
  dstport int,
  protocol bigint,
  packets bigint,
  bytes bigint,
  start bigint,
  `end` bigint,
  action string,
  log_status string,
  vpc_id string,
  subnet_id string,
  instance_id string,
  tcp_flags int,
  type string,
  pkt_srcaddr string,
  pkt_dstaddr string,
  region string,
  az_id string,
  sublocation_type string,
  sublocation_id string,
  pkt_src_aws_service string,
  pkt_dst_aws_service string,
  flow_direction string,
  traffic_path int
)
USING json
LOCATION 's3://DOC-EXAMPLE-BUCKET/prefix/AWSLogs/'
```

* Modify the sample `LOCATION 's3://`DOC-EXAMPLE-BUCKET`/`prefix`/AWSLogs/'` to point to the Amazon S3 path that contains your log data.
* Run the DDL statement in OpenSearch Query Workbench under the specific `datasource`. After the query completes, GLUE registers the `vpc_flow_logs` table, making the data in it ready for you to issue queries.


*If your data is in Hive-compatible format, run the following command in the OpenSearch Query Workbench to update and load the Hive partitions in the metastore (GLUE Catalot).*

*After the query completes, you can query the data in the `vpc_flow_logs_parquet` table.*

```
MSCK REPAIR TABLE vpc_flow_logs_parquet
```

* * *

## Projection Views Creation

The following statements creates a set of views (Materialized View, Covering Index, Skipping Index) that help the acceleration of queries using the flint based capability.
The outcome of creating these acceleration tables is the synchronization of data being stored within opensearch index.

This data can be one of the following
- use as internal cache for fast VPC based sql query performance
- use for visualization of information as part of VPC dashboards

***Attention***
An important note is that data cant be copied as-is from S3 into opensearch due to volume and cost considerations.
The user must design in advance the time frame by-which the MV would be used and to align the entire working strategy to support that notion.

This is done using the next `WHERE` statement that zooms the designated time scope

```
WHERE 
    ((`year` = 'StartYear' AND `month` >= 'StartMonth' AND `day` >= 'StartDay') OR
     (`year` = 'EndYear' AND `month` <= 'EndMonth' AND `day` <= 'EndDay'))
```

* * *

### VPC Queries

The following queries are used for data projection :


#### 1) VPC Raw Data

The first query shows the basic parsing from vpc raw format into OTEL specifications based on the simple schema for observability as shown [here](https://github.com/opensearch-project/opensearch-catalog/blob/main/schema/observability/logs/aws/aws_vpc_flow-1.0.0.mapping)
Its based on a limited time window (one week) and bring the most up-to-date logs

```
-- limited live view based on a week's worth of data
CREATE MATERIALIZED VIEW IF NOT EXISTS vpcflow_live_limited_week_view_mv AS
SELECT
  cloud.account_uid AS `aws.vpc.cloud_account_uid`,
  cloud.region AS `aws.vpc.cloud_region`,
  cloud.zone AS `aws.vpc.cloud_zone`,
  cloud.provider AS `aws.vpc.cloud_provider`,

  CAST(IFNULL(src_endpoint.port, 0) AS LONG) AS `aws.vpc.srcport`,
  CAST(IFNULL(src_endpoint.svc_name, 'Unknown') AS STRING)  AS `aws.vpc.pkt-src-aws-service`,
  CAST(IFNULL(src_endpoint.ip, '0.0.0.0') AS STRING)  AS `aws.vpc.srcaddr`,
  CAST(IFNULL(src_endpoint.interface_uid, 'Unknown') AS STRING)  AS `aws.vpc.src-interface_uid`,
  CAST(IFNULL(src_endpoint.vpc_uid, 'Unknown') AS STRING)  AS `aws.vpc.src-vpc_uid`,
  CAST(IFNULL(src_endpoint.instance_uid, 'Unknown') AS STRING)  AS `aws.vpc.src-instance_uid`,
  CAST(IFNULL(src_endpoint.subnet_uid, 'Unknown') AS STRING)  AS `aws.vpc.src-subnet_uid`,

  CAST(IFNULL(dst_endpoint.port, 0) AS LONG) AS `aws.vpc.dstport`,
  CAST(IFNULL(dst_endpoint.svc_name, 'Unknown') AS STRING) AS `aws.vpc.pkt-dst-aws-service`,
  CAST(IFNULL(dst_endpoint.ip, '0.0.0.0') AS STRING)  AS `aws.vpc.dstaddr`,
  CAST(IFNULL(dst_endpoint.interface_uid, 'Unknown') AS STRING)  AS `aws.vpc.dst-interface_uid`,
  CAST(IFNULL(dst_endpoint.vpc_uid, 'Unknown') AS STRING)  AS `aws.vpc.dst-vpc_uid`,
  CAST(IFNULL(dst_endpoint.instance_uid, 'Unknown') AS STRING)  AS `aws.vpc.dst-instance_uid`,
  CAST(IFNULL(dst_endpoint.subnet_uid, 'Unknown') AS STRING)  AS `aws.vpc.dst-subnet_uid`,
  CASE
      WHEN regexp(dst_endpoint.ip, '(10\\..*)|(192\\.168\\..*)|(172\\.1[6-9]\\..*)|(172\\.2[0-9]\\..*)|(172\\.3[0-1]\\.*)')
      THEN 'ingress'
      ELSE 'egress'
  END AS `aws.vpc.flow-direction`,

  CAST(IFNULL(connection_info['protocol_num'], 0) AS INT) AS `aws.vpc.connection.protocol_num`,
  CAST(IFNULL(connection_info['tcp_flags'], '0') AS STRING)  AS `aws.vpc.connection.tcp_flags`,
  CAST(IFNULL(connection_info['protocol_ver'], '0') AS STRING)  AS `aws.vpc.connection.protocol_ver`,
  CAST(IFNULL(connection_info['boundary'], 'Unknown') AS STRING)  AS `aws.vpc.connection.boundary`,
  CAST(IFNULL(connection_info['direction'], 'Unknown') AS STRING)  AS `aws.vpc.connection.direction`,

  CAST(IFNULL(traffic.packets, 0) AS LONG) AS `aws.vpc.packets`,
  CAST(IFNULL(traffic.bytes, 0) AS LONG) AS `aws.vpc.bytes`,

  CAST(FROM_UNIXTIME(time / 1000) AS TIMESTAMP) AS `@timestamp`,
  CAST(FROM_UNIXTIME(start_time / 1000) AS TIMESTAMP) AS `start_time`,
  CAST(FROM_UNIXTIME(end_time / 1000) AS TIMESTAMP) AS `end_time`,
  status_code AS `aws.vpc.status_code`,

  severity AS `aws.vpc.severity`,
  class_name AS `aws.vpc.class_name`,
  category_name AS `aws.vpc.category_name`, 
  activity_name AS `aws.vpc.activity_name`,
  disposition AS `aws.vpc.disposition`,
  type_name AS `aws.vpc.type_name`,

  region AS `aws.vpc.region`,
  accountid AS `aws.vpc.account-id`
FROM
  {table_name},
  (SELECT MAX(CAST(FROM_UNIXTIME(start_time / 1000) AS TIMESTAMP)) AS max_start_time FROM {table_name}) AS latest
WHERE
  CAST(FROM_UNIXTIME(start_time / 1000) AS TIMESTAMP) >= DATE_SUB(latest.max_start_time, 7)
WITH (
  auto_refresh = false
)
-- refresh MV
REFRESH MATERIALIZED VIEW vpcflow_live_limited_week_view_mv
```

The outcome of this query is an index that has raw data which is parsed according to the OTEL schema mapping.
Once this index exists, it can be used to present dashboards which reflect the above fields in one of the following ways:
- present the fields directly in a table / filter / cloud map and such
- present the aggregation on top of fields shown here (numeric or terms aggregation)

_***Attention** *_
Since this query is fetching raw data it may grow very quickly therefor it is important to pay attention for the size of this index and allow life cycles management for the index to be considered.

* * *

#### 2) `VPC Requests Aggregation Data`

The next queries shows the hourly / 30 minutes requests summary with additional list of several dimensions that can be used to filter by (or event group by for additional composition aggregations).

```
-- One Hour Aggregation MV of VPC connections / bytes / packets
CREATE MATERIALIZED VIEW IF NOT EXISTS vpcflow_mview_60_min_connections AS
SELECT
date_trunc('hour', from_unixtime(start_time / 1000)) AS start_time,
date_trunc('hour', from_unixtime(start_time / 1000)) + INTERVAL 1 HOUR AS end_time,

        status_code as `aws.vpc.status_code`,
        -- action as `aws.vpc.action`, (add to groupBy)

        connection_info.direction AS `aws.vpc.connection.direction`,
        src_endpoint.svc_name as `aws.vpc.pkt-src-aws-service`,
        dst_endpoint.svc_name as `aws.vpc.pkt-dst-aws-service`,
                
        accountid as `aws.vpc.account-id`,    
        vpc_id as `aws.vpc.dst-vpc_uid`,
        region as `aws.vpc.region`,
         
        COUNT(*) AS total_connections,
        SUM(CAST(IFNULL(traffic.bytes, 0) AS LONG)) AS total_bytes,
        SUM(CAST(IFNULL(traffic.packets, 0) AS LONG)) AS total_packets
    FROM
        {table_name}
    WHERE 
        ((`year` = 'StartYear' AND `month` >= 'StartMonth' AND `day` >= 'StartDay') OR
         (`year` = 'EndYear' AND `month` <= 'EndMonth' AND `day` <= 'EndDay'))
    GROUP BY
        date_trunc('hour', from_unixtime(start_time / 1000)), region, accountid,vpc_id, status_code,src_endpoint.svc_name, dst_endpoint.svc_name, connection_info.direction
    ORDER BY
        start_time
WITH (
  auto_refresh = false
)
-- refresh MV
REFRESH MATERIALIZED VIEW vpcflow_mview_60_min_connections
```

* * *

```
-- 30 minutes Aggregation of VPC connections / bytes / packets
CREATE MATERIALIZED VIEW IF NOT EXISTS vpcflow_mview_30_min_connections AS
SELECT
  CAST(from_unixtime(CAST((start_time / 1000) AS BIGINT) DIV 1800 * 1800) AS TIMESTAMP) AS start_time,
  CAST(from_unixtime((CAST((start_time / 1000) AS BIGINT) DIV 1800 * 1800) + 1800) AS TIMESTAMP) AS end_time,
  
      status_code as `aws.vpc.status_code`,
      -- action as `aws.vpc.action`, (add to groupBy)
  
      connection_info.direction AS `aws.vpc.connection.direction`, 
      src_endpoint.svc_name as `aws.vpc.pkt-src-aws-service`,
      dst_endpoint.svc_name as `aws.vpc.pkt-dst-aws-service`,
              
      accountid as `aws.vpc.account-id`,    
      vpc_id as `aws.vpc.dst-vpc_uid`,
      region as `aws.vpc.region`,
          
       COUNT(*) AS total_connections,
       SUM(CAST(IFNULL(traffic.bytes, 0) AS LONG)) AS total_bytes,
       SUM(CAST(IFNULL(traffic.packets, 0) AS LONG)) AS total_packets
  FROM
    {table_name}
  WHERE 
      ((`year` = 'StartYear' AND `month` >= 'StartMonth' AND `day` >= 'StartDay') OR
       (`year` = 'EndYear' AND `month` <= 'EndMonth' AND `day` <= 'EndDay'))
  GROUP BY
    date_trunc('hour', from_unixtime(start_time / 1000)), region, accountid,vpc_id, status_code,src_endpoint.svc_name, dst_endpoint.svc_name, connection_info.direction
  ORDER BY
    start_time
WITH (
  auto_refresh = false
)

-- refresh MV
REFRESH MATERIALIZED VIEW vpcflow_mview_30_min_connections
```

* * *

The `WHERE` clause should include conditions to filter data for the specific timeframe you're interested in.
The placeholders for the start and end dates (`StartYear`, `StartMonth`, `StartDay`, `EndYear`, `EndMonth`, `EndDay`) need to be replaced with the actual values representing the past week or any other period of interest.

* * *
3.) `VPC Requests By VPC ID using Aggregation Data`
The next queries shows the hourly (time-window) network aggregation summary grouped by Network IP ordered by requests unique address or bytes size.

```
-- One Hour Aggregation time window  of top IP dest by bytes sum group by hourly 
CREATE MATERIALIZED VIEW IF NOT EXISTS vpcflow_mview_60_min_network_ip_bytes_window AS
WITH hourly_buckets AS (
  SELECT
    date_trunc('hour', from_unixtime(start_time / 1000)) AS hour_bucket,
    CAST(IFNULL(dst_endpoint.ip, '0.0.0.0') AS STRING)  AS dstaddr,
    SUM(CAST(IFNULL(traffic.bytes, 0) AS LONG)) AS total_bytes
  FROM
    {table_name}
  GROUP BY
    hour_bucket,
    dstaddr
),
ranked_addresses AS (
  SELECT
    CAST(hour_bucket  AS TIMESTAMP),
    dstaddr,
    total_bytes,
    RANK() OVER (PARTITION BY hour_bucket ORDER BY total_bytes DESC) AS bytes_rank
  FROM
    hourly_buckets
)
SELECT
  CAST(hour_bucket  AS TIMESTAMP),
  dstaddr,
  total_bytes
FROM
  ranked_addresses
WHERE
  bytes_rank <= 50
ORDER BY
  hour_bucket ASC,
  bytes_rank ASC
WITH (
  auto_refresh = false
);
-- refresh MV
REFRESH MATERIALIZED VIEW vpcflow_mview_60_min_network_ip_bytes_window
```
* * *

```
-- One Hour Aggregation time window of top IP dest by cardinality group by hourly
 CREATE MATERIALIZED VIEW IF NOT EXISTS vpcflow_mview_60_min_network_ip_time_window AS
WITH hourly_buckets AS (
  SELECT
    date_trunc('hour', from_unixtime(start_time / 1000)) AS hour_bucket,
    CAST(IFNULL(dst_endpoint.ip, '0.0.0.0') AS STRING)  AS dstaddr,
    COUNT(*) AS total_count
  FROM
    {table_name}
  GROUP BY
    hour_bucket,
    dstaddr
),
ranked_addresses AS (
  SELECT
    CAST(hour_bucket  AS TIMESTAMP),
    dstaddr,
    total_count,
    RANK() OVER (PARTITION BY hour_bucket ORDER BY total_count DESC) AS addr_rank
  FROM
    hourly_buckets
)
SELECT
  CAST(hour_bucket  AS TIMESTAMP),
  dstaddr,
  total_count
FROM
  ranked_addresses
WHERE
  addr_rank <= 50
ORDER BY
  hour_bucket ASC,
  addr_rank ASC
WITH (
  auto_refresh = false
)
-- refresh MV
REFRESH MATERIALIZED VIEW vpcflow_mview_60_min_network_ip_time_window
```

* * *


As shown before a `WHERE` clause can be included conditions to filter data for the specific timeframe you're interested in.
The placeholders for the start and end dates (`StartYear`, `StartMonth`, `StartDay`, `EndYear`, `EndMonth`, `EndDay`) need to be replaced with the actual values representing the past week or any other period of interest.

* * *

## Appendix


### JSON Format Based VPC Table definition

```
--- DDL VPC statement definition
EXTERNAL TABLE IF NOT EXISTS vpc_flow_logs_parquet (
  cloud STRUCT<
    account_uid: STRING, 
    region: STRING, 
    zone: STRING, 
    provider: STRING
  >,
  src_endpoint STRUCT<
    port: INT, 
    svc_name: STRING, 
    ip: STRING, 
    intermediate_ips: ARRAY<STRING>, 
    interface_uid: STRING, 
    vpc_uid: STRING, 
    instance_uid: STRING, 
    subnet_uid: STRING
  >,
  dst_endpoint STRUCT<
    port: INT, 
    svc_name: STRING, 
    ip: STRING, 
    intermediate_ips: ARRAY<STRING>, 
    interface_uid: STRING, 
    vpc_uid: STRING, 
    instance_uid: STRING, 
    subnet_uid: STRING
  >,
  connection_info STRUCT<
    protocol_num: INT, 
    tcp_flags: INT, 
    protocol_ver: STRING, 
    boundary_id: INT, 
    boundary: STRING, 
    direction_id: INT, 
    direction: STRING
  >,
  traffic STRUCT<
    packets: BIGINT, 
    bytes: BIGINT
  >,
  time BIGINT,
  start_time BIGINT,
  end_time BIGINT,
  status_code STRING,
  severity_id INT,
  severity STRING,
  class_name STRING,
  class_uid INT,
  category_name STRING,
  category_uid INT,
  activity_name STRING,
  activity_id INT,
  disposition STRING,
  disposition_id INT,
  type_uid INT,
  type_name STRING,
  region STRING,
  accountid STRING,
  eventday STRING
)
USING json
LOCATION
  's3://DOC-EXAMPLE-BUCKET/prefix/AWSLogs/'

```

* * *

### Hive Based VPC Table definition

**Provider: hive**
Table Properties:
Glue Crawler:

*[CrawlerSchemaDeserializerVersion=1.0, CrawlerSchemaSerializerVersion=1.0, UPDATED_BY_CRAWLER=vpcflowlog-crawler, averageRecordSize=21, classification=parquet, compressionType=none, objectCount=129758, partition_filtering.enabled=true, recordCount=55779414, sizeKey=3062579049, typeOfData=file]*

Serde Library:
*org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe*

InputFormat:
*org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat*
* * *

```
--- DDL VPC statement definition
EXTERNAL TABLE IF NOT EXISTS vpc_flow_logs_parquet (
  cloud STRUCT<
    account_uid: STRING, 
    region: STRING, 
    zone: STRING, 
    provider: STRING
  >,
  src_endpoint STRUCT<
    port: INT, 
    svc_name: STRING, 
    ip: STRING, 
    intermediate_ips: ARRAY<STRING>, 
    interface_uid: STRING, 
    vpc_uid: STRING, 
    instance_uid: STRING, 
    subnet_uid: STRING
  >,
  dst_endpoint STRUCT<
    port: INT, 
    svc_name: STRING, 
    ip: STRING, 
    intermediate_ips: ARRAY<STRING>, 
    interface_uid: STRING, 
    vpc_uid: STRING, 
    instance_uid: STRING, 
    subnet_uid: STRING
  >,
  connection_info STRUCT<
    protocol_num: INT, 
    tcp_flags: INT, 
    protocol_ver: STRING, 
    boundary_id: INT, 
    boundary: STRING, 
    direction_id: INT, 
    direction: STRING
  >,
  traffic STRUCT<
    packets: BIGINT, 
    bytes: BIGINT
  >,
  time BIGINT,
  start_time BIGINT,
  end_time BIGINT,
  status_code STRING,
  severity_id INT,
  severity STRING,
  class_name STRING,
  class_uid INT,
  category_name STRING,
  category_uid INT,
  activity_name STRING,
  activity_id INT,
  disposition STRING,
  disposition_id INT,
  type_uid INT,
  type_name STRING,
  region STRING,
  accountid STRING,
  eventday STRING
)
PARTITIONED BY (
  `year` string, 
  `month` string, 
  `day` string,
  `hour` string
)ROW FORMAT SERDE 
  'org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe'
STORED AS INPUTFORMAT 
  'org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat' 
OUTPUTFORMAT 
  'org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat'
LOCATION
  's3://DOC-EXAMPLE-BUCKET/prefix/AWSLogs/'
TBLPROPERTIES (
  'EXTERNAL'='true', 
  'skip.header.line.count'='1'
  )
```

* * *

### Additional Resources

VPC logs fields  - https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html

Flint integration Adaptation Tutorial - https://github.com/opensearch-project/opensearch-catalog/issues/144