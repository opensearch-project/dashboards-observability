# Getting Started with Nginx Ingestion using Fluent Bit

This tutorial covers two different setups processes for getting started with Nginx ingestion: a live example using Docker and a self-managed setup with code snippets.

## Live Example using Docker

### Step 1: Create Docker Network
Before running any Docker Compose files, create the Docker network.
```sh
docker network create opensearch-net
```

**Description**:
Create a Docker network named opensearch-net for the OpenSearch and fluent-bit containers to communicate.
Use this specific command if your existing `opensearch` & `opensearch-dashboards` are already running within a docker-compose container.

If `opensearch` & `opensearch-dashboards` are running outside of a container scope - for example in your `localhost`, change the original docker network definition Into the following:
```yaml
  network_mode: host
```

### Step 2: Setup Docker `.env` File
Download and set up the environment variables.
```sh
wget https://raw.githubusercontent.com/opensearch-project/opensearch-catalog/main/integrations/observability/nginx/getting-started/.env
```

**Description**:
The .env file contains environment variables required for Docker Compose to configure the OpenSearch and Fluent-Bit containers.

Update the following parameters:

```yaml
# OpenSearch Node1
OPENSEARCH_PORT=9200
OPENSEARCH_HOST=opensearch
OPENSEARCH_ADDR=${OPENSEARCH_HOST}:${OPENSEARCH_PORT}

# OpenSearch Dashboard
OPENSEARCH_DASHBOARD_PORT=5601
OPENSEARCH_DASHBOARD_HOST=opensearch-dashboards
OPENSEARCH_DASHBOARD_ADDR=${OPENSEARCH_DASHBOARD_HOST}:${OPENSEARCH_DASHBOARD_PORT}
```

If running `opensearch` & `opensearch-dashboards` are running outside of a container scope - also update the host names `OPENSEARCH_HOST`, `OPENSEARCH_DASHBOARD_HOST` appearing in the .env file to be able to recognize your local running services.

### Step 3: Setup Fluent Bit Folder
Download the Fluent Bit configuration files.
```sh
wget https://raw.githubusercontent.com/opensearch-project/opensearch-catalog/main/integrations/observability/nginx/getting-started/fluent-bit/fluent-bit.conf \
     https://raw.githubusercontent.com/opensearch-project/opensearch-catalog/main/integrations/observability/nginx/getting-started/fluent-bit/otel-converter.lua \
     https://raw.githubusercontent.com/opensearch-project/opensearch-catalog/main/integrations/observability/nginx/getting-started/fluent-bit/parsers.conf
```

**Description**:
Get the local fluent-bit relevant config files.
- Update the `Host` field to match the `opensearch` location - in case its not a part of a docker-compose service, or host name as defined by the docker-compose running your server
- Update the `Index` field to match the index naming specification as defined by the [simple schema for observability](https://github.com/opensearch-project/opensearch-catalog/blob/main/docs/schema/observability/Naming-convention.md).

```yaml

[OUTPUT]
  Name  opensearch
  Match nginx.access
  Host  opensearch-node1
  Port  9200
  Index ss4o_logs-nginx-prod
  Suppress_Type_Name On
  tls             On
  tls.verify      Off
  HTTP_User       admin
  HTTP_Passwd     my_%New%_passW0rd!@#

[OUTPUT]
  Name  opensearch
  Match apache.access
  Host  opensearch-node1
  Port  9200
  Index ss4o_logs-apache-prod
  Suppress_Type_Name On
  tls             On
  tls.verify      Off
  HTTP_User       admin
  HTTP_Passwd     my_%New%_passW0rd!@#

```


### Step 4: Run Docker Compose
Download and run the Docker Compose file for the Nginx live example.

```sh
wget -O nginx-node.yml https://raw.githubusercontent.com/opensearch-project/opensearch-catalog/main/integrations/observability/nginx/getting-started/nginx-node.yml

docker-compose -f nginx-node.yml up -d
```
**Description**:
Run the nginx-node docker compose after updating the `networks` definition to accommodate your existing `opensearch` service.
```yaml
networks:
  opensearch-net:
    external: true
```

## Self-Managed Setup

The next part describe the details for manually updating the `fluent-bit` agent for running along-side the `nginx` service and transforming its logs
into `simple schema for observability ` compliant json to be ingested into opensearch.
> All the files are present in the `getting-started` folder of this integration.

### Step 1: Fluent Bit Parser
Set up the Fluent Bit parser configuration to parse Nginx access log fields.

**parsers.conf**
```ini
[PARSER]
    Name   apache
    Format regex
    Regex  ^(?<host>[^ ]*) [^ ]* (?<user>[^ ]*) \[(?<time>[^\]]*)\] "(?<method>\S+)(?: +(?<path>[^"]*?)(?: +\S*)?)?" (?<code>[^ ]*) (?<size>[^ ]*)(?: "(?<referer>[^"]*)" "(?<agent>[^"]*)")?$
    Time_Key time
    Time_Format %d/%b/%Y:%H:%M:%S %z

[PARSER]
    Name   nginx
    Format regex
    Regex ^(?<remote>[^ ]*) (?<host>[^ ]*) (?<user>[^ ]*) \[(?<time>[^\]]*)\] "(?<method>\S+)(?: +(?<path>[^"]*?)(?: +\S*)?)?" (?<code>[^ ]*) (?<size>[^ ]*)(?: "(?<referer>[^"]*)" "(?<agent>[^"]*)")
    Time_Key time
    Time_Format %d/%b/%Y:%H:%M:%S %z
```

### Step 2: Fluent Bit Log Converter
Set up the Fluent Bit logs converter Lua script to convert Nginx access logs into Simple schema format.

**otel-converter.lua**
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
        c.size
    )
end

local function format_nginx(c)
    return string.format(
        "%s %s %s [%s] \"%s %s HTTP/1.1\" %s %s \"%s\" \"%s\"",
        c.remote,
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

local formats = {
    ["apache.access"] = format_apache,
    ["nginx.access"] = format_nginx
}

function convert_to_otel(tag, timestamp, record)
    local data = {
        traceId=randHex(32),
        spanId=randHex(16),
        ["@timestamp"]=os.date("!%Y-%m-%dT%H:%M:%S.000Z"),
        observedTimestamp=os.date("!%Y-%m-%dT%H:%M:%S.000Z"),
        body=formats[tag](record),
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
            url=record.path
        },
        communication={
            source={
                address="127.0.0.1",
                ip=record.remote
            }
        }
    }
    return 1, timestamp, data
end
```

### Step 3: Fluent Bit Setup
Set up the Fluent Bit configuration file to include log parsing and OpenSearch access.

**fluent-bit.conf**
```ini
[SERVICE]
    Parsers_File parsers.conf

[INPUT]
    Name forward
    Port 24224

[FILTER]
    Name parser
    Match nginx.access
    Key_Name log
    Parser nginx

[FILTER]
    Name parser
    Match apache.access
    Key_Name log
    Parser apache

[Filter]
    Name    lua
    Match   *
    Script  otel-converter.lua
    call    convert_to_otel

[OUTPUT]
    Name  opensearch
    Match nginx.access
    Host  ${opensearch-node1}
    Port  9200
    Index ${ss4o_logs-nginx-prod}
    Suppress_Type_Name On
    tls             On
    tls.verify      Off
    HTTP_User       admin
    HTTP_Passwd     my_%New%_passW0rd!@#

[OUTPUT]
    Name  opensearch
    Match apache.access
    Host  ${opensearch-node1}
    Port  9200
    Index ${ss4o_logs-nginx-prod}
    Suppress_Type_Name On
    tls             On
    tls.verify      Off
    HTTP_User       admin
    HTTP_Passwd     my_%New%_passW0rd!@#

[OUTPUT]
    Name stdout
    Match nginx.access
```

**Description**:
Get the local fluent-bit relevant config files.
- Update the `Host` field to match the `opensearch` location - in case its not a part of a docker-compose service, or host name as defined by the docker-compose running your server
- Update the `Index` field to match the index naming specification as defined by the [simple schema for observability](https://github.com/opensearch-project/opensearch-catalog/blob/main/docs/schema/observability/Naming-convention.md).

