CREATE MATERIALIZED VIEW {table_name}__mview AS
SELECT
  rec.userIdentity.type AS `aws.cloudtrail.userIdentity.type`,
  rec.userIdentity.principalId AS `aws.cloudtrail.userIdentity.principalId`,
  rec.userIdentity.arn AS `aws.cloudtrail.userIdentity.arn`,
  rec.userIdentity.accountId AS `aws.cloudtrail.userIdentity.accountId`,
  rec.userIdentity.invokedBy AS `aws.cloudtrail.userIdentity.invokedBy`,
  rec.userIdentity.accessKeyId AS `aws.cloudtrail.userIdentity.accessKeyId`,
  rec.userIdentity.userName AS `aws.cloudtrail.userIdentity.userName`,
  rec.userIdentity.sessionContext.attributes.mfaAuthenticated AS `aws.cloudtrail.userIdentity.sessionContext.attributes.mfaAuthenticated`,
  CAST(rec.userIdentity.sessionContext.attributes.creationDate  AS TIMESTAMP) AS `aws.cloudtrail.userIdentity.sessionContext.attributes.creationDate`,
  rec.userIdentity.sessionContext.sessionIssuer.type AS `aws.cloudtrail.userIdentity.sessionContext.sessionIssuer.type`,
  rec.userIdentity.sessionContext.sessionIssuer.principalId AS `aws.cloudtrail.userIdentity.sessionContext.sessionIssuer.principalId`,
  rec.userIdentity.sessionContext.sessionIssuer.arn AS `aws.cloudtrail.userIdentity.sessionContext.sessionIssuer.arn`,
  rec.userIdentity.sessionContext.sessionIssuer.accountId AS `aws.cloudtrail.userIdentity.sessionContext.sessionIssuer.accountId`,
  rec.userIdentity.sessionContext.sessionIssuer.userName AS `aws.cloudtrail.userIdentity.sessionContext.sessionIssuer.userName`,
  rec.userIdentity.sessionContext.ec2RoleDelivery AS `aws.cloudtrail.userIdentity.sessionContext.ec2RoleDelivery`,

  rec.eventVersion AS `aws.cloudtrail.eventVersion`,
  CAST(rec.eventTime AS TIMESTAMP)  AS `@timestamp`,
  rec.eventSource AS `aws.cloudtrail.eventSource`,
  rec.eventName AS `aws.cloudtrail.eventName`,
  rec.eventCategory AS `aws.cloudtrail.eventCategory`,
  rec.eventType AS `aws.cloudtrail.eventType`,
  rec.eventId AS `aws.cloudtrail.eventId`,

  rec.awsRegion AS `aws.cloudtrail.awsRegion`,
  rec.sourceIPAddress AS `aws.cloudtrail.sourceIPAddress`,
  rec.userAgent AS `aws.cloudtrail.userAgent`,
  rec.errorCode AS `errorCode`,
  rec.errorMessage AS `errorMessage`,
  rec.requestParameters AS `aws.cloudtrail.requestParameter`,
  rec.responseElements AS `aws.cloudtrail.responseElements`,
  rec.additionalEventData AS `aws.cloudtrail.additionalEventData`,
  rec.requestId AS `aws.cloudtrail.requestId`,
  rec.resources AS `aws.cloudtrail.resources`,
  rec.apiVersion AS `aws.cloudtrail.apiVersion`,
  rec.readOnly AS `aws.cloudtrail.readOnly`,
  rec.recipientAccountId AS `aws.cloudtrail.recipientAccountId`,
  rec.serviceEventDetails AS `aws.cloudtrail.serviceEventDetails`,
  rec.sharedEventId AS `aws.cloudtrail.sharedEventId`,
  rec.vpcEndpointId AS `aws.cloudtrail.vpcEndpointId`,
  rec.tlsDetails.tlsVersion AS `aws.cloudtrail.tlsDetails.tls_version`,
  rec.tlsDetails.cipherSuite AS `aws.cloudtrail.tlsDetailscipher_suite`,
  rec.tlsDetails.clientProvidedHostHeader AS `aws.cloudtrail.tlsDetailsclient_provided_host_header`
FROM
  {table_name}
  LATERAL VIEW explode(Records) explodedCloudTrailsTable AS rec
WITH (
  auto_refresh = true,
  refresh_interval = '15 Minute',
  checkpoint_location = '{s3_checkpoint_location}',
  watermark_delay = '1 Minute',
  extra_options = '{ "{table_name}": { "maxFilesPerTrigger": "10" }}'
  )
