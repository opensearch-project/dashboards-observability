CREATE MATERIALIZED VIEW {table_name}_mview AS
SELECT
    regexp_extract(
        record,
        "^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
        1
    ) AS `connection.source.ip`,
    cast(regexp_extract(
        record,
        "^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
        2
    ) AS int) AS `connection.source.port`,
    to_timestamp(regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		3
	), "dd/MMM/yyyy:HH:mm:ss.SSS") AS `@timestamp`,
    regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		4
	) AS `haproxy.service_name`,
    regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		5
	) AS `haproxy.backend_name`,
    regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		6
	) AS `haproxy.proxy_name`,
    cast(regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		7
	) AS int) AS `haproxy.time_total_ms`,
    cast(regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		8
	) AS int) AS `haproxy.time_queue_ms`,
    cast(regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		9
	) AS int) AS `haproxy.time_connection_ms`,
    cast(regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		10
	) AS int) AS `haproxy.time_server_ms`,
    cast(regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		11
	) AS int) AS `haproxy.time_active_ms`,
    cast(regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		12
	) AS int) AS `http.response.status_code`,
    cast(regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		13
	) AS int) AS `http.response.bytes`,
    regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		14
	) AS `http.request.captured_cookie`,
    regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		15
	) AS `http.response.captured_cookie`,
    regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		16
	) AS termination_state,
    cast(regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		17
	) AS int) AS `haproxy.active_connections`,
    cast(regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		18
	) AS int) AS `haproxy.frontend_connections`,
    cast(regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		19
	) AS int) AS `haproxy.backend_connections`,
    cast(regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		20
	) AS int) AS `haproxy.server_connections`,
    cast(regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		21
	) AS int) AS `haproxy.retries`,
    cast(regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		22
	) AS int) AS `haproxy.server_queue`,
    cast(regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		23
	) AS int) AS `haproxy.backend_queue`,
    regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		24
	) AS `http.request.captured_headers`,
    regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		25
	) AS `http.response.captured_headers`,
    regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		26
	) AS `http.request.method`,
    regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		27
	) AS `http.url`,
    regexp_extract(
		record,
		"^([\\d\\.]+):(\\d+) \\[(.+)\\] ([\\w\\-]+) ([\\w\\-]+)\\\/([\\w\\-]+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+) (\\d+) (.+) (.+) (.+) (\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+)\\\/(\\d+) (\\d+)\\\/(\\d+) \\{(.*)\\}(?: \\{(.*)\\})? \"(\\w+) (.+) (.+)\"+$",
		28
	) AS `http.flavor`,
    'haproxy.access' AS `event.domain`
FROM {table_name}
WITH (
    auto_refresh = true,
    checkpoint_location = '{s3_checkpoint_location}',
    watermark_delay = '1 Minute',
    extra_options = '{ "{table_name}": { "maxFilesPerTrigger": "10" }}'
);
