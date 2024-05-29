CREATE SKIPPING INDEX ON {table_name} (
    `userIdentity.principalId` BLOOM_FILTER,
    `userIdentity.accountId` BLOOM_FILTER,
    `userIdentity.userName` BLOOM_FILTER,
    `sourceIPAddress` BLOOM_FILTER,
    `eventId` BLOOM_FILTER,
    `userIdentity.type` VALUE_SET,
    `eventName` VALUE_SET,
    `eventType` VALUE_SET,
    `awsRegion` VALUE_SET
) WITH (
    auto_refresh = true,
    refresh_interval = '15 Minutes',
    checkpoint_location = '{s3_checkpoint_location}',
    watermark_delay = '1 Minute'
)
