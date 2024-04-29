CREATE SKIPPING INDEX ON {table_name} (
  `timestamp` VALUE_SET, 
  `webaclId` VALUE_SET, 
  `httpRequest` VALUE_SET, 
  `action` VALUE_SET, 
  `terminatingRuleType` VALUE_SET
) WITH (
  auto_refresh = true,
  refresh_interval = '15 Minutes',
  checkpoint_location = '{s3_checkpoint_location}',
  watermark_delay = '1 Minute'
)
