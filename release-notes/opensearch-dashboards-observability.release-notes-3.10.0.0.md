## Version 3.10.0 Release Notes

Compatible with OpenSearch and OpenSearch Dashboards version 3.10.0

### Features

* Add Amazon CloudWatch alarms as an experimental, opt-in datasource in the unified Alerts view with alarm detail flyout, state history, metric preview, and composite-alarm relationship graph ([#2905](https://github.com/opensearch-project/dashboards-observability/pull/2905))
* Add PPL look-back window and per-action notification throttling for logs alert rules, with large-query handling and UX/a11y improvements ([#2899](https://github.com/opensearch-project/dashboards-observability/pull/2899))

### Enhancements

* Add unified APM service catalog and application map with typed external dependencies for databases, message brokers, and external endpoints ([#2898](https://github.com/opensearch-project/dashboards-observability/pull/2898))
* Allow AnalyticEngine-backed datasets in APM settings selectors now that AnalyticEngine supports APM queries ([#2914](https://github.com/opensearch-project/dashboards-observability/pull/2914))
* Add synced crosshair, time brush zoom, legend isolate, x-axis overlap fix, and open-in-metrics deep link to APM PromQL charts ([#2900](https://github.com/opensearch-project/dashboards-observability/pull/2900))
* Route GenAI span correlations from APM to Agent Traces when the Agent Traces app is available ([#2910](https://github.com/opensearch-project/dashboards-observability/pull/2910))
* Show dependency-type icons in the APM service catalog, details header, and map side panel ([#2927](https://github.com/opensearch-project/dashboards-observability/pull/2927))
* Apply consistent status and severity label casing, clear messaging for deleted-monitor alerts, and scoped deep-link search in the Alerting view ([#2944](https://github.com/opensearch-project/dashboards-observability/pull/2944))
* Log data connection route failures via plugin logger at appropriate levels instead of dumping full error objects to stderr ([#2915](https://github.com/opensearch-project/dashboards-observability/pull/2915))

### Bug Fixes

* Improve SLO validation messages for rejected forDuration values and correctly classify wrapped ruler auth and conflict errors ([#2912](https://github.com/opensearch-project/dashboards-observability/pull/2912))
* Fix "Open in Discover metrics" button crashing Explore by sending only the required app state section ([#2946](https://github.com/opensearch-project/dashboards-observability/pull/2946))
* Fix stale sparkline shown for services with no data and empty sparklines on long time ranges with little history ([#2941](https://github.com/opensearch-project/dashboards-observability/pull/2941))
* Re-resolve relative time ranges on refresh and sync from/to with the URL across all APM pages ([#2909](https://github.com/opensearch-project/dashboards-observability/pull/2909))
* Scope Services page PromQL queries to active filters and eliminate duplicate fetches that caused slow loads and timeouts ([#2933](https://github.com/opensearch-project/dashboards-observability/pull/2933))
* Fix SLOs always showing No data or Source idle by recovering metric names from both PromQL series shapes and correcting span-derived SLI math ([#2934](https://github.com/opensearch-project/dashboards-observability/pull/2934))
* Restrict Explore's "Create alert rule" actions to supported dataset types and query languages ([#2928](https://github.com/opensearch-project/dashboards-observability/pull/2928))

### Documentation

* Fix broken documentation links after opensearch.org to docs.opensearch.org migration ([#2886](https://github.com/opensearch-project/dashboards-observability/pull/2886))

### Maintenance

* Defer Trace Analytics initial fetch until MDS data source resolves to prevent errors when no local cluster exists ([#2902](https://github.com/opensearch-project/dashboards-observability/pull/2902))
* Bump brace-expansion to 5.0.12 and fast-uri to 3.1.9 to fix multiple CVEs ([#2960](https://github.com/opensearch-project/dashboards-observability/pull/2960))
* Bump dompurify to 3.4.17 to fix critical template bypass and other security advisories ([#2938](https://github.com/opensearch-project/dashboards-observability/pull/2938))
* Bump dompurify from 3.4.13 to 3.4.16 ([#2913](https://github.com/opensearch-project/dashboards-observability/pull/2913))
* Bump source-map-js from 1.2.1 to 1.2.2 to fix CSP crash and denial-of-service CVE ([#2920](https://github.com/opensearch-project/dashboards-observability/pull/2920))
