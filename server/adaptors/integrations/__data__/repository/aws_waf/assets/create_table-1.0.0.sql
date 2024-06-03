CREATE EXTERNAL TABLE {table_name} (
  `timestamp` bigint,
  `formatVersion` int,
  `webaclId` string,
  `terminatingRuleId` string,
  `terminatingRuleType` string,
  `action` string,
  `terminatingRuleMatchDetails` array <
                                    struct <
                                        conditionType: string,
                                        sensitivityLevel: string,
                                        location: string,
                                        matchedData: array < string >
                                          >
                                     >,
  `httpSourceName` string,
  `httpSourceId` string,
  `ruleGroupList` array <
                      struct <
                          ruleGroupId: string,
                          terminatingRule: struct <
                                              ruleId: string,
                                              action: string,
                                              ruleMatchDetails: array <
                                                                   struct <
                                                                       conditionType: string,
                                                                       sensitivityLevel: string,
                                                                       location: string,
                                                                       matchedData: array < string >
                                                                          >
                                                                    >
                                                >,
                          nonTerminatingMatchingRules: array <
                                                              struct <
                                                                  ruleId: string,
                                                                  action: string,
                                                                  overriddenAction: string,
                                                                  ruleMatchDetails: array <
                                                                                       struct <
                                                                                           conditionType: string,
                                                                                           sensitivityLevel: string,
                                                                                           location: string,
                                                                                           matchedData: array < string >
                                                                                              >
                                                                   >,
                                                                  challengeResponse: struct <
                                                                            responseCode: string,
                                                                            solveTimestamp: string
                                                                              >,
                                                                  captchaResponse: struct <
                                                                            responseCode: string,
                                                                            solveTimestamp: string
                                                                              >
                                                                    >
                                                             >,
                          excludedRules: string
                            >
                       >,
`rateBasedRuleList` array <
                         struct <
                             rateBasedRuleId: string,
                             limitKey: string,
                             maxRateAllowed: int
                               >
                          >,
  `nonTerminatingMatchingRules` array <
                                    struct <
                                        ruleId: string,
                                        action: string,
                                        ruleMatchDetails: array <
                                                             struct <
                                                                 conditionType: string,
                                                                 sensitivityLevel: string,
                                                                 location: string,
                                                                 matchedData: array < string >
                                                                    >
                                                             >,
                                        challengeResponse: struct <
                                                            responseCode: string,
                                                            solveTimestamp: string
                                                             >,
                                        captchaResponse: struct <
                                                            responseCode: string,
                                                            solveTimestamp: string
                                                             >
                                          >
                                     >,
  `requestHeadersInserted` array <
                                struct <
                                    name: string,
                                    value: string
                                      >
                                 >,
  `responseCodeSent` string,
  `httpRequest` struct <
                    clientIp: string,
                    country: string,
                    headers: array <
                                struct <
                                    name: string,
                                    value: string
                                      >
                                 >,
                    uri: string,
                    args: string,
                    httpVersion: string,
                    httpMethod: string,
                    requestId: string
                      >,
  `labels` array <
               struct <
                   name: string
                     >
                >,
  `captchaResponse` struct <
                        responseCode: string,
                        solveTimestamp: string,
                        failureReason: string
                          >,
  `challengeResponse` struct <
                        responseCode: string,
                        solveTimestamp: string,
                        failureReason: string
                        >,
  `ja3Fingerprint` string
)
USING json
OPTIONS (
  recursiveFileLookup='true'
)
LOCATION '{s3_bucket_location}'
