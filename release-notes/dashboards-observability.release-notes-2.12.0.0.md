## Version 2.12.0.0 Release Notes

Compatible with OpenSearch and OpenSearch Dashboards Version 2.12.0

### Features
* Add redirect with error message if integrations template not found ([#1418](https://github.com/opensearch-project/dashboards-observability/pull/1418))
* Enable data grid in Chatbot ([#1383](https://github.com/opensearch-project/dashboards-observability/pull/1383))
* Support Query assist ([#1369](https://github.com/opensearch-project/dashboards-observability/pull/1369))
* Allow patch on allowedRoles ([#1144](https://github.com/opensearch-project/dashboards-observability/pull/1144))
* Enable ppl visualization in Chatbot ([#1374](https://github.com/opensearch-project/dashboards-observability/pull/1374))
* Added HAProxy Integration ([#1277](https://github.com/opensearch-project/dashboards-observability/pull/1277))

### Bug Fixes
* Change class name to decouple styling from discover ([#1427](https://github.com/opensearch-project/dashboards-observability/pull/1427))
* Add modal for DQL language ([#1422](https://github.com/opensearch-project/dashboards-observability/pull/1422))
* fixing panel PPL filters not being added ([#1419](https://github.com/opensearch-project/dashboards-observability/pull/1419))
* Hide query assist UI if PPL agent is not created ([#1400](https://github.com/opensearch-project/dashboards-observability/pull/1400))
* Fix trace link in event viewer ([#1396](https://github.com/opensearch-project/dashboards-observability/pull/1396))
* Fix command syntax error for ppl_docs ([#1372](https://github.com/opensearch-project/dashboards-observability/pull/1372))
* Update snapshots for upstream changes ([#1353](https://github.com/opensearch-project/dashboards-observability/pull/1353))
* Fix for explorer data grid not paginating ([#1140](https://github.com/opensearch-project/dashboards-observability/pull/1140))
* Update URL of create datasources, fix spacing([#1153](https://github.com/opensearch-project/dashboards-observability/pull/1153))
* Disable integration set up button if invalid ([#1160](https://github.com/opensearch-project/dashboards-observability/pull/1160))
* Switch from toast to callout for integration set up failures ([#1158](https://github.com/opensearch-project/dashboards-observability/pull/1158))
* Fix integration labeling to identify S3 integrations ([#1165](https://github.com/opensearch-project/dashboards-observability/pull/1165))
* Correct date pass-through on Notebook Visualizations ([#1327](https://github.com/opensearch-project/dashboards-observability/pull/1327))
* Fix for Notebook Observability Visualization loading ([#1312](https://github.com/opensearch-project/dashboards-observability/pull/1312))
* Fix metrics loading loop ([#1309](https://github.com/opensearch-project/dashboards-observability/pull/1309))
* Fix explorer stats function typing crash ([#1429](https://github.com/opensearch-project/dashboards-observability/pull/1429))

### Enhancements
* Updating app analytics jest and cypress tests ([#1417](https://github.com/opensearch-project/dashboards-observability/pull/1417))
* Hide dot indices for query assist ([#1413](https://github.com/opensearch-project/dashboards-observability/pull/1413))
* Optimize searches for integration data ([#1406](https://github.com/opensearch-project/dashboards-observability/pull/1406))
* Add Index-based adaptor for integrations ([#1399](https://github.com/opensearch-project/dashboards-observability/pull/1399))
* Optimize images in integrations repository ([#1395](https://github.com/opensearch-project/dashboards-observability/pull/1395))
* JSON Catalog Reader for Integrations ([#1392](https://github.com/opensearch-project/dashboards-observability/pull/1392))
* Improve lint workflow to avoid fast fail ([#1384](https://github.com/opensearch-project/dashboards-observability/pull/1384))
* Stop filtering stats by for data grid ([#1385](https://github.com/opensearch-project/dashboards-observability/pull/1385))
* Update notebooks snapshots and cypress ([#1375](https://github.com/opensearch-project/dashboards-observability/pull/1375))
* Revise and edit PPL in-product documentation ([#1368](https://github.com/opensearch-project/dashboards-observability/pull/1368))
* Refactor data sources cypress tests ([#1351](https://github.com/opensearch-project/dashboards-observability/pull/1351))
* Separate linting rules for cypress ([#1348](https://github.com/opensearch-project/dashboards-observability/pull/1348))
* Remove manual refresh for S3 integrations ([#1227](https://github.com/opensearch-project/dashboards-observability/pull/1227))
* Notebook jest updates ([#1346](https://github.com/opensearch-project/dashboards-observability/pull/1346))
* Sync dependencies with latest versions ([#1345](https://github.com/opensearch-project/dashboards-observability/pull/1345))
* Removes Zeppelin code and docs ([#1340](https://github.com/opensearch-project/dashboards-observability/pull/1340))
* Metrics explore updated with PromQL ([#1303](https://github.com/opensearch-project/dashboards-observability/pull/1303))
* Updated naming convention for HAProxy Integration ([#1284](https://github.com/opensearch-project/dashboards-observability/pull/1284))
* Style changes for rendering fullscreen data grid ([#1279](https://github.com/opensearch-project/dashboards-observability/pull/1279))

### Infrastructure
* Add FTR workflow for dashboards observability ([#1334](https://github.com/opensearch-project/dashboards-observability/pull/1334))
* Fix no matching issue corner case for lint CI ([#1326](https://github.com/opensearch-project/dashboards-observability/pull/1326))
* Add enforce-labels action ([#1330](https://github.com/opensearch-project/dashboards-observability/pull/1330))
* Linter CI ([#1313](https://github.com/opensearch-project/dashboards-observability/pull/1313))
* Refactor Cypress Workflow ([#1299](https://github.com/opensearch-project/dashboards-observability/pull/1299))

### Documentation
* Use approved svg from UX in ([#1066](https://github.com/opensearch-project/dashboards-observability/pull/1066))
* add docker-compose.yml testing and readme for integration to 2.9 in ([#923](https://github.com/opensearch-project/dashboards-observability/pull/923))
* Correct doc link ([#1336](https://github.com/opensearch-project/dashboards-observability/pull/1336))
* Integrations integration test fixes ([#1331](https://github.com/opensearch-project/dashboards-observability/pull/1331))
