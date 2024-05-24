CREATE MATERIALIZED VIEW IF NOT EXISTS {table_name}__agg_60_min_connections_mview AS
  SELECT
    CAST(from_unixtime(CAST(start AS BIGINT) DIV 360 * 360) AS TIMESTAMP) AS interval_start_time,
    CAST(from_unixtime(CAST(start AS BIGINT) DIV 360 * 360) + INTERVAL 1 HOUR AS TIMESTAMP) AS interval_end_time,

    CAST(IFNULL(log_status, 'Unknown') AS STRING) as `aws.vpc.status_code`,
    CAST(flow_direction) AS STRING)  AS `aws.vpc.connection.direction`,
    CAST(IFNULL(pkt_src_aws_service, 'Unknown') AS STRING)  AS `aws.vpc.pkt-src-aws-service`,
    CAST(IFNULL(pkt_dst_aws_service, 'Unknown') AS STRING) AS `aws.vpc.pkt-dst-aws-service`,

    CAST(IFNULL(account_id, 'Unknown') AS STRING) as `aws.vpc.account-id`,
    CAST(IFNULL(region, 'Unknown') AS STRING) as `aws.vpc.region`,

    COUNT(*) AS total_connections,
    SUM(CAST(IFNULL(bytes, 0) AS LONG)) AS total_bytes,
    SUM(CAST(IFNULL(packets, 0) AS LONG)) AS total_packets
  FROM
    {table_name}
  GROUP BY
    CAST(from_unixtime(CAST(start AS BIGINT) DIV 360 * 360) AS TIMESTAMP),
    region,
    account_id,
    log_status,
    pkt_src_aws_service,
    pkt_dst_aws_service,
    flow_direction
  ORDER BY
    interval_start_time
WITH (
  auto_refresh = false
)
