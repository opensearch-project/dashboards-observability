## Version 2.11.0.0 Release Notes

Compatible with OpenSearch and OpenSearch Dashboards Version 2.11.0

### Features

* Add SQL query-type ([#988](https://github.com/opensearch-project/dashboards-observability/pull/988))
* DataSources: Create / Manage Flow UI ([#1035](https://github.com/opensearch-project/dashboards-observability/pull/1035)) ([#1052](https://github.com/opensearch-project/dashboards-observability/pull/1052))([#1063](https://github.com/opensearch-project/dashboards-observability/pull/1063)) ([#1092](https://github.com/opensearch-project/dashboards-observability/pull/1092))
* DataSources: implement S3 DataSource Flow ([#1049](https://github.com/opensearch-project/dashboards-observability/pull/1049)) ([#1057](https://github.com/opensearch-project/dashboards-observability/pull/1057)) ([#1111](https://github.com/opensearch-project/dashboards-observability/pull/1111)) ([#1113](https://github.com/opensearch-project/dashboards-observability/pull/1113))
* DataSources: implement Prometheus DataSource Flow ([#1054](https://github.com/opensearch-project/dashboards-observability/pull/1054))
* Log Explorer: Correctly display empty timeframes on hit-count chart ([#990](https://github.com/opensearch-project/dashboards-observability/pull/990))
* Integrations: Add Setup UI ([#1009](https://github.com/opensearch-project/dashboards-observability/pull/1009)) ([#1100](https://github.com/opensearch-project/dashboards-observability/pull/1100))
* Integrations: Implement S3 Setup UI ([#1086](https://github.com/opensearch-project/dashboards-observability/pull/1086)) ([#1114](https://github.com/opensearch-project/dashboards-observability/pull/1114))

### Bug Fixes

* Log Explorer: fix missing dep on query_utils ([#1067](https://github.com/opensearch-project/dashboards-observability/pull/1067))

### Infrastructure

* CI: Remove Yarn caching in CI and switch to Retry ([#965](https://github.com/opensearch-project/dashboards-observability/pull/965))
* CI: Add cron schedule to CI E2E workflow ([#1005](https://github.com/opensearch-project/dashboards-observability/pull/1005))
* CI : Update E2E config ([#1025](https://github.com/opensearch-project/dashboards-observability/pull/1025))

### Refactoring

* Metrics: move query_utils to /public and refactor ([#983](https://github.com/opensearch-project/dashboards-observability/pull/983)) ([#1064](https://github.com/opensearch-project/dashboards-observability/pull/1064))
* Metrics: update metric-list icons ([#1066](https://github.com/opensearch-project/dashboards-observability/pull/1066))
* Log Explorer: refactor design and look on sidebar ([#933](https://github.com/opensearch-project/dashboards-observability/pull/933)) ([#1061](https://github.com/opensearch-project/dashboards-observability/pull/1061))
* Log Explorer: adjust hit-count chart color and spacing ([#1051](https://github.com/opensearch-project/dashboards-observability/pull/1051))
* Log Explorer: match data-grid look/feel to OSD Discover ([#1041](https://github.com/opensearch-project/dashboards-observability/pull/1041))
* Log Explorer: remove PPL keyword from search-bar ([#1123](https://github.com/opensearch-project/dashboards-observability/pull/1123))
* Integrations: refactor backend to Abstract IO ([#947](https://github.com/opensearch-project/dashboards-observability/pull/947))
