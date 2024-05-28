CREATE MATERIALIZED VIEW {table_name}__mview AS
SELECT
   userIdentity.type AS `aws.cloudtrail.userIdentity.type`,
   userIdentity.principalId AS `aws.cloudtrail.userIdentity.principalId`,
   userIdentity.arn AS `aws.cloudtrail.userIdentity.arn`,
   userIdentity.accountId AS `aws.cloudtrail.userIdentity.accountId`,
   userIdentity.invokedBy AS `aws.cloudtrail.userIdentity.invokedBy`,
   userIdentity.accessKeyId AS `aws.cloudtrail.userIdentity.accessKeyId`,
   userIdentity.userName AS `aws.cloudtrail.userIdentity.userName`,
   userIdentity.sessionContext.attributes.mfaAuthenticated AS `aws.cloudtrail.userIdentity.sessionContext.attributes.mfaAuthenticated`,
  CAST( userIdentity.sessionContext.attributes.creationDate  AS TIMESTAMP) AS `aws.cloudtrail.userIdentity.sessionContext.attributes.creationDate`,
   userIdentity.sessionContext.sessionIssuer.type AS `aws.cloudtrail.userIdentity.sessionContext.sessionIssuer.type`,
   userIdentity.sessionContext.sessionIssuer.principalId AS `aws.cloudtrail.userIdentity.sessionContext.sessionIssuer.principalId`,
   userIdentity.sessionContext.sessionIssuer.arn AS `aws.cloudtrail.userIdentity.sessionContext.sessionIssuer.arn`,
   userIdentity.sessionContext.sessionIssuer.accountId AS `aws.cloudtrail.userIdentity.sessionContext.sessionIssuer.accountId`,
   userIdentity.sessionContext.sessionIssuer.userName AS `aws.cloudtrail.userIdentity.sessionContext.sessionIssuer.userName`,
   userIdentity.sessionContext.ec2RoleDelivery AS `aws.cloudtrail.userIdentity.sessionContext.ec2RoleDelivery`,

   eventVersion AS `aws.cloudtrail.eventVersion`,
  CAST( eventTime AS TIMESTAMP)  AS `@timestamp`,
   eventSource AS `aws.cloudtrail.eventSource`,
   eventName AS `aws.cloudtrail.eventName`,
   eventCategory AS `aws.cloudtrail.eventCategory`,
   eventType AS `aws.cloudtrail.eventType`,
   eventId AS `aws.cloudtrail.eventId`,

   awsRegion AS `aws.cloudtrail.awsRegion`,
   sourceIPAddress AS `aws.cloudtrail.sourceIPAddress`,
   userAgent AS `aws.cloudtrail.userAgent`,
   errorCode AS `errorCode`,
   errorMessage AS `errorMessage`,
   requestParameters AS `aws.cloudtrail.requestParameter`,
   responseElements AS `aws.cloudtrail.responseElements`,
   additionalEventData AS `aws.cloudtrail.additionalEventData`,
   requestId AS `aws.cloudtrail.requestId`,
   resources AS `aws.cloudtrail.resources`,
   apiVersion AS `aws.cloudtrail.apiVersion`,
   readOnly AS `aws.cloudtrail.readOnly`,
   recipientAccountId AS `aws.cloudtrail.recipientAccountId`,
   serviceEventDetails AS `aws.cloudtrail.serviceEventDetails`,
   sharedEventId AS `aws.cloudtrail.sharedEventId`,
   vpcEndpointId AS `aws.cloudtrail.vpcEndpointId`,
   tlsDetails.tlsVersion AS `aws.cloudtrail.tlsDetails.tls_version`,
   tlsDetails.cipherSuite AS `aws.cloudtrail.tlsDetailscipher_suite`,
   tlsDetails.clientProvidedHostHeader AS `aws.cloudtrail.tlsDetailsclient_provided_host_header`
FROM
  {table_name}
WITH (
    auto_refresh = true,
    refresh_interval = '15 Minute',
    checkpoint_location = '{s3_checkpoint_location}',
    watermark_delay = '1 Minute',
    extra_options = '{ "{table_name}": { "maxFilesPerTrigger": "10" }}'
)
