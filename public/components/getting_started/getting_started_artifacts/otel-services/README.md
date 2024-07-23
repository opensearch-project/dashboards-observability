# OpenTelemetry Services Flow use case dashboard

>  Based on Otel-Collector & Data - prepper signals exporter
>  See [OTEL Demo repository](https://github.com/opensearch-project/opentelemetry-demo) for additional context

## What is OpenTelemetry Specifications ?

OpenTelemetry is an [Observability](https://opentelemetry.io/docs/concepts/observability-primer/#what-is-observability) framework and toolkit designed to create and manage telemetry data such as [traces](https://opentelemetry.io/docs/concepts/signals/traces/), [metrics](https://opentelemetry.io/docs/concepts/signals/metrics/), and [logs](https://opentelemetry.io/docs/concepts/signals/logs/).

OpenTelemetry is vendor- and tool-agnostic, meaning that it can be used with a broad variety of Observability backends, including open source tools like [Jaeger](https://www.jaegertracing.io/) and [Prometheus](https://prometheus.io/), as well as commercial offerings.

OpenTelemetry is focused on the generation, collection, management, and export of telemetry. A major goal of OpenTelemetry is that you can easily instrument your applications or systems, no matter their language, infrastructure, or runtime environment. Crucially, the storage and visualization of telemetry is intentionally left to other tools.

## What is OTEL collector & Data prepper's signals Exporter ?
The OTEL collector is a pipeline designed to aggregate and correlate multiple signals into a cohesive and coherently stream that gives a useful and detailed signals of the system being monitored.
The collector allows to optimize and reduce data redundancies and simplify the monitoring and investigation process be leveraging sampling techniques and correlation of multiple data points.

## Dashboards
The following dashboards are part of the first OpenTelemetry services investigation use case offered by open search observability plugin.

### Ingestion Rate View
![](https://github.com/opensearch-project/opentelemetry-demo/blob/main/tutorial/img/otel-ingestion-rate-dashboard.png?raw=true)

Open Telemetry ingestion rate for signals: Traces , Metrics, Logs

### General Services View
![](https://github.com/opensearch-project/opentelemetry-demo/blob/main/tutorial/img/services-general-dashboard.png?raw=true)

All the services views including their RED metrics details: Requests, Errors, Durations

### Specific Service Projection detailed View
![](https://github.com/opensearch-project/opentelemetry-demo/blob/main/tutorial/img/specific-service-dashboard.png?raw=true)

A specific service details including its metrics related indications
### Network Metrics Monitor View
![](https://github.com/opensearch-project/opentelemetry-demo/blob/main/tutorial/img/amp-services-network-metrics-details.png)

The collections of network related metrics for service/s
### System Metrics Monitor View
![](https://github.com/opensearch-project/opentelemetry-demo/blob/main/tutorial/img/amp-services-system-metrics-details.png?raw=true)

The collections of system related metrics for service/s
---
## Loading Dashboard via DashboardManagement

To update an integration template navigate to the DashboardManagement and select [savedObjects](https://localhost:5601/_dashboards/app/management/opensearch-dashboards/objects) and import the new artifact:

1) Download the `otel_services_dashboard-1.0.0.ndjson` artifact from the [catalog release page](https://github.com/opensearch-project/opensearch-catalog/releases/edit/otel_services_dashboard-1.0.0)


2) Go to the [DashboardManagement -> savedObjects ](https://localhost:5601/_dashboards/app/management/opensearch-dashboards/objects)

![](https://github.com/opensearch-project/opensearch-catalog/assets/48943349/d96e9a78-e3de-4cce-ba66-23f7c084778d)

![](https://github.com/opensearch-project/opensearch-catalog/assets/48943349/a63ae102-706a-4980-b758-fff7f6b24a94)

3) Once there - select import to load the recently downloaded integration artifact (`otel_services_dashboard-1.0.0.ndjson` suffix)
   Dont forget to use the override the Dashboard's Id: `Check for existing objects: Automatically overwrite conflicts`

4) Open the Otel [Dashboard](https://localhost:5601/app/dashboards#/view/otel-services-dashboard-1_0_0_ID) and start exploring
