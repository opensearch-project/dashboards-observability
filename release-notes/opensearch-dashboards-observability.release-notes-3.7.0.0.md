## Version 3.7.0 Release Notes

Compatible with OpenSearch and OpenSearch Dashboards version 3.7.0

### Features

* Add SLO/SLI foundation with saved-object schema, ruler client, routes, and minimal wizard behind feature flag ([#2676](https://github.com/opensearch-project/dashboards-observability/pull/2676))
* Add SLO/SLI follow-ups including ruler dual-write, wizard completeness, live status aggregator, listing facet filters, detail page, and APM integration ([#2689](https://github.com/opensearch-project/dashboards-observability/pull/2689))
* Add Alert Manager with Alerts, Rules, and Routing tabs backed by OpenSearch Alerting and Prometheus ([#2653](https://github.com/opensearch-project/dashboards-observability/pull/2653))

### Enhancements

* Add time range selector to the Alerts page for filtering alerts by arbitrary time window ([#2675](https://github.com/opensearch-project/dashboards-observability/pull/2675))
* Refactor Alerts UI with renamed navigation, collapsible filter panel, and improved layout ([#2677](https://github.com/opensearch-project/dashboards-observability/pull/2677))
* Add icon-based side navigation support with Trace Analytics and APM categories ([#2655](https://github.com/opensearch-project/dashboards-observability/pull/2655))

### Bug Fixes

* Exclude text-only fields from default pattern field selection in Logs Explorer to prevent aggregation errors ([#2661](https://github.com/opensearch-project/dashboards-observability/pull/2661))
* Make SPAN() case-insensitive in visualization rendering to fix blank charts with uppercase usage ([#2659](https://github.com/opensearch-project/dashboards-observability/pull/2659))
* Register Alert Manager in side nav when enabled by threading the flag through nav registration functions ([#2668](https://github.com/opensearch-project/dashboards-observability/pull/2668))
* Fix ReferenceError caused by missing lodash import in Logs Explorer direct events hook ([#2660](https://github.com/opensearch-project/dashboards-observability/pull/2660))

### Infrastructure

* Add issues write permission to untriaged label workflow to fix 403 errors ([#2685](https://github.com/opensearch-project/dashboards-observability/pull/2685))
* Pin GitHub Actions to commit SHAs to prevent supply chain attacks ([#2690](https://github.com/opensearch-project/dashboards-observability/pull/2690))
* Stabilize Application Analytics Cypress and FTR tests with improved element targeting and error handling ([#2667](https://github.com/opensearch-project/dashboards-observability/pull/2667))
* Fix Traces Cypress tests by replacing fragile tick assertions and adding resilient node click handling ([#2671](https://github.com/opensearch-project/dashboards-observability/pull/2671))
* Fix link checker by updating Hapi Wreck URL ([#2664](https://github.com/opensearch-project/dashboards-observability/pull/2664))

### Maintenance

* Fix typo in application deletion error toast: "occured" → "occurred" ([#2674](https://github.com/opensearch-project/dashboards-observability/pull/2674))
* Bump uuid to 3.4.0 to resolve CVE-2026-41907 in transitive dependency ([#2679](https://github.com/opensearch-project/dashboards-observability/pull/2679))
* Improve Alerts empty state with primary Rules button and updated layout ([#2686](https://github.com/opensearch-project/dashboards-observability/pull/2686))
* Migrate plugin to TypeScript 6.0.2 compatibility by removing conflicting dependencies ([#2652](https://github.com/opensearch-project/dashboards-observability/pull/2652))
* Skip histogram and patterns sub-queries when PPL query contains stats to prevent invalid PPL errors ([#2695](https://github.com/opensearch-project/dashboards-observability/pull/2695))
* Fix link checker CI failure by adding unreachable URLs to ignore list ([#2646](https://github.com/opensearch-project/dashboards-observability/pull/2646))
* Fix broken release notes link by pointing to existing commit SHA ([#2688](https://github.com/opensearch-project/dashboards-observability/pull/2688))
