CREATE MATERIALIZED VIEW {table_name}__live_mview AS
  SELECT
    CAST(IFNULL(srcport, 0) AS LONG) AS `aws.vpc.srcport`,
    CAST(IFNULL(pkt_srcaddr, 'Unknown') AS STRING)  AS `aws.vpc.pkt-src-aws-service`,
    CAST(IFNULL(srcaddr, '0.0.0.0') AS STRING)  AS `aws.vpc.srcaddr`,
    CAST(IFNULL(interface_id, 'Unknown') AS STRING)  AS `aws.vpc.src-interface_uid`,
    CAST(IFNULL(vpc_id, 'Unknown') AS STRING)  AS `aws.vpc.src-vpc_uid`,
    CAST(IFNULL(instance_id, 'Unknown') AS STRING)  AS `aws.vpc.src-instance_uid`,
    CAST(IFNULL(subnet_id, 'Unknown') AS STRING)  AS `aws.vpc.src-subnet_uid`,
    CAST(IFNULL(dstport, 0) AS LONG) AS `aws.vpc.dstport`,
    CAST(IFNULL(pkt_dstaddr, 'Unknown') AS STRING) AS `aws.vpc.pkt-dst-aws-service`,
    CAST(IFNULL(dstaddr, '0.0.0.0') AS STRING)  AS `aws.vpc.dstaddr`,
    CAST(IFNULL(flow_direction, 'Unknown') AS STRING) AS `aws.vpc.flow-direction`,
    CAST(IFNULL(tcp_flags, '0') AS STRING)  AS `aws.vpc.connection.tcp_flags`,
    CAST(IFNULL(packets, 0) AS LONG) AS `aws.vpc.packets`,
    CAST(IFNULL(bytes, 0) AS LONG) AS `aws.vpc.bytes`,
    CAST(FROM_UNIXTIME(start ) AS TIMESTAMP) AS `@timestamp`,
    CAST(FROM_UNIXTIME(start ) AS TIMESTAMP) AS `start_time`,
    CAST(FROM_UNIXTIME(start ) AS TIMESTAMP) AS `interval_start_time`,
    CAST(FROM_UNIXTIME(`end` ) AS TIMESTAMP) AS `end_time`,
    CAST(IFNULL(log_status, 'Unknown') AS STRING)  AS `aws.vpc.status_code`,
    CAST(IFNULL(version, 0) AS LONG) AS `aws.vpc.version`,
    CAST(IFNULL(type, 'Unknown') AS STRING)  AS `aws.vpc.type_name`,
    CAST(IFNULL(traffic_path, 0) AS LONG)  AS `aws.vpc.traffic_path`,
    CAST(IFNULL(az_id, 'Unknown') AS STRING) AS `aws.vpc.az_id`,
    CAST(IFNULL(action, 'Unknown') AS STRING) AS `aws.vpc.action`,
    CAST(IFNULL(region, 'Unknown') AS STRING) AS `aws.vpc.region`,
    CAST(IFNULL(account_id, 'Unknown') AS STRING) AS `aws.vpc.account-id`,
    CAST(IFNULL(sublocation_type, 'Unknown') AS STRING) AS `aws.vpc.sublocation_type`,
    CAST(IFNULL(sublocation_id, 'Unknown') AS STRING) AS `aws.vpc.sublocation_id`

  FROM
    {table_name}
WITH (
  auto_refresh = true,
  refresh_interval = '15 Minute',
  checkpoint_location = '{s3_checkpoint_location}',
  watermark_delay = '1 Minute',
  extra_options = '{ "{table_name}": { "maxFilesPerTrigger": "10" }}'
)
