## Version 3.0.0-beta1 Release Notes

Compatible with OpenSearch and OpenSearch Dashboards version 3.0.0-beta1

### Breaking Changes
- Remove support for legacy notebooks ([#2406](https://github.com/opensearch-project/dashboards-observability/pull/2406))

### Bug Fixes
- Application Analytics - Flaky cypress fix ([#2402](https://github.com/opensearch-project/dashboards-observability/pull/2402))
- Traces table fix for invalid date ([#2399](https://github.com/opensearch-project/dashboards-observability/pull/2399))
- Custom Traces- Sorting/Toast ([#2397](https://github.com/opensearch-project/dashboards-observability/pull/2397))
- Event Analytics - Cypress flaky fix ([#2395](https://github.com/opensearch-project/dashboards-observability/pull/2395))
- Services to Traces - Flyout redirection ([#2392](https://github.com/opensearch-project/dashboards-observability/pull/2392))

### Enhancements
- Traces - Update custom source display, add toast ([#2403](https://github.com/opensearch-project/dashboards-observability/pull/2403))
- Trace to logs correlation, action icon updates ([#2398](https://github.com/opensearch-project/dashboards-observability/pull/2398))
- Traces - Custom source switch to data grid ([#2390](https://github.com/opensearch-project/dashboards-observability/pull/2390))
- Service Content/View Optimizationsc ([#2383](https://github.com/opensearch-project/dashboards-observability/pull/2383))
- Database selector in "Set Up Integration" page ([#2380](https://github.com/opensearch-project/dashboards-observability/pull/2380))
- Support custom logs correlation ([#2375] (https://github.com/opensearch-project/dashboards-observability/pull/2375))

### Infrastructure
- Improve error handling when setting up and reading a new integration ([#2387](https://github.com/opensearch-project/dashboards-observability/pull/2387))

### Maintenance
- Adding husky .only check hook to test files ([#2400](https://github.com/opensearch-project/dashboards-observability/pull/2400))
- Remove cypress to make it refer to the version used in OpenSearch Dashboard to fix build failure ([#2405](https://github.com/opensearch-project/dashboards-observability/pull/2405))
- Fix CVE issue for dependency prismjs ([#2404](https://github.com/opensearch-project/dashboards-observability/pull/2404))
- Bump dashboards observability to version 3.0.0.0-beta1 ([#2401](https://github.com/opensearch-project/dashboards-observability/pull/2401))
- Update README.md for unblocking PRs to be merged ([#2394](https://github.com/opensearch-project/dashboards-observability/pull/2394))
- Bump dep serialize-javascript version to 6.0.2 and @babel/runtime to 7.26.10 ([#2389](https://github.com/opensearch-project/dashboards-observability/pull/2389))
- Minor CI updates and workflow fixes ([#2388](https://github.com/opensearch-project/dashboards-observability/pull/2388))