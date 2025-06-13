CREATE MATERIALIZED VIEW {table_name}__mview AS
SELECT
  TUMBLE(`@timestamp`, '5 Minute').start AS `aws.networkfirewall.event.timestamp`,
  firewall_name AS `aws.networkfirewall.firewall_name`,
  event_src_ip AS `aws.networkfirewall.event.src_ip`,
  event_src_port AS `aws.networkfirewall.event.src_port`,
  event_dest_ip AS `aws.networkfirewall.event.dest_ip`,
  event_dest_port AS `aws.networkfirewall.event.dest_port`,
  event_proto AS `aws.networkfirewall.event.proto`,
  event_app_proto AS `aws.networkfirewall.event.app_proto`,
  event_tcp_tcp_flags AS `aws.networkfirewall.event.tcp.tcp_flags`,
  event_tcp_syn AS `aws.networkfirewall.event.tcp.syn`,
  event_tcp_ack AS `aws.networkfirewall.event.tcp.ack`,
  event_alert_action AS `aws.networkfirewall.event.alert.action`,
  event_alert_signature_id AS `aws.networkfirewall.event.alert.signature_id`,
  event_alert_signature AS `aws.networkfirewall.event.alert.signature`,
  event_http_hostname AS `aws.networkfirewall.event.http.hostname`,
  event_http_url AS `aws.networkfirewall.event.http.url`,
  event_http_http_user_agent AS `aws.networkfirewall.event.http.http_user_agent`,
  event_tls_sni AS `aws.networkfirewall.event.tls.sni`,
  event_netflow_age AS `aws.networkfirewall.event.netflow.age`,
  /* Aggregations */  
  SUM(CAST(event_netflow_bytes AS BIGINT)) AS `aws.networkfirewall.event.netflow.bytes`,
  SUM(CAST(event_netflow_pkts AS BIGINT)) AS `aws.networkfirewall.event.netflow.pkts`,  
  COUNT(*) AS `aws.networkfirewall.total_count`
FROM (
  SELECT
    CAST(event.timestamp AS TIMESTAMP) AS `@timestamp`,
    COALESCE(CAST(firewall_name AS STRING), 'UNKNOWN_FIREWALL') AS `firewall_name`,
    COALESCE(CAST(event.src_ip AS STRING), '-') AS `event_src_ip`,
    COALESCE(CAST(event.src_port AS INTEGER), -1) AS `event_src_port`,
    COALESCE(CAST(event.dest_ip AS STRING), '-') AS `event_dest_ip`,
    COALESCE(CAST(event.dest_port AS INTEGER), -1) AS `event_dest_port`,
    COALESCE(CAST(event.proto AS STRING), 'UNKNOWN_PROTO') AS `event_proto`,
    COALESCE(CAST(event.app_proto AS STRING), 'UNKNOWN_APP') AS `event_app_proto`,
    COALESCE(CAST(event.tcp.tcp_flags AS STRING), 'NONE') AS `event_tcp_tcp_flags`,
    COALESCE(CAST(event.tcp.syn AS BOOLEAN), false) AS `event_tcp_syn`,
    COALESCE(CAST(event.tcp.ack AS BOOLEAN), false) AS `event_tcp_ack`,
    COALESCE(CAST(event.alert.action AS STRING), 'UNKNOWN_ACTION') AS `event_alert_action`,
    COALESCE(CAST(event.alert.signature_id AS STRING), 'UNKNOWN_SIGID') AS `event_alert_signature_id`,
    COALESCE(CAST(event.alert.signature AS STRING), 'UNKNOWN_SIGNATURE') AS `event_alert_signature`,
    COALESCE(CAST(event.http.hostname AS STRING), 'UNKNOWN_HOST') AS `event_http_hostname`,
    COALESCE(CAST(event.http.url AS STRING), '/') AS `event_http_url`,
    COALESCE(CAST(event.http.http_user_agent AS STRING), 'UNKNOWN_AGENT') AS `event_http_http_user_agent`,
    COALESCE(CAST(event.tls.sni AS STRING), 'UNKNOWN_SNI') AS `event_tls_sni`,
    COALESCE(CAST(event.netflow.pkts AS LONG), 0) AS `event_netflow_pkts`,
    COALESCE(CAST(event.netflow.bytes AS LONG), 0) AS `event_netflow_bytes`,
    COALESCE(CAST(event.netflow.age AS INTEGER), 0) AS `event_netflow_age`
  FROM
    {table_name}
)
GROUP BY
  TUMBLE(`@timestamp`, '5 Minute'),
  firewall_name,
  event_src_ip,
  event_src_port,
  event_dest_ip,
  event_dest_port,
  event_proto,
  event_app_proto,
  event_tcp_tcp_flags,
  event_tcp_syn,
  event_tcp_ack,
  event_alert_action,
  event_alert_signature_id,
  event_alert_signature,
  event_http_hostname,
  event_http_url,
  event_http_http_user_agent,
  event_tls_sni,
  event_netflow_age
WITH (
  auto_refresh = true,
  refresh_interval = '15 Minute',
  watermark_delay = '1 Minute',
  checkpoint_location = '{s3_checkpoint_location}'
);
