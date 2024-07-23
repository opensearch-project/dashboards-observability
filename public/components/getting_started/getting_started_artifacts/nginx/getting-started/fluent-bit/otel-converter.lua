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
