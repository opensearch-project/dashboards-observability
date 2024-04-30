CREATE SKIPPING INDEX ON {table_name} (
    c_ip BLOOM_FILTER,
    sc_status VALUE_SET,
    time_to_first_byte MIN_MAX
) WITH (
    auto_refresh = true,
    refresh_interval = '15 Minutes',
    checkpoint_location = '{s3_checkpoint_location}',
    watermark_delay = '1 Minute'
)
