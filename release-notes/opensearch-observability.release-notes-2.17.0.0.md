## Version 2.17.0 Release Notes

Compatible with OpenSearch and OpenSearch Dashboards version 2.17.0

### Features
* [Page Header] New page header for metrics ([#2050](https://github.com/opensearch-project/dashboards-observability/pull/2050))
* [Look&Feel] Integrations Density and Consistency Improvements ([#2071](https://github.com/opensearch-project/dashboards-observability/pull/2071))
* [Feature] Multi-data Source Support for Getting Started ([#2048](https://github.com/opensearch-project/dashboards-observability/pull/2048))
* [Feature] Traces/Services UI update ([#2078](https://github.com/opensearch-project/dashboards-observability/pull/2078))
* [Page Header] New page header for applications and UI updates ([#2081](https://github.com/opensearch-project/dashboards-observability/pull/2081))
* [Feature] Observability dashboards UI update ([#2090](https://github.com/opensearch-project/dashboards-observability/pull/2090))
* [FEATURE] MDS support in Integrations for observability plugin ([#2051](https://github.com/opensearch-project/dashboards-observability/pull/2051))
* [Feature] Logs UI update ([#2092](https://github.com/opensearch-project/dashboards-observability/pull/2092))
* feat: make createAssets API compatible with workspace ([#2101](https://github.com/opensearch-project/dashboards-observability/pull/2101))
* [Page Header] New page header for notebooks and UI updates ([#2099](https://github.com/opensearch-project/dashboards-observability/pull/2099), [#2103](https://github.com/opensearch-project/dashboards-observability/pull/2099))
* [Feature] OverviewPage made with Content Management ([#2077](https://github.com/opensearch-project/dashboards-observability/pull/2077))

### Enhancement
* Update ndjson so workflow matches patterns created ([#2016](https://github.com/opensearch-project/dashboards-observability/pull/2016))
* Remove useless registration method ([#2044](https://github.com/opensearch-project/dashboards-observability/pull/2044))
* Use smaller and compressed varients of buttons and form components ([#2068](https://github.com/opensearch-project/dashboards-observability/pull/2068))
* [Enhancement] Deregister dashboards, applications, logs in MDS ([#2097](https://github.com/opensearch-project/dashboards-observability/pull/2097))
* Trace Analytics support for custom sources ([#2112](https://github.com/opensearch-project/dashboards-observability/pull/2112))
* [query assist] update api handler to accommodate new ml-commons config response ([#2111](https://github.com/opensearch-project/dashboards-observability/pull/2111))
* Update trace analytics landing page ([#2125](https://github.com/opensearch-project/dashboards-observability/pull/2125))
* [query assist] update ml-commons response schema ([#2124](https://github.com/opensearch-project/dashboards-observability/pull/2124))
* [MDS] Add support for register data sources during the absence of local cluster ([#2140](https://github.com/opensearch-project/dashboards-observability/pull/2140))

### Bug Fixes
* [Bug] Trace Analytics bug fix for local cluster being rendered ([#2006](https://github.com/opensearch-project/dashboards-observability/pull/2006))
* Fix docker links & index patterns names ([#2017](https://github.com/opensearch-project/dashboards-observability/pull/2017))
* Traces and Spans tab Fix for application analytics ([#2023](https://github.com/opensearch-project/dashboards-observability/pull/2023))
* Link fixes for csv ([#2031](https://github.com/opensearch-project/dashboards-observability/pull/2031))
* Fix direct url load for trace analytics ([#2024](https://github.com/opensearch-project/dashboards-observability/pull/2024))
* [Bug] Trace Analytics bugfix for breadcrumbs and id pathing ([#2037](https://github.com/opensearch-project/dashboards-observability/pull/2037))
* fix badge size for counters, change notebook delete, update test ([#2110](https://github.com/opensearch-project/dashboards-observability/pull/2110))
* [Bug]fixed traces bug for missing MDS id ([#2100](https://github.com/opensearch-project/dashboards-observability/pull/2100))
* [BUG]fix add sample notebooks ([#2108](https://github.com/opensearch-project/dashboards-observability/pull/2108))

### Maintenance
* Update getting-started links to match recent catalog PR merges ([#2012](https://github.com/opensearch-project/dashboards-observability/pull/2006))
* Fix Observability CI workflow checks ([#2046](https://github.com/opensearch-project/dashboards-observability/pull/2046))
* Bump org.json:json ([#1966](https://github.com/opensearch-project/dashboards-observability/pull/1966))
* Update the actions/upload-artifact from v1 to v4 ([#2133](https://github.com/opensearch-project/dashboards-observability/pull/2133))
* [CVE] Bump the lint-staged from 13.1.0 to 15.2.10 ([#2138](https://github.com/opensearch-project/dashboards-observability/pull/2138))
