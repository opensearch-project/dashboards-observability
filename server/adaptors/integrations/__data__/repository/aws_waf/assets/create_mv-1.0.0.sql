CREATE MATERIALIZED VIEW {table_name}__mview AS
SELECT
    CAST(FROM_UNIXTIME(`timestamp`/ 1000) AS TIMESTAMP) AS `@timestamp`,
    formatVersion AS `aws.waf.formatVersion`,
    webaclId AS `aws.waf.webaclId`,
    terminatingRuleId AS `aws.waf.terminatingRuleId`,
    terminatingRuleType AS `aws.waf.terminatingRuleType`,
    action AS `aws.waf.action`,
    httpSourceName AS `aws.waf.httpSourceName`,
    httpSourceId AS `aws.waf.httpSourceId`,
    ruleGroupList AS `aws.waf.ruleGroupList`,
    rateBasedRuleList AS `aws.waf.rateBasedRuleList`,
    nonTerminatingMatchingRules AS `aws.waf.nonTerminatingMatchingRules`,
    requestHeadersInserted AS `aws.waf.requestHeadersInserted`,
    responseCodeSent AS `aws.waf.responseCodeSent`,
    httpRequest AS `aws.waf.httpRequest`,
    labels AS `aws.waf.labels`,
    captchaResponse AS `aws.waf.captchaResponse`,
    challengeResponse AS `aws.waf.challengeResponse`,
    ja3Fingerprint AS `aws.waf.ja3Fingerprint`
FROM
    {table_name}
WITH (
  auto_refresh = true,
  refresh_interval = '15 Minute',
  checkpoint_location = '{s3_checkpoint_location}',
  watermark_delay = '1 Minute',
  extra_options = '{ "{table_name}": { "maxFilesPerTrigger": "10" }}'
)
