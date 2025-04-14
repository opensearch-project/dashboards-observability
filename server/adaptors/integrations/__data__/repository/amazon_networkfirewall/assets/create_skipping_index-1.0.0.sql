CREATE SKIPPING INDEX ON {table_name} (
    `event.src_ip` BLOOM_FILTER,
    `event.dest_ip` BLOOM_FILTER,
    `event.proto` VALUE_SET,    
    `event.alert.severity` VALUE_SET,
    `event.event_type` VALUE_SET,
    `firewall_name` VALUE_SET,
    `availability_zone` VALUE_SET
) WITH (
    auto_refresh = true,
    refresh_interval = '15 Minutes',
    checkpoint_location = '{s3_checkpoint_location}',
    watermark_delay = '1 Minute'
)
