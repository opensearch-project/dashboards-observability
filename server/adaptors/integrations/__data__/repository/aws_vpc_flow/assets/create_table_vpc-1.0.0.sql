CREATE EXTERNAL TABLE IF NOT EXISTS {table_name} (
    version INT,
    account_id STRING,
    interface_id STRING,
    srcaddr STRING,
    dstaddr STRING,
    srcport STRING,
    dstport STRING,
    protocol STRING,
    packets STRING,
    bytes STRING,
    start BIGINT,
    end BIGINT,
    action STRING,
    log_status STRING
)USING csv
LOCATION '{s3_bucket_location}'
OPTIONS (
  sep=' '
);