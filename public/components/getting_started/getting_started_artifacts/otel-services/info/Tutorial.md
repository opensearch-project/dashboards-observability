# Getting Started with OpenTelemetry Collector and Data Prepper for OpenSearch

This tutorial guides you through setting up OpenTelemetry Collector to export logs, traces, and metrics to Data Prepper, which then submits them into OpenSearch.
This setup is essential for monitoring and observability in distributed systems, providing deep insights into application performance and behavior.

## Purpose and Context

The goal is to create an environment where OpenTelemetry Collector captures data from a sample openTelemetry demo web-store application and forwards its telemetry info to Data Prepper.
Data Prepper processes this data and sends it to OpenSearch for storage and analysis. 

## Prerequisites

- Docker and Docker Compose installed on your machine.
- Basic knowledge of Docker and containerized applications.
- Access to the OpenSearch and OpenTelemetry repositories.

## Workflow Overview

1. **Setup OpenTelemetry Local Repository**: Clone the OpenTelemetry demo repository.
2. **Create Docker Network**: Establish a dedicated network for OpenSearch containers.
3. **Update Docker Environment File**: Configure environment variables for Docker Compose.
4. **Configure Data Prepper Pipelines**: Set up pipelines for logs, traces, metrics, and services.
5. **Configure OpenTelemetry Collector**: Integrate Data Prepper pipelines with the OpenTelemetry Collector.
6. **Run Docker Compose**: Start the Docker containers and validate the setup.

## Steps

### 1. Setup OpenTelemetry Local Repository

Clone the OpenTelemetry demo repository to your local machine.

**Command:**
```sh
git clone https://github.com/opensearch-project/opentelemetry-demo.git
```

**Description:**
This step sets up the OpenTelemetry demo repository locally, which contains all the necessary configuration files and resources.

### 2. Create Docker Network

Create a Docker network named `opensearch-net` for the OpenSearch and Data Prepper containers to communicate.
Use this specific command if your existing `opensearch` & `opensearch-dashboards` are already running within a docker-compose container.

**Command:**
```sh
docker network create opensearch-net
```

**Description:**
This network ensures that all containers can communicate with each other within the same network.
If `opensearch` & `opensearch-dashboards` are running outside of a container scope - for example in your localhost, change the original docker network definition 
```yaml
networks:
    opensearch-otel-demo:
```
Into the following  
```yaml
  network_mode: host
```

### 3. Update Docker Environment File

Download and update the Docker environment file with the necessary parameters.

**Command:**
```sh
wget https://raw.githubusercontent.com/opensearch-project/opentelemetry-demo/main/.env
```

**Description:**
The `.env` file contains environment variables required for Docker Compose to configure the OpenSearch and Data Prepper containers.

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
If running `opensearch` & `opensearch-dashboards` are running outside of a container scope -  also update the host names `OPENSEARCH_HOST`, `OPENSEARCH_DASHBOARD_HOST` appearing 
in the `.env` file to be able to recognize your local running services.


### 4. Configure Data Prepper Pipelines

Configure the Data Prepper pipelines for logs, traces, metrics, and services.

#### Logs Exporter
Update the pipelines.yaml:

**Command:**

```yaml
otel-logs-pipeline:
  workers: 5
  delay: 10
  source:
    otel_logs_source:
      ssl: false
  buffer:
    bounded_blocking:
  sink:
    - opensearch:
        hosts: ["https://opensearch-node1:9200"]
        username: "admin"
        password: "my_%New%_passW0rd!@#"
        insecure: true
        index_type: custom
        index: otel-events-%{yyyy.MM.dd}
        bulk_size: 4
```

#### Traces Exporter
Update the pipelines.yaml:

**Command:**
```yaml
entry-pipeline:
  delay: "100"
  source:
    otel_trace_source:
      ssl: false
  sink:
    - pipeline:
        name: "raw-pipeline"
    - pipeline:
        name: "service-map-pipeline"
raw-pipeline:
  source:
    pipeline:
      name: "entry-pipeline"
  processor:
    - otel_trace_raw:
  sink:
    - opensearch:
        hosts: ["https://opensearch-node1:9200"]
        insecure: true
        username: "admin"
        password: "my_%New%_passW0rd!@#"
        index_type: trace-analytics-raw
```

#### Metrics Exporter
Update the pipelines.yaml

**Command:**
```yaml
otel-metrics-pipeline:
  workers: 8
  delay: 3000
  source:
    otel_metrics_source:
      health_check_service: true
      ssl: false
  buffer:
    bounded_blocking:
      buffer_size: 1024
      batch_size: 1024
  processor:
    - otel_metrics:
        calculate_histogram_buckets: true
        calculate_exponential_histogram_buckets: true
        exponential_histogram_max_allowed_scale: 10
        flatten_attributes: false
  sink:
    - opensearch:
        hosts: ["https://opensearch-node1:9200"]
        username: "admin"
        password: "my_%New%_passW0rd!@#"
        insecure: true
        index_type: custom
        index: ss4o_metrics-otel-%{yyyy.MM.dd}
        bulk_size: 4
        template_type: index-template
```

#### Services Exporter
Update the pipelines.yaml

**Command:**
```yaml
service-map-pipeline:
  delay: "100"
  source:
    pipeline:
      name: "entry-pipeline"
  processor:
    - service_map_stateful:
  sink:
    - opensearch:
        hosts: ["https://opensearch-node1:9200"]
        insecure: true
        username: "admin"
        password: "my_%New%_passW0rd!@#"
        index_type: trace-analytics-service-map
```

### 5. Configure OpenTelemetry Collector

Integrate Data Prepper pipelines within the OpenTelemetry Collector configuration.

#### Logs Services
Update the otelcol-config.yml:

**Command:**
```yaml
receivers:
  otlp:
    protocols:
      grpc:
      http:

exporters:
  otlp/logs:
    endpoint: "data-prepper:21892"
    tls:
      insecure: true
      insecure_skip_verify: true 

service:
  pipelines:
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/logs, debug]
```

#### Traces Services

**Command:**
Update the otelcol-config.yml:

```yaml
  otlp/traces:
    endpoint: "data-prepper:21890"
    tls:
      insecure: true
      insecure_skip_verify: true 

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp, debug, spanmetrics, otlp/traces]
```

#### Metrics Services
Update the otelcol-config.yml:

**Command:**
```yaml
  otlp/metrics:
    endpoint: "data-prepper:21891"
    tls:
      insecure: true
      insecure_skip_verify: true 

service:
  pipelines:
    metrics:
      receivers: [otlp, spanmetrics]
      processors: [filter/ottl, transform, batch]
      exporters: [otlphttp/prometheus, otlp/metrics, debug]
```

### 6. Run Docker Compose

Start the Docker containers and validate the setup.

**Command:**
```sh
docker-compose up -d --scale opensearch-node1=0 --scale opensearch-node2=0 --scale opensearch-dashboards=0
```

**Description:**

This command starts the Docker containers for the OpenTelemetry Collector and Data Prepper, creating a live environment for data collection and analysis.
The `--scale opensearch-node1=0 --scale opensearch-node2=0 --scale opensearch-dashboards=0` command removes the opensearch & dashboard from being started in case they are already running.

---

## Additional Info
 - [Getting Started Info Document](https://github.com/opensearch-project/opensearch-catalog/blob/main/integrations/observability/otel-services/info/GettingStarted.md)
 - [OpenTelemetry Demo repository](https://github.com/opensearch-project/opentelemetry-demo)
 - [OTEL services Dashboard Installation Release](https://github.com/opensearch-project/opensearch-catalog/releases/tag/otel_services_dashboard-1.0.0)
 - [OTEL Demo Architecture](https://github.com/opensearch-project/opensearch-catalog/blob/main/integrations/observability/otel-services/info/OTEL%20Demo%20Architecture.md)