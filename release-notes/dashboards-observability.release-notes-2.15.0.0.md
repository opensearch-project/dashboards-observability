## Version 2.15.0 Release Notes

Compatible with OpenSearch and OpenSearch Dashboards version 2.15.0

### Features
* Implement upload flyout for integrations ([#1897](https://github.com/opensearch-project/dashboards-observability/pull/1897))
* Metrics analytics support for MDS ([#1895](https://github.com/opensearch-project/dashboards-observability/pull/1895))
* Add applicable_data_sources field to workflows definition ([#1888](https://github.com/opensearch-project/dashboards-observability/pull/1888))
* Trace Analytics v2 update - adding in conext views, updating filter, … ([#1885](https://github.com/opensearch-project/dashboards-observability/pull/1885))
* Add 'check for version' link in the integration details page ([#1879](https://github.com/opensearch-project/dashboards-observability/pull/1879))
* Integration enhancements ([#1870](https://github.com/opensearch-project/dashboards-observability/pull/1870))
* Bug fix for data-sources page ([#1830](https://github.com/opensearch-project/dashboards-observability/pull/1830))
* Move Cypress related dependencies to devDependencies and remove one unused dependency ([#1829](https://github.com/opensearch-project/dashboards-observability/pull/1829))
* Improve query assist user experiences ([#1817](https://github.com/opensearch-project/dashboards-observability/pull/1817))
* Add JSON5 parsing capabilities for integration configs ([#1815](https://github.com/opensearch-project/dashboards-observability/pull/1815))
* Refactor all the integrations with Amazon branding instead of AWS ([#1787](https://github.com/opensearch-project/dashboards-observability/pull/1787))
* add otel services support integration ([#1769](https://github.com/opensearch-project/dashboards-observability/pull/1769))
* MDS Support for trace analytics ([#1752](https://github.com/opensearch-project/dashboards-observability/pull/1752))
* Add skipping indices for all integrations that have sample queries ([#1747](https://github.com/opensearch-project/dashboards-observability/pull/1747))
* add saved queries to vpc flow ([#1744](https://github.com/opensearch-project/dashboards-observability/pull/1744))
* added fix for jobs and cache Support for workbench ,MDS support ([#1739](https://github.com/opensearch-project/dashboards-observability/pull/1739))
* Cloud trails saved queries integration ([#1737](https://github.com/opensearch-project/dashboards-observability/pull/1737))

### Bug Fixes
* (query assist) revert removing backticks ([#1898](https://github.com/opensearch-project/dashboards-observability/pull/1898))
* Minor bug fixes for trace analytics v2 (#1894) ([#1893](https://github.com/opensearch-project/dashboards-observability/pull/1893))
* manual backport of otel-metrics pr ([#1892](https://github.com/opensearch-project/dashboards-observability/pull/1892))
* Fix traces index schema bug ([#1865](https://github.com/opensearch-project/dashboards-observability/pull/1865))
* Traces-analytics bug fix for missing MDS id in flyout ([#1857](https://github.com/opensearch-project/dashboards-observability/pull/1857))
* Raw Vpc schema integration (1.0.0 parquet ) ([#1853](https://github.com/opensearch-project/dashboards-observability/pull/1853))
* Fix flint skipping index syntax issues ([#1846](https://github.com/opensearch-project/dashboards-observability/pull/1846))
* Fix window start backtick during MV creation ([#1823](https://github.com/opensearch-project/dashboards-observability/pull/1823))
* Fix data connection api 404 error ([#1810](https://github.com/opensearch-project/dashboards-observability/pull/1810))
* remove defaulting to query assist time range ([#1805](https://github.com/opensearch-project/dashboards-observability/pull/1805))
* Backport prometheus fix to 2.x ([#1782](https://github.com/opensearch-project/dashboards-observability/pull/1782))
* [Bug fix] Add conditional rendering for data connection page's tabs ([#1756](https://github.com/opensearch-project/dashboards-observability/pull/1756))
* removed update button from explorer ([#1755](https://github.com/opensearch-project/dashboards-observability/pull/1755))
* (query assist) remove caching agent id ([#1734](https://github.com/opensearch-project/dashboards-observability/pull/1734))
* added placeholder change for metrics picker ([#1906](https://github.com/opensearch-project/dashboards-observability/pull/1906))

### Maintenance
* Remove mocha from dependencies ([#1890](https://github.com/opensearch-project/dashboards-observability/pull/1890))
* Rename Flint instances to S3 Glue ([#1899](https://github.com/opensearch-project/dashboards-observability/pull/1899))
* Fix dead links ([#1872](https://github.com/opensearch-project/dashboards-observability/pull/1872))
* Refactor away integrations adaptor class ([#1825](https://github.com/opensearch-project/dashboards-observability/pull/1825))
* Updating security reachout email ([#1854](https://github.com/opensearch-project/dashboards-observability/pull/1854))
* Fix `S3_DATASOURCE_TYPE` naming typo in `plugin.tsx` ([#1799](https://github.com/opensearch-project/dashboards-observability/pull/1799))
* Adding test for clear cache on logout ([#1794](https://github.com/opensearch-project/dashboards-observability/pull/1794))
