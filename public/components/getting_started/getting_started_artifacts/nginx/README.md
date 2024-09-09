# Nginx Integration

>  Nginx Logs schema, see protocol details [protocol](https://docs.nginx.com/nginx/admin-guide/monitoring/logging/)

# Nginx Integration

## What is Nginx ?

NGINX is open source software for web serving, reverse proxying, caching, load balancing, media streaming, and more.

See additional details [here](https://www.nginx.com/).

## What is Nginx Integration ?

An integration is a bundle of pre-canned assets which are bundled togather in a meaningful manner.

Nginx integration includes dashboards, visualisations, queries and an index mapping.

### Dashboard

![](https://github.com/opensearch-project/opensearch-catalog/raw/main/integrations/observability/nginx/static/dashboard1.png)

---
## Loading Integrations via DashboardManagement

To update an integration template navigate to the DashboardManagement and select [savedObjects](https://localhost:5601/_dashboards/app/management/opensearch-dashboards/objects) and import the new artifact:

1) Download the `nginx-1.0.0.ndjson` artifact from the [catalog release page](https://github.com/opensearch-project/opensearch-catalog/releases/edit/nginx-1.0.0)

2) Go to the [DashboardManagement -> savedObjects ](https://localhost:5601/_dashboards/app/management/opensearch-dashboards/objects)

![](https://github.com/opensearch-project/opensearch-catalog/assets/48943349/d96e9a78-e3de-4cce-ba66-23f7c084778d)

![](https://github.com/opensearch-project/opensearch-catalog/assets/48943349/a63ae102-706a-4980-b758-fff7f6b24a94)

3) Once there select import to load the recently downloaded integration artifact (`nginx-1.0.0.ndjson` suffix)

4) Open the [nginx integration](https://localhost:5601/app/integrations#/available/nginx) and install
