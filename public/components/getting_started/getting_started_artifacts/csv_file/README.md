# CSV Upload Integration

>  CSV File based Upload Integration 

## What is CSV Upload ?

CSV upload is an example of parsing and loading a CSV file into opensearch index using an agent

## What is CSV Integration ?

An integration is a bundle of pre-canned assets which are bundled togather in a meaningful manner.

**_CSV Upload_** integration includes docker live example including getting started instruction of using data-prepper or fluent-bit for
uploading the csv file into a dedicated index using a parser to transform the csv into json

## Ingesting CVS Using Data-Prepper
 ...

## Ingesting CVS Using Flunet-Bit

...

---
## Loading Integrations via DashboardManagement

To update an integration template navigate to the DashboardManagement and select [savedObjects](https://localhost:5601/_dashboards/app/management/opensearch-dashboards/objects) and import the new artifact:

1) Download the `nginx-1.0.0.ndjson` artifact from the [catalog release page](https://github.com/opensearch-project/opensearch-catalog/releases/edit/nginx-1.0.0)

2) Go to the [DashboardManagement -> savedObjects ](https://localhost:5601/_dashboards/app/management/opensearch-dashboards/objects)

![](https://github.com/opensearch-project/opensearch-catalog/assets/48943349/d96e9a78-e3de-4cce-ba66-23f7c084778d)

![](https://github.com/opensearch-project/opensearch-catalog/assets/48943349/a63ae102-706a-4980-b758-fff7f6b24a94)

3) Once there select import to load the recently downloaded integration artifact (`nginx-1.0.0.ndjson` suffix)

4) Open the [nginx integration](https://localhost:5601/app/integrations#/available/nginx) and install
