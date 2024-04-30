CREATE SKIPPING INDEX ON {table_name} (
    remote_addr BLOOM_FILTER,
    `status` VALUE_SET,
    body_bytes_sent MIN_MAX
) WITH (
    auto_refresh = true,
    refresh_interval = '15 Minutes',
    checkpoint_location = '{s3_checkpoint_location}',
    watermark_delay = '1 Minute'
)
