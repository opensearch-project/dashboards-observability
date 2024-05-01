CREATE SKIPPING INDEX ON {table_name} (
    requester BLOOM_FILTER,
    http_status VALUE_SET,
    request_time MIN_MAX
) WITH (
    auto_refresh = true,
    refresh_interval = '15 Minutes',
    checkpoint_location = '{s3_checkpoint_location}',
    watermark_delay = '1 Minute'
)
