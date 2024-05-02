CREATE SKIPPING INDEX ON {table_name} (
    accountid BLOOM_FILTER,
    region VALUE_SET,
    severity_id VALUE_SET,
    src_endpoint.ip BLOOM_FILTER,
    dst_endpoint.ip BLOOM_FILTER,
    src_endpoint.svc_name VALUE_SET,
    dst_endpoint.svc_name VALUE_SET,
    request_processing_time MIN_MAX,
    traffic.bytes MIN_MAX
) WITH (
    auto_refresh = true,
    refresh_interval = '15 Minutes',
    checkpoint_location = '{s3_checkpoint_location}',
    watermark_delay = '1 Minute'
)
