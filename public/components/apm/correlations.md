# APM Correlations: Service-to-Service Span Correlation Research

This document describes how to correlate spans between services in OpenTelemetry-instrumented applications. Different instrumentation libraries use different attribute conventions, requiring a multi-field approach.

## Overview

When Service A calls Service B:
- Service A produces a **CLIENT span** with attributes identifying Service B
- Service B produces a **SERVER span** with its own operation name

The challenge: **Different services use different OTel attributes to identify remote services.**

## Research Findings: Remote Service Identification by Service Type

### Summary Table

| Service | Dependency | Remote Service Field | Value | Operation Field | Operation Example |
|---------|-----------|---------------------|-------|-----------------|-------------------|
| **frontend** (Node.js) | cart | `net.peer.name` | "cart" | `name` | "grpc.oteldemo.CartService/GetCart" |
| **frontend** | product-catalog | `net.peer.name` | "product-catalog" | `rpc.method` | "GetProduct" |
| **frontend** | checkout | `net.peer.name` | "checkout" | `name` | "grpc.oteldemo.CheckoutService/PlaceOrder" |
| **frontend-proxy** (Envoy) | frontend | `upstream_cluster` | "frontend" | `name` | "router frontend egress" |
| **checkout** (Go) | shipping | `server.address` | "shipping" | `name` | "HTTP POST" |
| **checkout** | payment | `server.address` | IP (172.19.0.x) | `rpc.service` | "oteldemo.PaymentService" |
| **cart** (.NET) | valkey-cart | `server.address` | "valkey-cart" | `name` | "HGET", "HMSET" |
| **cart** | valkey-cart | `db.system` | "redis" | `db.statement` | "HGET bd43657c..." |
| **product-reviews** (Python) | postgresql | `net.peer.name` | "postgresql" | `name` | "SELECT" |
| **product-reviews** | postgresql | `db.system` | "postgresql" | `db.statement` | "SELECT username..." |
| **product-reviews** | llm | `server.address` | "llm" | `name` | "chat astronomy-llm" |
| **load-generator** (Python) | frontend-proxy | `http.url` (parse) | "frontend-proxy:8080" | `name` | "GET", "POST" |
| **shipping** | quote | `server.address` | "quote" | `name` | HTTP method |
| **recommendation** | product-catalog | `rpc.service` | "oteldemo.ProductCatalogService" | `rpc.method` | "ListProducts" |
| **ad** | flagd | `server.address` | "flagd" | `rpc.service` | "flagd.evaluation.v1.Service" |

### Key Observations

1. **No single field works for all services** - Different instrumentation libraries use different conventions:
   - **Node.js** (frontend): `net.peer.name` + `rpc.service`
   - **C++ Envoy** (frontend-proxy): `upstream_cluster`
   - **Go/Java**: `server.address` + `rpc.service`
   - **Python HTTP**: `http.url` (requires parsing hostname)
   - **.NET**: `server.address` + `db.system`

2. **Database dependencies** use `db.system` (redis, postgresql) and optionally `db.name`

3. **LLM dependencies** use `gen_ai.system` (openai) and `server.address`

4. **IP addresses appear in `server.address`** for some services (checkout calling payment), making hostname correlation unreliable for those cases

## Recommended Coalesce Order for Remote Service

When querying spans to find calls to a specific remote service, use PPL `coalesce()` to check fields in priority order:

```typescript
const remoteServiceFields = [
  'attributes.net.peer.name',              // Standard OTel (frontend uses)
  'attributes.server.address',             // Newer OTel (checkout, cart use)
  'attributes.upstream_cluster',           // Envoy/Istio (frontend-proxy uses)
  'attributes.upstream_cluster_name',      // Envoy alternative
  'attributes.rpc.service',                // gRPC services
  'attributes.peer.service',               // Older OTel
  'attributes.db.system',                  // Database type (redis, postgresql)
  'attributes.db.name',                    // Database name
  'attributes.gen_ai.system',              // LLM systems (openai)
  'attributes.http.host',                  // HTTP host header
  'attributes.messaging.destination.name', // Message queues (Kafka, RabbitMQ)
  'attributes.messaging.destination',      // Message queues (older)
];
```

### PPL Query Example

```ppl
source=otel-v1-apm-span-*
| where serviceName = 'frontend'
| where kind = 'SPAN_KIND_CLIENT'
| eval _remoteService = coalesce(
    `attributes.net.peer.name`,
    `attributes.server.address`,
    `attributes.upstream_cluster`,
    `attributes.upstream_cluster_name`,
    `attributes.rpc.service`,
    `attributes.peer.service`,
    `attributes.db.system`,
    `attributes.db.name`,
    `attributes.gen_ai.system`,
    `attributes.http.host`,
    `attributes.messaging.destination.name`,
    `attributes.messaging.destination`,
    ''
  )
| where _remoteService = 'cart'
| sort - startTime
| head 50
```

## Service Map vs Span Operation Name Mismatch

### Problem

The service map index stores operation names differently than spans:

- **Service Map**: `operation.remoteOperationName = "POST /oteldemo.CartService/GetCart"`
- **Span**: `name = "grpc.oteldemo.CartService/GetCart"`

The prefixes don't match!

### Solution: Normalize and Use LIKE Pattern

```typescript
function normalizeOperation(op: string): string {
  return op
    .replace(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+/i, '')  // Strip HTTP method
    .replace(/^grpc\./i, '')                                        // Strip grpc. prefix
    .replace(/^\//, '');                                            // Strip leading slash
}

// Example:
// "POST /oteldemo.CartService/GetCart" → "oteldemo.CartService/GetCart"
// "grpc.oteldemo.CartService/GetCart" → "oteldemo.CartService/GetCart"

// PPL Query:
// | where lower(name) LIKE '%oteldemo.cartservice/getcart%'
```

### Complete Remote Operation Filtering

When filtering by remote operation from the dependencies table:

```typescript
if (remoteOperationFilter) {
  let opFilter = remoteOperationFilter;
  let httpMethod: string | null = null;

  // Extract HTTP method prefix if present (from service map format)
  const httpMethodPrefixRegex = /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+/i;
  const methodMatch = opFilter.match(httpMethodPrefixRegex);
  if (methodMatch) {
    httpMethod = methodMatch[1].toUpperCase();
    opFilter = opFilter.replace(httpMethodPrefixRegex, '');
  }

  // Strip leading slash and grpc. prefix
  opFilter = opFilter.replace(/^\//, '').replace(/^grpc\./i, '');

  // 1. Filter by operation name (case-insensitive LIKE)
  pplQuery += ` | where lower(name) LIKE '%${opFilter.toLowerCase()}%'`;

  // 2. If HTTP method was extracted, also filter by that
  if (httpMethod) {
    pplQuery += ` | eval _httpMethod = coalesce(\`attributes.http.method\`, \`attributes.http.request.method\`, '')`;
    pplQuery += ` | where _httpMethod = '${httpMethod}' OR _httpMethod = ''`;
  }
}
```

## Log Correlation Strategy

Logs don't have operation or dependency fields. Use traceId-based correlation:

1. **Fetch spans** (with operation/dependency filters applied)
2. **Extract unique traceIds** from the spans
3. **Query logs** using `WHERE traceId IN (...)`

### Log Query with Fallback

For logs where traceId might be empty/null:

```ppl
source=${logDataset.title}
| where `serviceName` = 'frontend'
| where `timestamp` >= '2024-01-01T00:00:00Z' AND `timestamp` <= '2024-01-01T01:00:00Z'
| where (`traceId` IN ('abc123', 'def456') OR `traceId` = '' OR isnull(`traceId`))
| sort - `timestamp`
| head 10
```

**Time Buffer**: Use ±5 minutes around span time range to account for telemetry lag.

## Field Reference by Protocol

### gRPC Services

| Field | Example Value |
|-------|---------------|
| `net.peer.name` or `server.address` | "cart", "product-catalog" |
| `rpc.service` | "oteldemo.CartService" |
| `rpc.method` | "GetCart", "AddItem" |
| `name` (span name) | "grpc.oteldemo.CartService/GetCart" |

### HTTP Services

| Field | Example Value |
|-------|---------------|
| `http.url` | "http://frontend-proxy:8080/api/cart" |
| `http.host` | "frontend-proxy:8080" |
| `http.method` or `http.request.method` | "GET", "POST" |
| `name` (span name) | "GET", "POST", "HTTP POST" |

### Database Services

| Field | Example Value |
|-------|---------------|
| `db.system` | "redis", "postgresql" |
| `db.name` | "otel", "cart_db" |
| `server.address` | "valkey-cart", "postgresql" |
| `db.statement` | "SELECT username FROM users" |
| `name` (span name) | "SELECT", "HGET", "HMSET" |

### Service Mesh (Envoy/Istio)

| Field | Example Value |
|-------|---------------|
| `upstream_cluster` | "frontend" |
| `upstream_cluster_name` | "frontend" |
| `name` (span name) | "router frontend egress" |

### LLM/AI Services

| Field | Example Value |
|-------|---------------|
| `gen_ai.system` | "openai" |
| `gen_ai.request.model` | "astronomy-llm" |
| `server.address` | "llm" |
| `name` (span name) | "chat astronomy-llm" |
