CREATE MATERIALIZED VIEW {table_name}__mview AS
SELECT
  owner_id AS `aws.s3.bucket_owner`,
  bucket_name AS `aws.s3.bucket`,
  to_timestamp(CONCAT(SUBSTRING(request_time, 2), ' ', SUBSTRING(request_time_zone, 1, LENGTH(request_time_zone) - 1)), 'dd/MMM/yyyy:HH:mm:ss Z') AS `@timestamp`,
  CONCAT(request_time, ' ', request_time_zone) AS `aws.s3.request_time`,
  remote_ip AS `aws.s3.remote_ip`,
  requester AS `aws.s3.requester`,
  request_id AS `aws.s3.request_id`,
  operation AS `aws.s3.operation`,
  key AS `aws.s3.key`,
  request_uri AS `aws.s3.request_uri`,
  http_status AS `aws.s3.http_status`,
  error_code AS `aws.s3.error_code`,
  bytes_sent AS `aws.s3.bytes_sent`,
  object_size AS `aws.s3.object_size`,
  CAST(total_time AS INTEGER) AS `aws.s3.total_time`,
  CAST(turn_around_time AS INTEGER) AS `aws.s3.turn_around_time`,
  referrer AS `aws.s3.referrer`,
  user_agent AS `aws.s3.user_agent`,
  version_id AS `aws.s3.version_id`,
  host_id AS `aws.s3.host_id`,
  signature_version AS `aws.s3.signature_version`,
  cipher_suite AS `aws.s3.cipher_suite`,
  authentication_type AS `aws.s3.authentication_type`,
  host_header AS `aws.s3.host_header`,
  tls_version AS `aws.s3.tls_version`
FROM
  {table_name}
WITH (
  auto_refresh = true,
  refresh_interval = '15 Minute',
  checkpoint_location = '{s3_checkpoint_location}',
  watermark_delay = '1 Minute',
  extra_options = '{ "{table_name}": { "maxFilesPerTrigger": "10" }}'
)
