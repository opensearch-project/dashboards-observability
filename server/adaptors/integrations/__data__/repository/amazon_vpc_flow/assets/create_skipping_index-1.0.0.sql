CREATE SKIPPING INDEX ON {table_name} (
    account_id BLOOM_FILTER,
    region VALUE_SET,
    srcaddr BLOOM_FILTER,
    dstaddr BLOOM_FILTER,
    pkt_src_aws_service VALUE_SET,
    pkt_dst_aws_service VALUE_SET,
    bytes MIN_MAX
) WITH (
    auto_refresh = true,
    refresh_interval = '15 Minutes',
    checkpoint_location = '{s3_checkpoint_location}',
    watermark_delay = '1 Minute'
)
