CREATE EXTERNAL TABLE IF NOT EXISTS {table_name} (
  owner_id STRING,
  bucket_name STRING,
  request_time STRING,
  request_time_zone STRING,
  remote_ip STRING,
  requester STRING,
  request_id STRING,
  operation STRING,
  key STRING,
  request_uri STRING,
  http_status STRING,
  error_code STRING,
  bytes_sent BIGINT,
  object_size BIGINT,
  total_time STRING,
  turn_around_time STRING,
  referrer STRING,
  user_agent STRING,
  version_id STRING,
  host_id STRING,
  signature_version STRING,
  cipher_suite STRING,
  authentication_type STRING,
  host_header STRING,
  tls_version STRING
)
USING csv
OPTIONS (
  sep=' ',
  recursiveFileLookup='true'
)
LOCATION '{s3_bucket_location}'
