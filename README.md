<img src="https://opensearch.org/assets/img/opensearch-logo-themed.svg" height="64px">

- [Observability](#observability)
- [Code Summary](#code-summary)
- [Plugin Components](#plugin-components)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Getting Help](#getting-help)
- [Code of Conduct](#code-of-conduct)
- [Security](#security)
- [License](#license)
- [Copyright](#copyright)

# Observability

Observability is collection of plugins and applications that let you visualize data-driven events by using Piped Processing Language to explore, discover, and query data stored in OpenSearch.

## Code Summary                                                                                      |

### Dashboards-Observability

|                          |                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Test and build           | [![Observability Dashboards CI][dashboard-build-badge]][dashboard-build-link]                                      |
| Code coverage            | [![codecov][dashboard-codecov-badge]][codecov-link]                                                                |
| Distribution build tests | [![cypress tests][cypress-test-badge]][cypress-test-link] [![cypress code][cypress-code-badge]][cypress-code-link] |

### Repository Checks

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| DCO Checker  | [![Developer certificate of origin][dco-badge]][dco-badge-link] |
| Link Checker | [![Link Checker][link-check-badge]][link-check-link]            |

### Issues

|                                                                |
| -------------------------------------------------------------- |
| [![good first issues open][good-first-badge]][good-first-link] |
| [![features open][feature-badge]][feature-link]                |
| [![enhancements open][enhancement-badge]][enhancement-link]    |
| [![bugs open][bug-badge]][bug-link]                            |
| [![untriaged open][untriaged-badge]][untriaged-link]           |
| [![nolabel open][nolabel-badge]][nolabel-link]                 |

[dco-badge]: https://github.com/opensearch-project/dashboards-observability/actions/workflows/dco.yml/badge.svg
[dco-badge-link]: https://github.com/opensearch-project/dashboards-observability/actions/workflows/dco.yml
[link-check-badge]: https://github.com/opensearch-project/dashboards-observability/actions/workflows/link-checker.yml/badge.svg
[link-check-link]: https://github.com/opensearch-project/dashboards-observability/actions/workflows/link-checker.yml
[dashboard-build-badge]: https://github.com/opensearch-project/dashboards-observability/actions/workflows/dashboards-observability-test-and-build-workflow.yml/badge.svg
[dashboard-build-link]: https://github.com/opensearch-project/dashboards-observability/actions/workflows/dashboards-observability-test-and-build-workflow.yml
[dashboard-codecov-badge]: https://codecov.io/gh/opensearch-project/dashboards-observability/branch/main/graphs/badge.svg?flag=dashboards-observability
[codecov-link]: https://codecov.io/gh/opensearch-project/dashboards-observability
[cypress-test-badge]: https://img.shields.io/badge/Cypress%20tests-in%20progress-yellow
[cypress-test-link]: https://github.com/opensearch-project/opensearch-build/issues/1124
[cypress-code-badge]: https://img.shields.io/badge/Cypress%20code-blue
[cypress-code-link]: https://github.com/opensearch-project/dashboards-observability/blob/main/dashboards-observability/.cypress/CYPRESS_TESTS.md
[opensearch-it-badge]: https://img.shields.io/badge/OpenSearch%20Plugin%20IT%20tests-in%20progress-yellow
[opensearch-it-link]: https://github.com/opensearch-project/opensearch-build/issues/1124
[opensearch-it-code-badge]: https://img.shields.io/badge/OpenSearch%20IT%20code-blue
[bwc-tests-badge]: https://img.shields.io/badge/BWC%20tests-in%20progress-yellow
[bwc-tests-link]: https://github.com/opensearch-project/dashboards-observability/issues/276
[good-first-badge]: https://img.shields.io/github/issues/opensearch-project/dashboards-observability/good%20first%20issue.svg
[good-first-link]: https://github.com/opensearch-project/dashboards-observability/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22+
[feature-badge]: https://img.shields.io/github/issues/opensearch-project/dashboards-observability/feature.svg
[feature-link]: https://github.com/opensearch-project/dashboards-observability/issues?q=is%3Aopen+is%3Aissue+label%3Afeature
[bug-badge]: https://img.shields.io/github/issues/opensearch-project/dashboards-observability/bug.svg
[bug-link]: https://github.com/opensearch-project/dashboards-observability/issues?q=is%3Aopen+is%3Aissue+label%3Abug+
[enhancement-badge]: https://img.shields.io/github/issues/opensearch-project/dashboards-observability/enhancement.svg
[enhancement-link]: https://github.com/opensearch-project/dashboards-observability/issues?q=is%3Aopen+is%3Aissue+label%3Aenhancement+
[untriaged-badge]: https://img.shields.io/github/issues/opensearch-project/dashboards-observability/untriaged.svg
[untriaged-link]: https://github.com/opensearch-project/dashboards-observability/issues?q=is%3Aopen+is%3Aissue+label%3Auntriaged+
[nolabel-badge]: https://img.shields.io/github/issues-search/opensearch-project/dashboards-observability?color=yellow&label=no%20label%20issues&query=is%3Aopen%20is%3Aissue%20no%3Alabel
[nolabel-link]: https://github.com/opensearch-project/dashboards-observability/issues?q=is%3Aopen+is%3Aissue+no%3Alabel+

## Plugin Components

### Trace Analytics

Trace Analytics page provides instant on dashboards in OpenSearch Dashboards for users to quickly analyze their logs. The plugin uses aggregated results from two indices, `otel-v1-apm-span-*` and `otel-v1-apm-service-map*` created by the otel-trace-raw-processor and service-map-processor, and renders three main views:

1. Dashboard: an overview of the trace groups and three charts: error rate, throughput, service map.

1. Traces: a table of top-level traces with unique trace id's, where users can click on any trace to see its end-to-end performance metrics, service performance metrics, and a span latency metrics in a Gantt chart.

1. Services: a table of the services, where users can click on a service to see its performance metrics and related services.

Additionally the fields can be sorted and filtered.

### Event Analytics

Event Analytics allows user to monitor, correlate, analyze and visualize machine generated data through [Piped Processing Language](https://opensearch.org/docs/latest/observability-plugins/ppl/index/). It also enables the user to turn data-driven events into visualizations and save frequently used ones for quick access.

### Metrics Analytics

Metrics Analytics allows ingesting and visualize metric data from log data aggregated within OpenSearch, allowing you to analyze and correlate data across logs, traces, and metrics.
Previously, you could ingest and visualize only logs and traces from your monitored environments. Using Metrics Analytics one can observe your digital assets with more granularity, gain deeper insight into the health of your infrastructure, and better inform your root cause analysis.

### Operational Panels

Operational panels provides the users to create and view different visualizations on ingested observability data, using Piped Processing Language queries. Use PPL 'where clauses' and datetime timespans to filter all visualizations in the panel.

### Notebooks

Dashboards offer a solution for a few selected use cases, and are great tools if you’re focused on monitoring a known set of metrics over time. Notebooks enables contextual use of data with detailed explanations by allowing a user to combine saved visualizations, text, graphs and decorate data with other reference data sources.

### Integrations
Integration is a new type of logical component that allows high level composition of multiple Dashboards / Applications / Queries and more. Integrations can be used to bring together all the metrics and logs from the infrastructure and gain insight into the unified system as a whole.

---

Integration usually consist of the following assets:
- dashboards & visualization 
- schema configuration (mapping & templates)
- data on-boarding (sample data)

[See Integration Documentation](https://github.com/opensearch-project/dashboards-observability/wiki/Integration-Documentation-Reference)

[See Integration Tutorial](https://github.com/opensearch-project/dashboards-observability/wiki/Integration-Creation-Guide)

Please See additional information [documentation](https://opensearch.org/docs/latest/integrations/index)

> Integration Spec [RFC](https://github.com/opensearch-project/OpenSearch-Dashboards/issues/3412#schema-support-for-observability)

### Observability Correlation
In order to be able to correlate information across different signal (represented in different indices) we introduced the notion of correlation into the schema. This information is represented explicitly in both the declarative schema file and the physical mapping file.
Using this metadata information will enable the knowledge to be projected and allow for analytic engine to produce a join query that will take advantage of these relationships.

The Observability dashboard vision of [telemetry Data Correlation](https://github.com/opensearch-project/dashboards-observability/wiki/Observability-Future-Vision)

---
## WIKI Home
Please see our WIKI page for additional information [WIKI](https://opensearch.org/docs/latest/observability/index/) to learn more about our features.

## Documentation
Please see our technical [documentation](https://opensearch.org/docs/latest/observability/index/) to learn more about its features.

## Contributing
- See [developer guide](DEVELOPER_GUIDE.md) and [how to contribute to this project](CONTRIBUTING.md).
- See [Integration Contribution Guide](https://github.com/opensearch-project/dashboards-observability/wiki/Integration-Creation-Guide) for integration creation additional context

## Getting Help

If you find a bug, or have a feature request, please don't hesitate to open an issue in this repository.

For more information, see [project website](https://opensearch.org/) and [documentation](https://opensearch.org/docs). If you need help and are unsure where to open an issue, try the [Forum](https://forum.opensearch.org/c/plugins/observability/49).

## Code of Conduct

This project has adopted the [Amazon Open Source Code of Conduct](CODE_OF_CONDUCT.md). For more information see the [Code of Conduct FAQ](https://aws.github.io/code-of-conduct-faq), or contact [opensource-codeofconduct@amazon.com](mailto:opensource-codeofconduct@amazon.com) with any additional questions or comments.

## Security

If you discover a potential security issue in this project we ask that you notify AWS/Amazon Security via our [vulnerability reporting page](http://aws.amazon.com/security/vulnerability-reporting/). Please do **not** create a public GitHub issue.

## License

This project is licensed under the [Apache v2.0 License](LICENSE).

## Copyright

Copyright OpenSearch Contributors. See [NOTICE](NOTICE) for details.

## Screenshots

<video src='https://github.com/opensearch-project/dashboards-observability/assets/48943349/8c918fce-35b8-4824-ae2d-6881aad7b9a2' width=180/>

