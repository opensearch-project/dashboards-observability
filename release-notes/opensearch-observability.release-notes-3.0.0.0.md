## Version 3.0.0 Release Notes

Compatible with OpenSearch and OpenSearch Dashboards version 3.0.0

### Breaking Changes

- Remove support for legacy notebooks ([#2406](https://github.com/opensearch-project/dashboards-observability/pull/2406))

### Bug Fixes

- Traces - Custom Traces mode pagination reset ([#2437](https://github.com/opensearch-project/dashboards-observability/pull/2437))
- fix(notebook): fix set_paragraphs API ([#2417](https://github.com/opensearch-project/dashboards-observability/pull/2417))
- [Bug] Notebooks - Action popover ([#2418](https://github.com/opensearch-project/dashboards-observability/pull/2418))
- Fix link checker 404 and update the table of content in README ([#2413](https://github.com/opensearch-project/dashboards-observability/pull/2413))
- Cypress - Config fix ([#2408](https://github.com/opensearch-project/dashboards-observability/pull/2408))
- Application Analytics - Flaky cypress fix ([#2402](https://github.com/opensearch-project/dashboards-observability/pull/2402))
- Traces table fix for invalid date ([#2399](https://github.com/opensearch-project/dashboards-observability/pull/2399))
- Custom Traces- Sorting/Toast ([#2397](https://github.com/opensearch-project/dashboards-observability/pull/2397))
- Event Analytics - Cypress flaky fix ([#2395](https://github.com/opensearch-project/dashboards-observability/pull/2395))
- Services to Traces - Flyout redirection ([#2392](https://github.com/opensearch-project/dashboards-observability/pull/2392))
- [Bug] Traces/Services remove toast message on empty data ([#2346](https://github.com/opensearch-project/dashboards-observability/pull/2346))
- Restore spans limit to 3000 in trace view ([#2353](https://github.com/opensearch-project/dashboards-observability/pull/2353))
- [BUG] Updated cache for the sub tree in Workbench ([#2351](https://github.com/opensearch-project/dashboards-observability/pull/2351))
- Trace Groups Optimization - Remove duplicate filters ([#2368](https://github.com/opensearch-project/dashboards-observability/pull/2368))
- [Bug] Traces redirection while QA enabled ([#2369](https://github.com/opensearch-project/dashboards-observability/pull/2369))

### Enhancements

- Traces - Add "attributes" field ([#2432](https://github.com/opensearch-project/dashboards-observability/pull/2432))
- Traces - Update custom source toast/error/sorting ([#2407](https://github.com/opensearch-project/dashboards-observability/pull/2407))
- Adding Amazon Network Firewall Integration ([#2410](https://github.com/opensearch-project/dashboards-observability/pull/2410))
- Traces - Update custom source display, add toast ([#2403](https://github.com/opensearch-project/dashboards-observability/pull/2403))
- Trace to logs correlation, action icon updates ([#2398](https://github.com/opensearch-project/dashboards-observability/pull/2398))
- Traces - Custom source switch to data grid ([#2390](https://github.com/opensearch-project/dashboards-observability/pull/2390))
- Service Content/View Optimizationsc ([#2383](https://github.com/opensearch-project/dashboards-observability/pull/2383))
- Database selector in "Set Up Integration" page ([#2380](https://github.com/opensearch-project/dashboards-observability/pull/2380))
- Support custom logs correlation ([#2375](https://github.com/opensearch-project/dashboards-observability/pull/2375))

### Infrastructure

- Improve error handling when setting up and reading a new integration ([#2387](https://github.com/opensearch-project/dashboards-observability/pull/2387))
- Improve the test results for Integrations internals ([#2376](https://github.com/opensearch-project/dashboards-observability/pull/2376))

### Maintenance

- [Doc] Update the integraiton SOP to reference to dashbaords observability only ([#2412](https://github.com/opensearch-project/dashboards-observability/pull/2412))
- Adding husky .only check hook to test files ([#2400](https://github.com/opensearch-project/dashboards-observability/pull/2400))
- Remove cypress to make it refer to the version used in OpenSearch Dashboard to fix build failure ([#2405](https://github.com/opensearch-project/dashboards-observability/pull/2405))
- Fix CVE issue for dependency prismjs ([#2404](https://github.com/opensearch-project/dashboards-observability/pull/2404))
- Bump dashboards observability to version 3.0.0.0-beta1 ([#2401](https://github.com/opensearch-project/dashboards-observability/pull/2401))
- Update README.md for unblocking PRs to be merged ([#2394](https://github.com/opensearch-project/dashboards-observability/pull/2394))
- Bump dep serialize-javascript version to 6.0.2 and @babel/runtime to 7.26.10 ([#2389](https://github.com/opensearch-project/dashboards-observability/pull/2389))
- Minor CI updates and workflow fixes ([#2388](https://github.com/opensearch-project/dashboards-observability/pull/2388))
- TraceView - Optimization of queries ([#2349](https://github.com/opensearch-project/dashboards-observability/pull/2349))
- [Integration] Remove maxFilesPerTrigger from all the integrations queries ([#2354](https://github.com/opensearch-project/dashboards-observability/pull/2354))
- Bump dashboards observability to version 3.0.0.0-alpha1 ([#2364](https://github.com/opensearch-project/dashboards-observability/pull/2364))
- ServiceMap Query Optimizations ([#2367](https://github.com/opensearch-project/dashboards-observability/pull/2367))
- Increase dashboards timeout & store logs on failure ([#2371](https://github.com/opensearch-project/dashboards-observability/pull/2371))
- Clear ADMINS.md. ([#2363](https://github.com/opensearch-project/dashboards-observability/pull/2363))
