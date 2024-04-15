-- One Hour Aggregation MV of VPC connections / bytes / packets
CREATE MATERIALIZED VIEW IF NOT EXISTS {table_name}_agg_60_min_connections_mview AS
  SELECT
    date_trunc('hour', from_unixtime(start_time / 1000)) AS interval_start_time,
    date_trunc('hour', from_unixtime(start_time / 1000)) + INTERVAL 1 HOUR AS interval_end_time,

    status_code as `aws.vpc.status_code`,
    CAST(IFNULL(connection_info['direction'], 'Unknown') AS STRING)  AS `aws.vpc.connection.direction`,
    CAST(IFNULL(src_endpoint.svc_name, 'Unknown') AS STRING)  AS `aws.vpc.pkt-src-aws-service`,
    CAST(IFNULL(dst_endpoint.svc_name, 'Unknown') AS STRING) AS `aws.vpc.pkt-dst-aws-service`,

    accountid as `aws.vpc.account-id`,
    region as `aws.vpc.region`,

    COUNT(*) AS total_connections,
    SUM(CAST(IFNULL(traffic.bytes, 0) AS LONG)) AS total_bytes,
    SUM(CAST(IFNULL(traffic.packets, 0) AS LONG)) AS total_packets
  FROM
    {table_name}
  GROUP BY
    date_trunc('hour', from_unixtime(start_time / 1000)),
    region,
    accountid,
    status_code,
    src_endpoint.svc_name,
    dst_endpoint.svc_name,
    connection_info['direction']
  ORDER BY
    interval_start_time
WITH (
  auto_refresh = true,
  refresh_interval = '1 day',
  checkpoint_location = '{s3_checkpoint_location}',
  watermark_delay = '1 day',
  extra_options = '{ "{table_name}": { "maxFilesPerTrigger": "10" }}'
)

