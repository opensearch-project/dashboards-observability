---
name: 🎆 Integration suggestion
about: Suggest an integration 
title: '[Integration]'
labels: 'integration, untriaged'
assignees: ''
---

**What is the integration resource ?**

Describe the integration resource you are interested in and attach a link to the integration resource [ [`Nginx`](https://www.nginx.com/) for example  ...]_

**What is the integration source protocol ?**

Describe the integration resource log protocol you are interesting in [ [`access.log`](https://nginx.org/en/docs/http/ngx_http_log_module.html?&_ga=2.217812566.1563503332.1689381945-1241118970.1689381945#log_format) for example  ] 

**What is the integration target protocol ?**

Describe the target protocol you are interested to ingest [ for example [`logs.mapping`](https://github.com/opensearch-project/opensearch-catalog/blob/main/schema/observability/logs/logs.mapping) , [`http.mapping`](https://github.com/opensearch-project/opensearch-catalog/blob/main/schema/observability/logs/http.mapping) ]

**Which agents would you use to ship this data ?**

Describe the agents you may be using to ship this telemetry data [ OTEL receiver / Fluent-bit / Telegraf / collectd ] 

**Would you be using an ingestion pipeline ?**

Describe whether you may be using an ingestion pipeline to collect and enrich the data on-route [ OTEL Collector / Data-Prepper / ADOT collector ]

**Which Dashboards would you be using ?**

Describe the dashboard you would like to see on-top of the ingested telemetry signals ?[Try adding screenshots & descriptions]


----

**Do you have any additional context?**

Add any other context or screenshots about the feature request here.