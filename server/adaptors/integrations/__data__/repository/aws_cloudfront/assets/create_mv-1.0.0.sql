CREATE MATERIALIZED VIEW {table_name}__mview AS
SELECT
  to_timestamp(trim(BOTH '[]' FROM concat(date, ' ', time)), 'yyyy-MM-dd HH:mm:ss') AS `@timestamp`,
  c_ip AS `aws.cloudfront.c-ip`,
  c_port as `aws.cloudfront.c-port`,
  cs_cookie as `aws.cloudfront.cs-cookie`,
  cs_host as `aws.cloudfront.cs-host`,
  cs_referrer as `aws.cloudfront.cs-referer`,
  cs_user_agent as `aws.cloudfront.cs-user-agent`,
  cs_bytes as `aws.cloudfront.cs-bytes`,
  cs_method as `aws.cloudfront.cs-method`,
  cs_protocol as `aws.cloudfront.cs-protocol`,
  cs_protocol_version as `aws.cloudfront.cs-protocol-version`,
  cs_uri_query as `aws.cloudfront.cs-uri-query`,
  cs_uri_stem as `aws.cloudfront.cs-uri-stem`,
  fle_encrypted_fields as `aws.cloudfront.fle-encrypted-fields`,
  fle_status as `aws.cloudfront.fle-status`,
  sc_bytes as `aws.cloudfront.sc-bytes`,
  sc_content_len as `aws.cloudfront.sc-content-len`,
  sc_content_type as `aws.cloudfront.sc-content-type`,
  sc_range_end as `aws.cloudfront.sc-range-end`,
  sc_range_start as `aws.cloudfront.sc-range-start`,
  sc_status as `aws.cloudfront.sc-status`,
  ssl_cipher as `aws.cloudfront.ssl-cipher`,
  ssl_protocol as `aws.cloudfront.ssl-protocol`,
  time_taken as `aws.cloudfront.time-taken`,
  time_to_first_byte as `aws.cloudfront.time-to-first-byte`,
  x_edge_detailed_result_type as `aws.cloudfront.x-edge_detailed-result-type`,
  x_edge_location as `aws.cloudfront.x-edge-location`,
  x_edge_request_id as `aws.cloudfront.x-edge-request-id`,
  x_edge_result_type as `aws.cloudfront.x-edge-result-type`,
  x_edge_response_result_type as `aws.cloudfront.x-edge-response-result-type`,
  x_forwarded_for as `aws.cloudfront.x-forwarded-for`,
  x_host_header as `aws.cloudfront.x-host-header`
FROM 
  {table_name}
WITH (
  auto_refresh = true,
  refresh_interval = '15 Minute',
  checkpoint_location = '{s3_checkpoint_location}',
  watermark_delay = '1 Minute',
  extra_options = '{ "{table_name}": { "maxFilesPerTrigger": "10" }}'
)
