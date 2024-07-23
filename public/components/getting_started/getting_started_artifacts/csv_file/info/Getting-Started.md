# Uploading a CSV File into an OpenSearch Index Using Fluent Bit

This tutorial will guide you through the process of setting up Fluent Bit to monitor a directory for CSV files and upload their contents into an OpenSearch index.

## Prerequisites

- An OpenSearch instance running and accessible.
- Fluent Bit installed on your system.
- A directory containing your CSV files.

## Step 1: Install Fluent Bit

### On Linux:

```bash
curl -L https://fluentbit.io/releases/1.8/fluent-bit-1.8.11-linux-x86_64.tar.gz -o fluent-bit.tar.gz
tar -xvf fluent-bit.tar.gz
cd fluent-bit/bin
```

### On macOS:

```bash
brew install fluent-bit
```

### On Windows:

Download and extract Fluent Bit from [Fluent Bit releases](https://fluentbit.io/download/).

## Step 2: Create Fluent Bit Configuration Files

#### Create `fluent-bit.conf`

This is the main configuration file for Fluent Bit. It defines the input source, parser, and output destination.

```ini
[SERVICE]
    Flush        1
    Log_Level    info
    Parsers_File parsers.conf

[INPUT]
    Name         tail
    Path         /path/to/your/csv/files/*.csv
    Parser       csv
    Tag          csv
    Refresh_Interval 5
    Rotate_Wait 30

[OUTPUT]
    Name         opensearch
    Match        *
    Host         your-opensearch-host
    Port         9200
    Index        csv-index
    HTTP_User    your-username
    HTTP_Passwd  your-password
    tls          off
    Suppress_Type_Name On
    tls.verify   off
```

### Create `parsers.conf`

This file defines the CSV parser.

```ini
[PARSER]
    Name        csv
    Format      regex
    Regex       ^(?<timestamp>[^,]+),(?<log_level>[^,]+),(?<message>[^,]+),(?<application>[^,]+),(?<host>[^,]+)$
    Time_Key    timestamp
    Time_Format %Y-%m-%d %H:%M:%S
```

### Direct the CSV folder location

Ensure this file is in the directory you specified in the `Path` of the `fluent-bit.conf` file.


## Step 3: Run Fluent Bit

Navigate to the directory containing the Fluent Bit executable and the configuration files. Then, start Fluent Bit with the configuration files.

```bash
/path/to/fluent-bit/bin/fluent-bit -c /path/to/fluent-bit.conf
```

## Step 4: Verify Data in OpenSearch

After starting Fluent Bit, you can verify the data ingestion by accessing OpenSearch and searching for the `csv-index` index.

For example, you can use OpenSearch Dashboards or the OpenSearch API to query the index:

### Using OpenSearch Dashboards:

1. Open OpenSearch Dashboards in your browser.
2. Navigate to the "Discover" tab.
3. Select the `csv-index` index pattern.
4. Verify that the log data from your CSV files is being ingested and displayed.

### Using the OpenSearch API:

```bash
curl -X GET "http://your-opensearch-host:9200/csv-index/_search?pretty"
```

---
## Live Testing with Docker Compose
If you prefer to test this setup using Docker Compose, you can use the following docker-compose.yml file to quickly set up an OpenSearch instance along with Fluent Bit:

Under the `getting-started` section you can examine a live docker-compose sample:
```yaml
/csv_file/getting-started/fluent-bit
|-- docker-complete.yml
|-- data/
    |-- fluent-bit.conf
    |-- parsers.conf
    |-- logs.csv

```
Use the [docker-compose](../getting-started/fluent-bit/docker-complete.yml) you can find a complete:

`docker compose -f docker-complete.yml up -d` would instantiate the services and start sending the csv sample logs into an index. 

---
# Data-Prepper CSV Processor Tutorial

The `csv` processor parses comma-separated values (CSVs) from the event into columns.

## Configuration Options

- **source** (String): The field in the event to be parsed. Default is `message`.
- **quote_character** (String): The text qualifier for a single column. Default is `"`.
- **delimiter** (String): The character separating each column. Default is `,`.
- **delete_header** (Boolean): Deletes the event header after parsing. Default is true.
- **column_names_source_key** (String): Specifies the CSV column names.
- **column_names** (List): User-specified column names.

## Usage Examples

### User-specified Column Names

```yaml
csv-pipeline:
  source:
    file:
      path: "/full/path/to/ingest.csv"
      record_type: "event"
  processor:
    - csv:
        column_names: ["col1", "col2"]
  sink:
    - stdout:
```

### Automatically Detect Column Names

```yaml
csv-s3-pipeline:
  source:
    s3:
      notification_type: "sqs"
      codec:
        newline:
          skip_lines: 1
          header_destination: "header"
      compression: none
      sqs:
        queue_url: "https://sqs.<region>.amazonaws.com/<account id>/<queue name>"
      aws:
        region: "<region>"
  processor:
    - csv:
        column_names_source_key: "header"
  sink:
    - stdout:
```

## Metrics

- **recordsIn**: Ingress records count.
- **recordsOut**: Egress records count.
- **timeElapsed**: Execution time.
- **csvInvalidEvents**: Count of invalid events.

For more details, visit the [CSV Processor Documentation](https://opensearch.org/docs/latest/data-prepper/pipelines/configuration/processors/csv/).
```