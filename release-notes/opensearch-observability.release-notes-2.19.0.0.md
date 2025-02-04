## Version 2.19.0 Release Notes

Compatible with OpenSearch and OpenSearch Dashboards version 2.19.0

### Features

- Remove the maxFilesPerTrigger limits for VPC MV ([#2318](https://github.com/opensearch-project/dashboards-observability/pull/2318))
- Gantt chart / Span list rework ([#2283](https://github.com/opensearch-project/dashboards-observability/pull/2283))
- Update redirection/Focus field rework ([#2264](https://github.com/opensearch-project/dashboards-observability/pull/2264))
- Notebooks updates ([#2255](https://github.com/opensearch-project/dashboards-observability/pull/2255))
- Overview page add state for missing data source ([#2237](https://github.com/opensearch-project/dashboards-observability/pull/2237))
- Service map updates ([#2230](https://github.com/opensearch-project/dashboards-observability/pull/2230))

### Bug Fixes

- [Bug] Add loading status to all pages in traces and services pages ([#2336](https://github.com/opensearch-project/dashboards-observability/pull/2336))
- Add MDS support for missing datasourceId in traceGroup requests ([#2333](https://github.com/opensearch-project/dashboards-observability/pull/2333))
- Traces - Filter Adjustment and DataGrid abstraction ([#2321](https://github.com/opensearch-project/dashboards-observability/pull/2321))
- Remove redundant traces call for related services ([#2315](https://github.com/opensearch-project/dashboards-observability/pull/2315))
- Traces/Services - Query optimization / UI setting / Bugfix ([#2310](https://github.com/opensearch-project/dashboards-observability/pull/2310))
- Update latest github links in maintainer doc ([#2304](https://github.com/opensearch-project/dashboards-observability/pull/2304))
- Traces custom source - Bug Fixes ([#2298](https://github.com/opensearch-project/dashboards-observability/pull/2298))
- Gantt Chart / Service Map followup ([#2294](https://github.com/opensearch-project/dashboards-observability/pull/2294))
- Fix flaky cypress tests ([#2293](https://github.com/opensearch-project/dashboards-observability/pull/2293))
- Fix SQL/PPL crash with incorrect query ([#2284](https://github.com/opensearch-project/dashboards-observability/pull/2284))
- Fix notebook routes for savedNotebook endpoints ([#2279](https://github.com/opensearch-project/dashboards-observability/pull/2279))
- Updated notebooks reporting button render ([#2278](https://github.com/opensearch-project/dashboards-observability/pull/2278))
- Fix fetching workspace visualizations error ([#2268](https://github.com/opensearch-project/dashboards-observability/pull/2268))
- Replace index mapping with field caps API for trace filters ([#2246](https://github.com/opensearch-project/dashboards-observability/pull/2246))
- Metrics datasource ([#2242](https://github.com/opensearch-project/dashboards-observability/pull/2242))
- Use savedObjects client to fetch notebook visualizations ([#2241](https://github.com/opensearch-project/dashboards-observability/pull/2241))
- Fix mds ref update on integration assets ([#2240](https://github.com/opensearch-project/dashboards-observability/pull/2240))
- Return 503 if opensearch calls failed ([#2238](https://github.com/opensearch-project/dashboards-observability/pull/2238))
- [BUG-Fixed] #1466 - create observability dashboard after invalid name ([#1928](https://github.com/opensearch-project/dashboards-observability/pull/1928))
- [Bug fix] Traces/Services bugfixes and UI update ([#2235](https://github.com/opensearch-project/dashboards-observability/pull/2235))

### Infrastructure

- Remove fallback restore keys from build cache ([#2228](https://github.com/opensearch-project/dashboards-observability/pull/2228))

### Documentation

- SOP for Integration and Vended Dashabords Setup ([#2299](https://github.com/opensearch-project/dashboards-observability/pull/2299))

### Maintenance

- Bump nanoid to 3.3.8 ([#2328](https://github.com/opensearch-project/dashboards-observability/pull/2328))
- Bump cross-spawn to 7.0.5 ([#2322](https://github.com/opensearch-project/dashboards-observability/pull/2322))
- Downgrade cypress to 12.17.4 ([#2306](https://github.com/opensearch-project/dashboards-observability/pull/2306))
- Configure OpenSearch Dashboards before running in CI ([#2291](https://github.com/opensearch-project/dashboards-observability/pull/2291))
- Panels updates ([#2285](https://github.com/opensearch-project/dashboards-observability/pull/2285))
- Fix flaky notebooks test ([#2280](https://github.com/opensearch-project/dashboards-observability/pull/2280))
- Event explorer updates ([#2275](https://github.com/opensearch-project/dashboards-observability/pull/2275))
- Metrics updates ([#2269](https://github.com/opensearch-project/dashboards-observability/pull/2269))
- Fix flaky render of spans table tests ([#2263](https://github.com/opensearch-project/dashboards-observability/pull/2263))
- App analytics updates ([#2261](https://github.com/opensearch-project/dashboards-observability/pull/2261))
- Separate uploaded cypress artifacts for actions/upload-artifact@v4 ([#2259](https://github.com/opensearch-project/dashboards-observability/pull/2259))
- Trace analytics updates ([#2251](https://github.com/opensearch-project/dashboards-observability/pull/2251))
- Increment version to 2.19.0.0 ([#2271](https://github.com/opensearch-project/dashboards-observability/pull/2271))
