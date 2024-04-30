CREATE MATERIALIZED VIEW IF NOT EXISTS {table_name}__window_agg_60_min_network_ip_bytes_mview AS
WITH hourly_buckets AS (
  SELECT
    date_trunc('hour', from_unixtime(start_time / 1000)) AS interval_start_time,
    CAST(IFNULL(dst_endpoint.ip, '0.0.0.0') AS STRING)  AS dstaddr,
    SUM(CAST(IFNULL(traffic.bytes, 0) AS LONG)) AS total_bytes
  FROM
    {table_name}
  GROUP BY
    interval_start_time,
    dstaddr
),
ranked_addresses AS (
  SELECT
    CAST(interval_start_time  AS TIMESTAMP),
    dstaddr,
    total_bytes,
    RANK() OVER (PARTITION BY interval_start_time ORDER BY total_bytes DESC) AS bytes_rank
  FROM
    hourly_buckets
)
SELECT
  CAST(interval_start_time  AS TIMESTAMP),
  dstaddr,
  total_bytes
FROM
  ranked_addresses
WHERE
    bytes_rank <= 50
ORDER BY
  interval_start_time ASC,
  bytes_rank ASC
WITH (
  auto_refresh = false
)
