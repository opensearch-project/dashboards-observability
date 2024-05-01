CREATE MATERIALIZED VIEW IF NOT EXISTS {table_name}__agg_30_min_connections_mview AS
  SELECT
    CAST(from_unixtime(CAST((start_time / 1000) AS BIGINT) DIV 1800 * 1800) AS TIMESTAMP) AS interval_start_time,
    CAST(from_unixtime((CAST((start_time / 1000) AS BIGINT) DIV 1800 * 1800) + 1799) AS TIMESTAMP) AS interval_end_time,

    status_code as `aws.vpc.status_code`,
    CAST(IFNULL(connection_info['direction'], 'Unknown') AS STRING) AS `aws.vpc.connection.direction`,
    CAST(IFNULL(src_endpoint.svc_name, 'Unknown') AS STRING) AS `aws.vpc.pkt-src-aws-service`,
    CAST(IFNULL(dst_endpoint.svc_name, 'Unknown') AS STRING) AS `aws.vpc.pkt-dst-aws-service`,

    accountid as `aws.vpc.account-id`,
    region as `aws.vpc.region`,

    COUNT(*) AS total_connections,
    SUM(CAST(IFNULL(traffic.bytes, 0) AS LONG)) AS total_bytes,
    SUM(CAST(IFNULL(traffic.packets, 0) AS LONG)) AS total_packets
  FROM
    {table_name}
  GROUP BY
    CAST((start_time / 1000) AS BIGINT) DIV 1800 * 1800,
    region,
    accountid,
    status_code,
    src_endpoint.svc_name,
    dst_endpoint.svc_name,
    connection_info['direction']
  ORDER BY
    interval_start_time
WITH (
  auto_refresh = false
)

