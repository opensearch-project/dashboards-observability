# Ingestion Pipeline

To set up an ingestion pipeline, I used Docker to run Fluent-bit and an Apache fake log generator, along with an instance of OpenSearch.

## FluentBit and OpenSearch Setup

First, create a `docker-compose.yml` instance like [this](https://github.com/opensearch-project/data-prepper/blob/93d06db5cad280e2e4c53e12dfb47c7cbaa7b364/examples/log-ingestion/docker-compose.yaml). This will pull FluentBit and OpenSearch Docker images and run them in `opensearch-net` Docker network.

Next, use an Apache log generator to generate sample logs. I used `mingrammer/flog` in my `docker-compose.yml` file:

```
  apache:
    image: mingrammer/flog
    command: "--loop -d 5s -f apache_combined"
    container_name: apache
    networks:
      - opensearch-net # All of the containers will join the same Docker bridge network
    links:
      - fluentbit
    logging:
      driver: "fluentd"
      options:
        fluentd-address: 127.0.0.1:24224
        tag: apache.access
        fluentd-async: "true"
```

Then, create a `fluent-bit.conf` as follows:

```
[SERVICE]
    Parsers_File parsers.conf

[INPUT]
    Name forward
    Port 24224

[FILTER]
    Name parser
    Match apache.access
    Key_Name log
    Parser apache

[FILTER]
    Name    lua
    Match   apache.access
    Script  otel-converter.lua
    call    convert_to_otel

[OUTPUT]
    Name  opensearch
    Match apache.access
    Host  opensearch
    Port  9200
    Index ss4o_logs-apache-prod-sample
    Suppress_Type_Name On
```

This creates a Fluent-Bit pipeline that forwards your generated apache logs through a parser to OpenSearch.

Create a `parsers.conf` file as follows:

```
[PARSER]
    Name   apache
    Format regex
    Regex  ^(?<host>[^ ]*) [^ ]* (?<user>[^ ]*) \[(?<time>[^\]]*)\] "(?<method>\S+)(?: +(?<path>[^\"]*?)(?: +\S*)?)?" (?<code>[^ ]*) (?<size>[^ ]*)(?: "(?<referer>[^\"]*)" "(?<agent>[^\"]*)")?$
    Time_Key time
    Time_Format %d/%b/%Y:%H:%M:%S %z
```

You can also use a [GeoIP2 Filter](https://docs.fluentbit.io/manual/pipeline/filters/geoip2-filter) to enrich the data with geolocation data.

Finally, I used a `otel-converter.lua` script to convert the parsed data into schema-compliant data:

```lua
local hexCharset = "0123456789abcdef"
local function randHex(length)
    if length > 0 then
        local index = math.random(1, #hexCharset)
        return randHex(length - 1) .. hexCharset:sub(index, index)
    else
        return ""
    end
end

local function format_apache(c)
    return string.format(
        "%s - %s [%s] \"%s %s HTTP/1.1\" %s %s",
        c.host,
        c.user,
        os.date("%d/%b/%Y:%H:%M:%S %z"),
        c.method,
        c.path,
        c.code,
        c.size,
        c.referer,
        c.agent
    )
end

function convert_to_otel(tag, timestamp, record)
    if tag=="apache.access" then
        record.remote=record.host
    end

    local data = {
        traceId=randHex(32),
        spanId=randHex(16),
        ["@timestamp"]=(record.timestamp or os.date("!%Y-%m-%dT%H:%M:%S.000Z")),
        observedTimestamp=os.date("!%Y-%m-%dT%H:%M:%S.000Z"),
        body=format_apache(record),
        attributes={
            data_stream={
                dataset=tag,
                namespace="production",
                type="logs"
            }
        },
        event={
            category="web",
            name="access",
            domain=tag,
            kind="event",
            result="success",
            type="access"
        },
        http={
            request={
                method=record.method
            },
            response={
                bytes=tonumber(record.size),
                status_code=tonumber(record.code)
            },
            flavor="1.1",
            url=record.path,
            user_agent=record.agent
        },
        communication={
            source={
                address="127.0.0.1",
                ip=record.remote,
                geo={
                    country_iso_code=record.country_iso_code
                    -- location={
                    --     lat=record.latitude,
                    --     lon=record.longitude
                    -- }
                }
            }
        }
    }
    return 1, timestamp, data
end
```
