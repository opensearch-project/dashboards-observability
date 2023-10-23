CREATE EXTERNAL TABLE IF NOT EXISTS {table_name} (
    remote_addr string,
    remote_host string,
    remote_user string,
    time_local string,
    request_method string,
    request_path string,
    status_code int,
    body_bytes_sent int,
    http_referer string,
    http_user_agent string,
) ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.RegexSerDe'
WITH
    SERDEPROPERTIES (
        'serialization.format' = '1',
        'input.regex' = '^(?<remote_addr>[^ ]*) (?<remote_host>[^ ]*) (?<remote_user>[^ ]*) \[(?<time_local>[^\]]*)\] "(?<request_method>\S+)(?: +(?<request_path>[^\"]*?)(?: +\S*)?)?" (?<status_code>[^ ]*) (?<body_bytes_sent>[^ ]*)(?: "(?<http_referer>[^\"]*)" "(?<http_user_agent>[^\"]*)")'
    ) LOCATION '{s3_bucket_location}';
