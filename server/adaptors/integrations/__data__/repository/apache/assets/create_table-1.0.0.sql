CREATE EXTERNAL TABLE IF NOT EXISTS {table_name} (
  remote_addr STRING,
  empty_col STRING,
  remote_user STRING,
  time_local_1 STRING,
  time_local_2 STRING,
  request STRING,
  status INT,
  body_bytes_sent INT,
  http_referer STRING,
  http_user_agent STRING
) USING csv
LOCATION '{s3_bucket_location}'
OPTIONS (
  sep=' ',
  nullValue='-'
)
