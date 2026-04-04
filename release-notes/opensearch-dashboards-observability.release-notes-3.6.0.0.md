## Version 3.6.0 Release Notes

Compatible with OpenSearch and OpenSearch Dashboards version 3.6.0

### Enhancements

* Use OpenSearch Dashboards core APM topology package instead of external npm dependency ([#2611](https://github.com/opensearch-project/dashboards-observability/pull/2611))
* Update lodash to 4.18.1 to address CVE-2026-4800 ([#2636](https://github.com/opensearch-project/dashboards-observability/pull/2636))

### Bug Fixes

* Fix APM logs correlation query missing dataSource for external datasources, causing 503 errors ([#2625](https://github.com/opensearch-project/dashboards-observability/pull/2625))
* Fix APM UI pagination reset, settings modal layout, and chart rendering issues ([#2618](https://github.com/opensearch-project/dashboards-observability/pull/2618))
* Fix APM metric card calculations for fault rate, latency percentiles, and throughput display ([#2624](https://github.com/opensearch-project/dashboards-observability/pull/2624))
* Fix APM metrics accuracy with server-side filtering, chart-total consistency, and throughput normalization as req/s ([#2623](https://github.com/opensearch-project/dashboards-observability/pull/2623))
* Update APM PromQL queries to use time-range aggregation and custom step sizes for accurate metric display ([#2621](https://github.com/opensearch-project/dashboards-observability/pull/2621))
* Update APM service map PPL queries and response processors to support new Data Prepper index mappings ([#2596](https://github.com/opensearch-project/dashboards-observability/pull/2596))
* Replace deprecated ad command PPL query with MLCommons RCF service in Patterns tab ([#2601](https://github.com/opensearch-project/dashboards-observability/pull/2601))

### Maintenance

* Bump ajv from 8.12.0 to 8.18.0 ([#2595](https://github.com/opensearch-project/dashboards-observability/pull/2595))
* Bump picomatch from 2.3.1 to 2.3.2 to address CVE-2026-33671 and CVE-2026-33672 ([#2627](https://github.com/opensearch-project/dashboards-observability/pull/2627))
* Bump dompurify from 3.3.0 to 3.3.3 and minimatch to 3.1.5 ([#2632](https://github.com/opensearch-project/dashboards-observability/pull/2632))
* Bump serialize-javascript and scoped ajv transitive dependencies ([#2633](https://github.com/opensearch-project/dashboards-observability/pull/2633))
* Remove unused qs library ([#2605](https://github.com/opensearch-project/dashboards-observability/pull/2605))
