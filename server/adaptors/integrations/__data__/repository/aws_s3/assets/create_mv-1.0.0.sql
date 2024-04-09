CREATE MATERIALIZED VIEW {table_name}_mview AS
SELECT
    to_timestamp(trim(BOTH '[]' FROM concat(request_datetime_1, ' ', request_datetime_2)), 'dd/MMM/yyyy:HH:mm:ss Z') as `@timestamp`,
    bucket_name as `aws.s3.bucket`,
    remote_ip as `communication.source.ip`,
    remote_ip as `aws.s3.remote_ip`,
    request_id as `aws.s3.request_id`,
    operation as `aws.s3.operation`,
    request_key as `aws.s3.key`,
    request_uri as `aws.s3.request_uri`,
    http_status as `http.response.status_code`,
    http_status as `aws.s3.http_status`,
    error_code as `aws.s3.error_code`,
    bytes_sent as `aws.s3.bytes_sent`,
    object_size as `aws.s3.object_size`,
    total_time as `aws.s3.total_time`,
    turn_around_time as `aws.s3.turn_around_time`,
    referrer as `http.referrer`,
    user_agent as `http.user_agent.original`,
    version_id as `aws.s3.version_id`,
    host_id as `aws.s3.host_id`,
    signature_version as `aws.s3.signature_version`,
    cipher_suite as `aws.s3.cipher_suite`,
    auth_type as `aws.s3.authentication_type`,
    host_header as `aws.s3.host_header`,
    tls_version as `aws.s3.tls_version`
FROM
    {table_name}