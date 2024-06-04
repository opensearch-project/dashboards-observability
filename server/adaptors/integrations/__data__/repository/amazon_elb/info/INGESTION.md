# Sample Ingestion Pipeline

This is a brief overview of a sample ingestion pipeline for the AWS ELB integration.

## List of Components

- An OpenSearch domain running through Docker
- A FluentBit agent running through Docker
- An ELB instance generating logs (not covered in this sample)

### OpenSearch and FluentBit Setup

1. Look at [docker-compose.yaml](https://github.com/opensearch-project/data-prepper/blob/d2aa114f538da2f05d887b9c1ad4b77486267776/examples/log-ingestion/docker-compose.yaml) to create FluentBit and OpenSearch Docker images and run them in the `opensearch-net` Docker network.
2. Create the FluentBit as follows:

```
[SERVICE]
    Parsers_File parsers.conf

[INPUT]
   [YOUR INPUT HERE]

[FILTER]
    Name parser
    Match aws.elb
    Key_Name log
    Parser aws-elb

[FILTER]
    Name    lua
    Match   aws.elb
    Script  otel-converter.lua
    call    convert_to_otel

[OUTPUT]
    Name  opensearch
    Match aws.elb
    Host  opensearch
    Port  9200
    Index ss4o_logs-aws_elb-prod-sample
    Suppress_Type_Name On
```

You would set INPUT as however you are ingesting your AWS ELB logs, more info [here](https://docs.fluentbit.io/manual/pipeline/inputs).

3. Create your `parsers.conf` as follows:

```
[PARSER]
    Name   aws-elb
    Format regex
    Regex  ^(?<request_type>[^ ]*) (?<timestamp>[^ ]*) (?<elb>[^ ]*) (?<client_ip>[^ ]*):(?<client_port>[0-9]*) (?<target_ip>[^ ]*)[:-](?<target_port>[0-9]*) (?<request_processing_time>[-.0-9]*) (?<target_processing_time>[-.0-9]*) (?<response_processing_time>[-.0-9]*) (?<elb_status_code>|[-0-9]*) (?<target_status_code>-|[-0-9]*) (?<received_bytes>[-0-9]*) (?<sent_bytes>[-0-9]*) \"(?<request>(-|(?<http_method>\w+)) (-|(?<http_protocol>\w*)://\[?(?<http_host>[^/]+?)\]?:(?<http_port>\d+)(-|(?<http_path>/[^?]*?))(\?(?<http_query>.*?))?) (-?|\w+/(?<http_version>[0-9\.]*)))\" \"(|(?<useragent>[^\"]+))\" (?<ssl_cipher>[()A-Z0-9-]+) (?<ssl_protocol>[A-Za-z0-9.-]*) (?<target_group_arn>[^ ]*) \"(?<trace_id>[^\"]*)\" \"(?<domain_name>[^\"]*)\" \"(?<chosen_cert_arn>[^\"]*)\" (?<matched_rule_priority>[-.0-9]*) (?<request_creation_time>[^ ]*) \"(?<actions_executed>[^\"]*)\" \"(?<redirect_url>[^\"]*)\" \"(?<lambda_error_reason>[^ ]*)\" \"(?<target_port_list>[^\s]+)\" \"(?<target_status_code_list>[^\s]+)\"( \"(?<classification>[^\s]+)\" \"(?<classification_reason>[^\s]+)\")?
    Time_Key time
    Time_Format %d/%b/%Y:%H:%M:%S %z
```

4. Create your `otel-converter.lua` as follows:

```lua
local function format_aws_elb(c)
    return string.format(
        "%s %s %s %s:%s %s:%s %s %s %s %s %s %s %s \"%s\" \"%s\" %s %s %s \"%s\" \"%s\" \"%s\" %s %s \"%s\" \"%s\" \"%s\" \"%s\" \"%s\" \"%s\" \"%s\"",
        c.request_type, c.timestamp, c.elb, c.client_ip c.client_port, c.target_ip, c.target_port, c.request_processing_time, c.target_processing_time, c.response_processing_time, c.elb_status_code, c.target_status_code, c.received_bytes, c.sent_bytes, c.request, c.useragent, c.ssl_cipher, c.ssl_protocol, c.target_group_arn, c.trace_id, c.domain_name c.chosen_cert_arn, c.matched_rule_priority, c.request_creation_time, c.actions_executed, c.redirect_url, c.lambda_error_reason, c.target_port_list, c.target_status_code_list, c.classification, c.classification_reason
    )
end

function convert_to_otel(tag, timestamp, record)
    local data = {
        traceId=record.trace_id,
        ["@timestamp"]=(record.timestamp or os.date("!%Y-%m-%dT%H:%M:%S.000Z")),
        observedTimestamp=os.date("!%Y-%m-%dT%H:%M:%S.000Z"),
        body=format_aws_elb(record),
        attributes={
            data_stream={
                dataset="aws_elb",
                namespace="production",
                type="logs"
            }
        },
        event={
            category="web",
            name="access",
            domain="aws_elb",
            kind="event",
            result="success",
            type="access"
        },
        http={
            request={
                method=record.http_method,
                bytes=tonumber(record.received_bytes)
                body={
                    content=record.request
                }
            },
            response={
                bytes=tonumber(record.sent_bytes),
                status_code=tonumber(record.elb_status_code)
            },
            schema=record.request_type
            user_agent={
                original=record.useragent
            }
        },
        communication={
            source={
                address=record.client_ip,
                ip=record.client_ip,
                port=tonumber(record.client_port)
                geo={
                    country_name=record.response.country.name,
                    country_iso_code=record.response.country.iso_code
                }
            },
            destination={
                address=record.target_ip,
                ip=record.target_ip,
                port=tonumber(record.target_port),
            }
        },
        cloud={
            provider="AWS",
            service={
                name="ELB"
            }
            -- account={
            --     id=?
            -- },
            -- region=?
        },
        aws={
            elb={
                client={
                    ip=record.client_ip,
                    port=tonumber(record.client_port)
                },
                target_ip=record.target_ip,
                target_port=tonumber(record.target_port),
                request_processing_time=tonumber(record.request_processing_time),
                target_processing_time: tonumber(record.target_processing_time),
                response_processing_time: tonumber(record.response_processing_time),
                elb_status_code: tonumber(record.elb_status_code),
                target_status_code: tonumber(record.target_status_code),
                received_bytes: tonumber(record.received_bytes),
                sent_bytes:tonumber(record.sent_bytes),
                http: {
                    port: tonumber(record.http_port),
                    version: record.http_version
                },
                ssl_cipher: record.ssl_cipher,
                ssl_protocol: record.ssl_protocol,
                matched_rule_priority: tonumber(record.matched_rule_priority),
                request_creation_time: record.request_creation_time,
            }
        },
        url={
            domain=record.http_host,
            path=record.http_path
        }
    }
    return 1, timestamp, data
end
```
