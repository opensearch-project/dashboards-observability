CREATE EXTERNAL TABLE {table_name} (
  remote_addr STRING,
  empty_col STRING,
  remote_user STRING,
  time_local_1 STRING,
  time_local_2 STRING,
  request STRING,
  status INT,
  body_bytes_sent INT,
  http_referer STRING,
  http_user_agent STRING,
  gzip_ratio STRING
)
USING csv
OPTIONS (
  sep=' ',
  nullValue='-',
  recursiveFileLookup='true'
)
LOCATION '{s3_bucket_location}'
