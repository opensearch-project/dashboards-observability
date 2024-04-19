CREATE MATERIALIZED VIEW {table_name}__mview AS
SELECT
    to_timestamp(trim(BOTH '[]' FROM concat(time_local_1, ' ', time_local_2)), 'dd/MMM/yyyy:HH:mm:ss Z') AS `@timestamp`,
    split_part (request, ' ', 1) as `http.request.method`,
    split_part (request, ' ', 2) as `http.url`,
    split_part (request, ' ', 3) as `http.flavor`,
    status AS `http.response.status_code`,
    body_bytes_sent AS `http.response.bytes`,
    'nginx.access' AS `event.domain`
FROM {table_name}
WITH (
    auto_refresh = 'true',
    refresh_interval = '15 Minute',
    checkpoint_location = '{s3_checkpoint_location}',
    watermark_delay = '1 Minute',
    extra_options = '{ "{table_name}": { "maxFilesPerTrigger": "10" }}'
)
