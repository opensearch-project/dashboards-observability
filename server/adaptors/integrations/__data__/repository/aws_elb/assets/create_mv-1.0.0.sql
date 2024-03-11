CREATE MATERIALIZED VIEW {table_name}_mview AS
SELECT
    type as `aws.elb.elb_type`,
    time as `@timestamp`,
    elb as `aws.elb.elb_name`,
    split_part (client_ip, ':', 1) as `communication.source.ip`,
    split_part (client_ip, ':', 2) as `communication.source.port`,
    split_part (target_ip, ':', 1) as `communication.destination.ip`,
    split_part (target_ip, ':', 2) as `communication.destination.port`,
    request_processing_time as `aws.elb.request_processing_time`,
    target_processing_time as `aws.elb.target_processing_time`,
    response_processing_time as `aws.elb.response_processing_time`,
    elb_status_code as `http.response.status_code`,
    target_status_code as `aws.elb.target_status_code`,
    received_bytes as `aws.elb.received_bytes`,
    sent_bytes as `aws.elb.sent_bytes`,
    split_part (request, ' ', 1) as `http.request.method`,
    split_part (request, ' ', 2) as `url.full`,
    parse_url (split_part (request, ' ', 2), 'HOST') as `url.domain`,
    parse_url (split_part (request, ' ', 2), 'PATH') as `url.path`,
    split_part (request, ' ', 3) as `url.schema`,
    request AS `http.request.body.content`,
    user_agent as `http.user_agent.original`,
    user_agent as `http.user_agent.name`,
    ssl_cipher as `aws.elb.ssl_cipher`,
    ssl_protocol as `aws.elb.ssl_protocol`,
    split_part (target_group_arn, ':', 4) as `cloud.region`,
    split_part (target_group_arn, ':', 5) as `cloud.account.id`,
    trace_id as `traceId`,
    chosen_cert_arn as `aws.elb.chosen_cert_arn`,
    matched_rule_priority as `aws.elb.matched_rule_priority`,
    request_creation_time as `aws.elb.request_creation_time`,
    actions_executed as `aws.elb.actions_executed`,
    redirect_url as `aws.elb.redirect_url`,
    lambda_error_reason as `aws.elb.lambda_error_reason`,
    target_port_list as `aws.elb.target_port_list`,
    target_status_code_list as `aws.elb.target_status_code_list`,
    classification as `aws.elb.classification`,
    classification_reason as `aws.elb.classification_reason`
FROM
    {table_name}
WITH (
    auto_refresh = 'true',
    checkpoint_location = '{s3_checkpoint_location}',
    watermark_delay = '1 Minute',
    extra_options = '{ "{table_name}": { "maxFilesPerTrigger": "10" }}'
);
