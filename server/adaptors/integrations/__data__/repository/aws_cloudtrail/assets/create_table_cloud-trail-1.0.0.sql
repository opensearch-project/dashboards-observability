CREATE EXTERNAL TABLE IF NOT EXISTS  {table_name} (
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
)
USING json
OPTIONS (
   PATH '{s3_bucket_location}',
   recursivefilelookup='true',
   multiline 'true'
)
