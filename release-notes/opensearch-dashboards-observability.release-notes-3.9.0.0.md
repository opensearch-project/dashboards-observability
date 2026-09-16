## Version 3.9.0 Release Notes

Compatible with OpenSearch and OpenSearch Dashboards version 3.9.0

### Features

* Add APM setup wizard for one-click onboarding, replacing manual dataset and configuration wiring ([#2805](https://github.com/opensearch-project/dashboards-observability/pull/2805))
* Add correlated dashboards support to APM services and topology map nodes (experimental) ([#2892](https://github.com/opensearch-project/dashboards-observability/pull/2892))
* Add generic error classification and surfacing layer with stable categories, redaction, and correlation ids ([#2819](https://github.com/opensearch-project/dashboards-observability/pull/2819))

### Enhancements

* Add detector and forecaster management to Alerts Manager for anomaly detection and forecasting rules ([#2804](https://github.com/opensearch-project/dashboards-observability/pull/2804))
* Add classic-experience escape hatches for unsupported monitor types in the alerting UI ([#2823](https://github.com/opensearch-project/dashboards-observability/pull/2823))
* Improve Alerts Manager empty state with capability cards for Alerting, Anomaly Detection, and Forecasting ([#2822](https://github.com/opensearch-project/dashboards-observability/pull/2822))
* Stop clamping pre-window alerts into bucket 0 on the alerts timeline and label the y-axis ([#2828](https://github.com/opensearch-project/dashboards-observability/pull/2828))
* Align forecaster edit gate with the shared running-state predicate and humanize update errors ([#2837](https://github.com/opensearch-project/dashboards-observability/pull/2837))
* Add shared alerting primitives for i18n enum labels, timezone-aware timestamps, and theme color tokens ([#2826](https://github.com/opensearch-project/dashboards-observability/pull/2826))
* Surface unified-alerts errors as toasts with per-datasource indicators in the filter facet ([#2820](https://github.com/opensearch-project/dashboards-observability/pull/2820))
* Unify Create metrics rule flyouts across Alert Manager and Metrics page into a single shared component ([#2817](https://github.com/opensearch-project/dashboards-observability/pull/2817))
* Add SLO onboarding empty state with services-aware suggestions, toolbar button, and tidier catalog rows ([#2821](https://github.com/opensearch-project/dashboards-observability/pull/2821))
* Add SLO edit path with wizard prefill and update support ([#2838](https://github.com/opensearch-project/dashboards-observability/pull/2838))
* Improve SLO detail page with header layout fix, not-found state, rule health re-poll, and View alerts pivot ([#2831](https://github.com/opensearch-project/dashboards-observability/pull/2831))
* Humanize SLO listing state labels, stabilize numeric formatting, fix paginated sort, and add skeleton rows ([#2830](https://github.com/opensearch-project/dashboards-observability/pull/2830))
* Localize SLO percent formatting and make SLO_PRECISION the single precision policy ([#2836](https://github.com/opensearch-project/dashboards-observability/pull/2836))
* Make SLO overview firing/breached tiles consistent, clamp budget hero at 0, and improve KPI accessibility ([#2833](https://github.com/opensearch-project/dashboards-observability/pull/2833))
* Remove nested interactive controls, enforce minimum 24px touch targets, and add aria-expanded to tree controls ([#2834](https://github.com/opensearch-project/dashboards-observability/pull/2834))
* Refine correlated dashboards flyout table caption to match spans/logs tab descriptions ([#2893](https://github.com/opensearch-project/dashboards-observability/pull/2893))
* Copy Explore PromQL query into metrics rule flyout with real range-query preview ([#2862](https://github.com/opensearch-project/dashboards-observability/pull/2862))
* Add optimistic pending-rule cache so newly created Prometheus rules appear immediately in the rules list ([#2866](https://github.com/opensearch-project/dashboards-observability/pull/2866))
* Add point-and-click PromQL condition builder with lossless Builder/Code round-trip for metric rules ([#2870](https://github.com/opensearch-project/dashboards-observability/pull/2870))
* Redesign Prometheus rule creation flyout with Builder/Code toggle, rule group configuration, and safe group merging ([#2796](https://github.com/opensearch-project/dashboards-observability/pull/2796))

### Bug Fixes

* Harden APM Services, Overview, Operations, Dependencies, and Topology pages for high cardinality at scale ([#2860](https://github.com/opensearch-project/dashboards-observability/pull/2860))
* Consolidate unified-alerting accessibility, theme, and i18n fixes for alerts list, flyout, and rules table ([#2879](https://github.com/opensearch-project/dashboards-observability/pull/2879))
* Fix SLO listing filters, workspace-scoped coverage, and extract shared TruncatedLabel component ([#2810](https://github.com/opensearch-project/dashboards-observability/pull/2810))
* Remove broken Maximize panel action on notebook visualizations ([#2824](https://github.com/opensearch-project/dashboards-observability/pull/2824))
* Fix clone and edit of monitors in the unified Alerts view, including cluster-metrics and per-bucket types ([#2871](https://github.com/opensearch-project/dashboards-observability/pull/2871))
* Add Builder/Code toggle and overwrite guard to the Prometheus edit flyout to prevent silent expression data loss ([#2882](https://github.com/opensearch-project/dashboards-observability/pull/2882))
* Fix clone and edit from corrupting Prometheus rule expressions and silently overwriting rules ([#2877](https://github.com/opensearch-project/dashboards-observability/pull/2877))
* Left-align facet filter titles and keep group count inline ([#2885](https://github.com/opensearch-project/dashboards-observability/pull/2885))
* Fix correlated logs and spans filters to search all results instead of only the visible page ([#2891](https://github.com/opensearch-project/dashboards-observability/pull/2891))
* Fix service detail tables re-rendering and re-fetching charts on latency percentile switch ([#2842](https://github.com/opensearch-project/dashboards-observability/pull/2842))
* Exclude exponentiation-operator Babel transform to fix BigInt test failures ([#2802](https://github.com/opensearch-project/dashboards-observability/pull/2802))
* Fix Trace Analytics dashboard latencyTrends request using wrong data source on external clusters ([#2803](https://github.com/opensearch-project/dashboards-observability/pull/2803))
* Fix notification channel picker not loading channels by using the correct notifications API route ([#2848](https://github.com/opensearch-project/dashboards-observability/pull/2848))
* Tolerate text/plain wrapped empty-namespace 404 on first Prometheus rule creation ([#2884](https://github.com/opensearch-project/dashboards-observability/pull/2884))
* Bind sample notebook paragraphs to the data source selected in the modal ([#2865](https://github.com/opensearch-project/dashboards-observability/pull/2865))
* Fix sample notebook visualizations failing to render due to literal "undefined" saved object id ([#2861](https://github.com/opensearch-project/dashboards-observability/pull/2861))
* Fix duplicated Observability Dashboard sharing the original's id, preventing deletion ([#2869](https://github.com/opensearch-project/dashboards-observability/pull/2869))
* Preserve table page across latency percentile switch in APM Operations and Dependencies ([#2851](https://github.com/opensearch-project/dashboards-observability/pull/2851))

### Infrastructure

* Fix code-coverage GitHub Action ([#2888](https://github.com/opensearch-project/dashboards-observability/pull/2888))
* Fix date-picker double-write 409 that flakes the PPL-filter Cypress test ([#2858](https://github.com/opensearch-project/dashboards-observability/pull/2858))
* Pin Cypress to 13.17.0 in FTR e2e workflow to fix CI failures from Cypress 16 breaking changes ([#2854](https://github.com/opensearch-project/dashboards-observability/pull/2854))
* Mock serviceNodeKey in services_home test to fix broken build-linux ([#2890](https://github.com/opensearch-project/dashboards-observability/pull/2890))

### Maintenance

* Add Riya Saxena (riysaxen-amzn) as a maintainer ([#2857](https://github.com/opensearch-project/dashboards-observability/pull/2857))
* Improve APM Services environment filter UX with search, truncation, and scroll ([#2880](https://github.com/opensearch-project/dashboards-observability/pull/2880))
* Improve APM Topology Map environment filter UX to match Services page filters ([#2887](https://github.com/opensearch-project/dashboards-observability/pull/2887))
* Simplify Alerts Manager routing tab header by removing redundant status panel ([#2818](https://github.com/opensearch-project/dashboards-observability/pull/2818))
* Bump linkify-it to 5.0.2 and fast-uri to 3.1.7 to remediate six high-severity CVEs ([#2873](https://github.com/opensearch-project/dashboards-observability/pull/2873))
* Bump brace-expansion from 1.1.15 to 1.1.16 ([#2793](https://github.com/opensearch-project/dashboards-observability/pull/2793))
* Bump dompurify from 3.4.12 to 3.4.13 ([#2806](https://github.com/opensearch-project/dashboards-observability/pull/2806))
* Bump fast-uri from 3.1.2 to 3.1.4 ([#2792](https://github.com/opensearch-project/dashboards-observability/pull/2792))
* Bump js-yaml from 4.3.0 to 4.3.1 ([#2807](https://github.com/opensearch-project/dashboards-observability/pull/2807))
* Bump js-yaml from 4.3.1 to 4.3.2 ([#2875](https://github.com/opensearch-project/dashboards-observability/pull/2875))
* Increment version to 3.9.0.0 ([#2808](https://github.com/opensearch-project/dashboards-observability/pull/2808))
* Clean up dependency resolutions, align with OpenSearch Dashboards 3.8, and address CVEs ([#2800](https://github.com/opensearch-project/dashboards-observability/pull/2800))
* Fix release notes link checker by replacing nonexistent PR link with commit link ([#2852](https://github.com/opensearch-project/dashboards-observability/pull/2852))
* Promote APM range-filter gate flags from refs to state and add re-render regression tests ([#2856](https://github.com/opensearch-project/dashboards-observability/pull/2856))

### Refactoring

* Dead-code sweep of the unified Alerts view, removing ~4,500 lines of unreachable code ([#2876](https://github.com/opensearch-project/dashboards-observability/pull/2876))
* Remove unreachable schema defaults in notebook paraRouter ([#2872](https://github.com/opensearch-project/dashboards-observability/pull/2872))
* Rename 'Cortex' references to 'Prometheus' for consistent terminology ([#2853](https://github.com/opensearch-project/dashboards-observability/pull/2853))
