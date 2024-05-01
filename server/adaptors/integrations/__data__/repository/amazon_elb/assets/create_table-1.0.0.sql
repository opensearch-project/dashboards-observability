CREATE EXTERNAL TABLE IF NOT EXISTS {table_name} (
  type string,
  time timestamp,
  elb string,
  client_ip string,
  target_ip string,
  request_processing_time double,
  target_processing_time double,
  response_processing_time double,
  elb_status_code int,
  target_status_code string,
  received_bytes bigint,
  sent_bytes bigint,
  request string,
  user_agent string,
  ssl_cipher string,
  ssl_protocol string,
  target_group_arn string,
  trace_id string,
  domain_name string,
  chosen_cert_arn string,
  matched_rule_priority string,
  request_creation_time timestamp,
  actions_executed string,
  redirect_url string,
  lambda_error_reason string,
  target_port_list string,
  target_status_code_list string,
  classification string,
  classification_reason string
)
USING csv
LOCATION '{s3_bucket_location}'
OPTIONS (
  sep=' ',
  compression='gzip',
  recursiveFileLookup='true'
)
