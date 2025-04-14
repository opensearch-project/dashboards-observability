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
    firewall_name AS `firewall_name`,
    event.src_ip AS `event_src_ip`,
    event.src_port AS `event_src_port`,
    event.dest_ip AS `event_dest_ip`,
    event.dest_port AS `event_dest_port`,
    event.proto AS `event_proto`,
    event.app_proto AS `event_app_proto`,
    event.tcp.tcp_flags AS `event_tcp_tcp_flags`,
    event.tcp.syn AS `event_tcp_syn`,
    event.tcp.ack AS `event_tcp_ack`,
    event.alert.action AS `event_alert_action`,
    event.alert.signature_id AS `event_alert_signature_id`,
    event.alert.signature AS `event_alert_signature`,
    event.http.hostname AS `event_http_hostname`,
    event.http.url AS `event_http_url`,
    event.http.http_user_agent AS `event_http_http_user_agent`,
    event.tls.sni AS `event_tls_sni`,
    event.netflow.pkts AS `event_netflow_pkts`,
    event.netflow.bytes AS `event_netflow_bytes`,
    event.netflow.age AS `event_netflow_age`
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
