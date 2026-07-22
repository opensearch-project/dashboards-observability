## Version 3.8.0 Release Notes

Compatible with OpenSearch and OpenSearch Dashboards version 3.8.0

### Features

* Add Prometheus metrics rule creation, editing, cloning, and deletion via the Cortex ruler API ([#2718](https://github.com/opensearch-project/dashboards-observability/pull/2718))

### Enhancements

* Add anomaly detection resources (detectors, forecasters) to Alert Manager ([#2721](https://github.com/opensearch-project/dashboards-observability/pull/2721))
* Add alert banner for legacy experience navigation ([#2772](https://github.com/opensearch-project/dashboards-observability/pull/2772))
* Onboard new backport-pr reusable GitHub workflow ([#2760](https://github.com/opensearch-project/dashboards-observability/pull/2760))
* Persist APM time range selection across pages and reloads using session storage ([#2784](https://github.com/opensearch-project/dashboards-observability/pull/2784))
* Refine SLO suggest page with service-first selection, grouped preview, and UX improvements ([#2783](https://github.com/opensearch-project/dashboards-observability/pull/2783))

### Bug Fixes

* Fix SLO bugs including breadcrumb removal, template navigation, beta icon removal, and Alertmanager config error handling ([#2755](https://github.com/opensearch-project/dashboards-observability/pull/2755))
* Include Prometheus connection metadata in all PromQL chart queries to fix empty datasource errors ([#2726](https://github.com/opensearch-project/dashboards-observability/pull/2726))
* Allow colons in rule-detail ruleId path parameter for Prometheus SLO rules ([#2746](https://github.com/opensearch-project/dashboards-observability/pull/2746))
* Fix SLO status incorrectly degrading to no-data when optional alerts fetch fails ([#2747](https://github.com/opensearch-project/dashboards-observability/pull/2747))
* Pass real datasource context and wire persistence in CreateMetricsMonitor flyout ([#2773](https://github.com/opensearch-project/dashboards-observability/pull/2773))
* Use validate callback for length checks in alerting schemas to fix joi v17 compatibility ([#2730](https://github.com/opensearch-project/dashboards-observability/pull/2730))
* Clear stale histogram and patterns when switching to a stats query ([#2728](https://github.com/opensearch-project/dashboards-observability/pull/2728))
* Improve SLO creation flow with service-first guidance and fix Alert Manager severity/datasource issues ([#2758](https://github.com/opensearch-project/dashboards-observability/pull/2758))

### Infrastructure

* Update opensearch-build workflow references from commit SHA to main branch ([#2731](https://github.com/opensearch-project/dashboards-observability/pull/2731))
* Update GitHub actions to use official opensearch-project actions ([#2749](https://github.com/opensearch-project/dashboards-observability/pull/2749))

### Maintenance

* Add APM, SLO, and Alerting nav popovers and rename Application Map to Topology Map ([#2762](https://github.com/opensearch-project/dashboards-observability/pull/2762))
* Adopt ESLint 10 flat config ([#2777](https://github.com/opensearch-project/dashboards-observability/pull/2777))
* Bump fast-uri from 3.1.0 to 3.1.2 ([#2673](https://github.com/opensearch-project/dashboards-observability/pull/2673))
* Bump js-yaml from 4.1.1 to 4.2.0 ([#2736](https://github.com/opensearch-project/dashboards-observability/pull/2736))
* Adopt dynamic feature flags for Alerts and SLO features ([#2719](https://github.com/opensearch-project/dashboards-observability/pull/2719))
* Increment version to 3.8.0 with Hapi compatibility fix and link checker hardening ([#2722](https://github.com/opensearch-project/dashboards-observability/pull/2722))
* Migrate Jest test suite to Jest 30 and jsdom 26 ([#2788](https://github.com/opensearch-project/dashboards-observability/pull/2788))
* Update dependency ajv to v8.20.0 to resolve CVE-2026-6321 and CVE-2026-6322 ([#2714](https://github.com/opensearch-project/dashboards-observability/pull/2714))
* Update dependency echarts to v6.1.0 to resolve CVE-2026-45249 ([#2715](https://github.com/opensearch-project/dashboards-observability/pull/2715))
* Update dependency isomorphic-dompurify to ~2.27.0 to resolve CVE-2026-45736 ([#2716](https://github.com/opensearch-project/dashboards-observability/pull/2716))
* Update dependency isomorphic-dompurify to ~2.28.0 ([#2735](https://github.com/opensearch-project/dashboards-observability/pull/2735))
* Update dependency isomorphic-dompurify to ~2.29.0 ([#2743](https://github.com/opensearch-project/dashboards-observability/pull/2743))
* Update dependency js-yaml to v4.3.0 to resolve CVE-2026-59869 ([#2782](https://github.com/opensearch-project/dashboards-observability/pull/2782))
* Bump uuid to ^11.1.1 to remediate CVE-2026-41907 ([#2765](https://github.com/opensearch-project/dashboards-observability/pull/2765))
* Pin picomatch and brace-expansion for CVE remediation ([#2751](https://github.com/opensearch-project/dashboards-observability/pull/2751))
* Bump dompurify from 3.4.10 to 3.4.12 ([#2752](https://github.com/opensearch-project/dashboards-observability/pull/2752))
* Exclude AnalyticEngine datasets from APM settings selectors ([#2727](https://github.com/opensearch-project/dashboards-observability/pull/2727))
* Update APM UI text and comments ([#2757](https://github.com/opensearch-project/dashboards-observability/pull/2757))
* Align EUI/OUI rule overrides with root OpenSearch Dashboards ESLint config ([#2785](https://github.com/opensearch-project/dashboards-observability/pull/2785))
* Remove direct js-yaml dependency and use core's bundled version ([#2791](https://github.com/opensearch-project/dashboards-observability/pull/2791))

### Refactoring

* Replace full-library lodash imports with path-based imports for tree-shaking ([#2748](https://github.com/opensearch-project/dashboards-observability/pull/2748))
