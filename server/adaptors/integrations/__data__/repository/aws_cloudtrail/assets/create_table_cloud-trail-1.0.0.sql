CREATE EXTERNAL TABLE IF NOT EXISTS aws_cloudtrail_attempt4 (
  Records ARRAY<STRUCT<
    eventVersion STRING,
    userIdentity STRUCT<
      type:STRING,
      principalId:STRING,
      arn:STRING,
      accountId:STRING,
      invokedBy:STRING,
      accessKeyId:STRING,
      userName:STRING,
      sessionContext:STRUCT<
        attributes:STRUCT<
          mfaAuthenticated:STRING,
          creationDate:STRING
        >,
        sessionIssuer:STRUCT<
          type:STRING,
          principalId:STRING,
          arn:STRING,
          accountId:STRING,
          userName:STRING
        >,
        ec2RoleDelivery:STRING,
        webIdFederationData:MAP<STRING,STRING>
      >
    >,
    eventTime STRING,
    eventSource STRING,
    eventName STRING,
    awsRegion STRING,
    sourceIPAddress STRING,
    userAgent STRING,
    errorCode STRING,
    errorMessage STRING,
    requestParameters STRING,
    responseElements STRING,
    additionalEventData STRING,
    requestId STRING,
    eventId STRING,
    resources ARRAY<STRUCT<
      arn:STRING,
      accountId:STRING,
      type:STRING
    >>,
    eventType STRING,
    apiVersion STRING,
    readOnly STRING,
    recipientAccountId STRING,
    serviceEventDetails STRING,
    sharedEventId STRING,
    vpcEndpointId STRING,
    eventCategory STRING,
    tlsDetails STRUCT<
      tlsVersion:STRING,
      cipherSuite:STRING,
      clientProvidedHostHeader:STRING
    >
  >>
)
USING json
LOCATION 's3://cloudtrail-awslogs-458776276247-xkylkxpn-isengard-do-not-delete/AWSLogs/458776276247/CloudTrail/us-west-2/2024/04/15/'
OPTIONS (
  compression='gzip',
  recursivefilelookup='true'
);
