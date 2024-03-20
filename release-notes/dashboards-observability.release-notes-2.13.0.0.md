## Version 2.13.0 Release Notes

Compatible with OpenSearch and OpenSearch Dashboards version 2.13.0

### Features
* Add integration installation to data sources flyout ([#1568](https://github.com/opensearch-project/dashboards-observability/pull/1568))
* Integrations: Update delete modal to support custom verify prompt ([#1567](https://github.com/opensearch-project/dashboards-observability/pull/1567))
* Data sources bug fixes and UI improvements ([#1565](https://github.com/opensearch-project/dashboards-observability/pull/1565))
* Allow browsing integrations in Flyout from Data Sources page ([#1562](https://github.com/opensearch-project/dashboards-observability/pull/1562))
* Add auto-suggestions for skipping index definition and export types ([#1552](https://github.com/opensearch-project/dashboards-observability/pull/1552))
* Data Sources component Improvements and bug fixes ([#1551](https://github.com/opensearch-project/dashboards-observability/pull/1551))
* Adding datasource status and filter for hive tables ([#1549](https://github.com/opensearch-project/dashboards-observability/pull/1549))
* Implement redirection to explorer within data sources ([#1548](https://github.com/opensearch-project/dashboards-observability/pull/1548))
* Add actual integration queries to table ([#1544](https://github.com/opensearch-project/dashboards-observability/pull/1544))
* Remove modal for discover redirection ([#1543](https://github.com/opensearch-project/dashboards-observability/pull/1543))
* Acceleration Actions Implementation ([#1540](https://github.com/opensearch-project/dashboards-observability/pull/1540))
* Updating UI for create acceleration flyout ([#1532](https://github.com/opensearch-project/dashboards-observability/pull/1532))
* Add conditional installation for S3 integrations ([#1528](https://github.com/opensearch-project/dashboards-observability/pull/1528))
* Add datasource field in accelerations cache ([#1525](https://github.com/opensearch-project/dashboards-observability/pull/1525))
* Acceleration components' data implementation ([#1521](https://github.com/opensearch-project/dashboards-observability/pull/1521))
* Add Retrieval from Catalog Cache ([#1517](https://github.com/opensearch-project/dashboards-observability/pull/1517))
* Export observability start interface ([#1515](https://github.com/opensearch-project/dashboards-observability/pull/1515))
* Expose create acceleration flyout, update acceleration docs link ([#1513](https://github.com/opensearch-project/dashboards-observability/pull/1513))
* Bump plugin version to 2.13.0 ([#1506](https://github.com/opensearch-project/dashboards-observability/pull/1506))
* Catalog cache and Session update for async queries ([#1500](https://github.com/opensearch-project/dashboards-observability/pull/1500))
* Add flyout pages to associated objects table ([#1496](https://github.com/opensearch-project/dashboards-observability/pull/1496))
* Remove index store region and index store URI for data connection panel ([#1490](https://github.com/opensearch-project/dashboards-observability/pull/1490))
* Accelerations Tab and Flyout Skeletons ([#1489](https://github.com/opensearch-project/dashboards-observability/pull/1489))
* Associated objects searchbar filters ([#1474](https://github.com/opensearch-project/dashboards-observability/pull/1474))
* Data sources associated objects tab ([#1470](https://github.com/opensearch-project/dashboards-observability/pull/1470))

### Bug Fixes
* Update integrations to allow custom checkpoint locations ([#1501](https://github.com/opensearch-project/dashboards-observability/pull/1501))
* (query assist) show error toasts if summary is disabled ([#1480](https://github.com/opensearch-project/dashboards-observability/pull/1480))
* Fixing style overriding issue in dashboards core vizBuilder ([#1451](https://github.com/opensearch-project/dashboards-observability/pull/1451))
* Fix jaeger spans key names for filtering ([#1428](https://github.com/opensearch-project/dashboards-observability/pull/1428))

### Infrastructure
* Add single version flag during bootstrap to fix version conflicts ([#1460](https://github.com/opensearch-project/dashboards-observability/pull/1460))

### Maintenance
* Copy Updates: Integration Flows -> Integration Resources ([#1555](https://github.com/opensearch-project/dashboards-observability/pull/1555))
* Update UI styles for query assist ([#1523](https://github.com/opensearch-project/dashboards-observability/pull/1523))
* Move create acceleration flyout from workbench to datasources ([#1508](https://github.com/opensearch-project/dashboards-observability/pull/1508))
* Minor integration name updates ([#1505](https://github.com/opensearch-project/dashboards-observability/pull/1505))
* Update integration format for better handling of multiple asset types ([#1502](https://github.com/opensearch-project/dashboards-observability/pull/1502))
* Update names and descriptions for integrations ([#1499](https://github.com/opensearch-project/dashboards-observability/pull/1499))
* (query assist) get agent id through config API ([#1482](https://github.com/opensearch-project/dashboards-observability/pull/1482))
* Changed Explorer Data Grid useage of timestamp ([#1479](https://github.com/opensearch-project/dashboards-observability/pull/1479))
* Flint bug fix explorer failure ([#1476](https://github.com/opensearch-project/dashboards-observability/pull/1476))
* Fixing Flaky Panels Test ([#1463](https://github.com/opensearch-project/dashboards-observability/pull/1463))
* remove hardcoded width for generate ppl button ([#1447](https://github.com/opensearch-project/dashboards-observability/pull/1447))
* upgrade plotly to v2 ([#1432](https://github.com/opensearch-project/dashboards-observability/pull/1432))
