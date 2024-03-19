## Version 2.13.0 Release Notes

Compatible with OpenSearch and OpenSearch Dashboards version 2.13.0

### Features
* Integrations: Update delete modal to support custom verify prompt by @Swiddis ([#1567](https://github.com/opensearch-project/dashboards-observability/pull/1567))
* Data sources bug fixes and UI improvements by @sejli ([#1565](https://github.com/opensearch-project/dashboards-observability/pull/1565))
* Add integration installation to data sources flyout by ([#1561](https://github.com/opensearch-project/dashboards-observability/pull/1561))
* Allow browsing integrations in Flyout from Data Sources page by ([#1560](https://github.com/opensearch-project/dashboards-observability/pull/1560))
* Add auto-suggestions for skipping index definition and export types by @ps48 ([#1552](https://github.com/opensearch-project/dashboards-observability/pull/1552))
* Data Sources component Improvements and bug fixes by @sejli ([#1551](https://github.com/opensearch-project/dashboards-observability/pull/1551))
* Adding datasource status and filter for hive tables by @ps48 ([#1549](https://github.com/opensearch-project/dashboards-observability/pull/1549))
* Implement redirection to explorer within data sources by @paulstn ([#1548](https://github.com/opensearch-project/dashboards-observability/pull/1548))
* Add actual integration queries to table by @Swiddis ([#1544](https://github.com/opensearch-project/dashboards-observability/pull/1544))
* Remove modal for discover redirection by @mengweieric ([#1543](https://github.com/opensearch-project/dashboards-observability/pull/1543))
* Acceleration Actions Implementation by @RyanL1997 ([#1540](https://github.com/opensearch-project/dashboards-observability/pull/1540))
* Updating UI for create acceleration flyout by @ps48 ([#1532](https://github.com/opensearch-project/dashboards-observability/pull/1532))
* Add datasource field in accelerations cache by @ps48 ([#1525](https://github.com/opensearch-project/dashboards-observability/pull/1525))
* Acceleration components' data implementation by @RyanL1997 ([#1521](https://github.com/opensearch-project/dashboards-observability/pull/1521))
* Add conditional installation for S3 integrations by @Swiddis ([#1518](https://github.com/opensearch-project/dashboards-observability/pull/1518))
* Add Retrieval from Catalog Cache by @sejli ([#1517](https://github.com/opensearch-project/dashboards-observability/pull/1517))
* Export observability start interface by @ps48 ([#1515](https://github.com/opensearch-project/dashboards-observability/pull/1515))
* Expose create acceleration flyout, update acceleration docs link by @ps48 ([#1513](https://github.com/opensearch-project/dashboards-observability/pull/1513))
* Bump plugin version to 2.13.0 by @RyanL1997 ([#1506](https://github.com/opensearch-project/dashboards-observability/pull/1506))
* Catalog cache and Session update for async queries by @ps48 ([#1500](https://github.com/opensearch-project/dashboards-observability/pull/1500))
* Add flyout pages to associated objects table by @RyanL1997 ([#1496](https://github.com/opensearch-project/dashboards-observability/pull/1496))
* Remove index store region and index store URI for data connection panel by @RyanL1997 ([#1490](https://github.com/opensearch-project/dashboards-observability/pull/1490))
* Accelerations Tab and Flyout Skeletons by @RyanL1997 ([#1489](https://github.com/opensearch-project/dashboards-observability/pull/1489))
* (query assist) get agent id through config API by @joshuali925 ([#1482](https://github.com/opensearch-project/dashboards-observability/pull/1482))
* Associated objects searchbar filters by @RyanL1997 ([#1474](https://github.com/opensearch-project/dashboards-observability/pull/1474))
* Data sources associated objects tab by @RyanL1997 ([#1470](https://github.com/opensearch-project/dashboards-observability/pull/1470))

### Bug Fixes
* Update integrations to allow custom checkpoint locations by @Swiddis ([#1501](https://github.com/opensearch-project/dashboards-observability/pull/1501))
* (query assist) show error toasts if summary is disabled by @joshuali925 ([#1480](https://github.com/opensearch-project/dashboards-observability/pull/1480))
* Fixing style overriding issue in dashboards core vizBuilder by @mengweieric ([#1451](https://github.com/opensearch-project/dashboards-observability/pull/1451))
* Fix jaeger spans key names for filtering by @joshuali925 ([#1428](https://github.com/opensearch-project/dashboards-observability/pull/1428))

### Infrastructure
* Add single version flag during bootstrap to fix version conflicts by @RyanL1997 ([#1460](https://github.com/opensearch-project/dashboards-observability/pull/1460))

### Maintenance
* Copy Updates: Integration Flows -> Integration Resources by @Swiddis ([#1555](https://github.com/opensearch-project/dashboards-observability/pull/1555))
* Update UI styles for query assist by @joshuali925 ([#1523](https://github.com/opensearch-project/dashboards-observability/pull/1523))
* Move create acceleration flyout from workbench to datasources by @ps48 ([#1508](https://github.com/opensearch-project/dashboards-observability/pull/1508))
* Minor integration name updates by @Swiddis ([#1505](https://github.com/opensearch-project/dashboards-observability/pull/1505))
* Update integration format for better handling of multiple asset types by @Swiddis ([#1498](https://github.com/opensearch-project/dashboards-observability/pull/1498))
* Update names and descriptions for integrations by @Swiddis ([#1494](https://github.com/opensearch-project/dashboards-observability/pull/1494))
* Changed Explorer Data Grid useage of timestamp by @paulstn ([#1479](https://github.com/opensearch-project/dashboards-observability/pull/1479))
* Flint bug fix explorer failure by @paulstn ([#1476](https://github.com/opensearch-project/dashboards-observability/pull/1476))
* Fixing Flaky Panels Test by @sejli ([#1463](https://github.com/opensearch-project/dashboards-observability/pull/1463))
* remove hardcoded width for generate ppl button by @joshuali925 ([#1447](https://github.com/opensearch-project/dashboards-observability/pull/1447))
* upgrade plotly to v2 by @joshuali925 ([#1432](https://github.com/opensearch-project/dashboards-observability/pull/1432))
