CREATE MATERIALIZED VIEW {table_name}__mview AS
SELECT
  /* General log info */
  firewall_name AS `aws.networkfirewall.firewall_name`,
  /* General event info */
  CAST( event.timestamp AS TIMESTAMP) AS `aws.networkfirewall.event.timestamp`,
  event.src_ip AS `aws.networkfirewall.event.src_ip`,
  event.src_port AS `aws.networkfirewall.event.src_port`,
  event.dest_ip AS `aws.networkfirewall.event.dest_ip`,
  event.dest_port AS `aws.networkfirewall.event.dest_port`,
  event.proto AS `aws.networkfirewall.event.proto`,
  event.app_proto AS `aws.networkfirewall.event.app_proto`,
  /* TCP Events info */
  event.tcp.tcp_flags AS `aws.networkfirewall.event.tcp.tcp_flags`,
  event.tcp.syn AS `aws.networkfirewall.event.tcp.syn`,
  event.tcp.ack AS `aws.networkfirewall.event.tcp.ack`,
  /* Alert events info */
  event.alert.action AS `aws.networkfirewall.event.alert.action`,
  event.alert.signature_id AS `aws.networkfirewall.event.alert.signature_id`,
  event.alert.signature AS `aws.networkfirewall.event.alert.signature`,
  /* HTTP events info */
  event.http.hostname AS `aws.networkfirewall.event.http.hostname`,
  event.http.url AS `aws.networkfirewall.event.http.url`,
  event.http.http_user_agent AS `aws.networkfirewall.event.http.http_user_agent`,
  /* TLS Events info */ 
  event.tls.sni AS `aws.networkfirewall.event.tls.sni`,
  /* Netflow Events info */
  event.netflow.pkts AS `aws.networkfirewall.event.netflow.pkts`,
  event.netflow.bytes AS `aws.networkfirewall.event.netflow.bytes`,
  event.netflow.age AS `aws.networkfirewall.event.netflow.age`  
FROM
  {table_name}
WITH (
  auto_refresh = true,
  refresh_interval = '15 Minute',
  checkpoint_location = '{s3_checkpoint_location}',
  watermark_delay = '1 Minute'
)
