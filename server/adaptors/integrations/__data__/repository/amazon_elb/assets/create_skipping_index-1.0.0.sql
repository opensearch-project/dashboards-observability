CREATE SKIPPING INDEX ON {table_name} (
    client_ip BLOOM_FILTER,
    elb_status_code VALUE_SET,
    request_processing_time MIN_MAX,
    sent_bytes MIN_MAX
) WITH (
    auto_refresh = true,
    refresh_interval = '15 Minutes',
    checkpoint_location = '{s3_checkpoint_location}',
    watermark_delay = '1 Minute'
)
