CREATE SKIPPING INDEX ON {table_name} (
    rec.userIdentity.principalId BLOOM_FILTER,
    rec.userIdentity.accountId BLOOM_FILTER,
    rec.userIdentity.userName BLOOM_FILTER,
    rec.sourceIPAddress BLOOM_FILTER,
    rec.eventId BLOOM_FILTER,
    rec.userIdentity.type VALUE_SET,
    rec.eventName VALUE_SET,
    rec.eventType VALUE_SET,
    rec.awsRegion VALUE_SET
) WITH (
    auto_refresh = true,
    refresh_interval = '15 Minutes',
    checkpoint_location = '{s3_checkpoint_location}',
    watermark_delay = '1 Minute'
)
