# Golang Client Integration
The next integration contains instructions and tutorial of setting up golang opensearch client and logging applicative telemetry into opensearch.

# OpenSearch Go Client Documentation

The OpenSearch Go client allows you to connect your Go application with the data in your OpenSearch cluster.
This guide illustrates how to connect to OpenSearch, index documents, and run queries.

## Setup

To start a new project:
```bash
go mod init <mymodulename>
```
Add the Go client to your project:
```bash
go get github.com/opensearch-project/opensearch-go
```

## Connecting to OpenSearch

To connect to the default OpenSearch host, create a client object with the address https://localhost:9200
If using the Security plugin:

```go
client, err := opensearch.NewClient(opensearch.Config{
    Transport: &http.Transport{
        TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
    },
    Addresses: []string{"https://localhost:9200"},
    Username:  "admin", // For testing only. Don't store credentials in code.
    Password:  "admin",
})
```
Without the Security plugin:
```go
client, err := opensearch.NewClient(opensearch.Config{
    Transport: &http.Transport{
        TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
    },
    Addresses: []string{"http://localhost:9200"},
})
```

## Creating an Index

To create an index:
```go
settings := strings.NewReader(`{
    "settings": {
        "index": {
            "number_of_shards": 1,
            "number_of_replicas": 0
        }
    }
}`)

res := opensearchapi.IndicesCreateRequest{
    Index: "go-test-index1",
    Body:  settings,
}
```

## Indexing a Document

To index a document:
```go
document := strings.NewReader(`{
    "title": "Moneyball",
    "director": "Bennett Miller",
    "year": "2011"
}`)

docId := "1"
req := opensearchapi.IndexRequest{
    Index:      "go-test-index1",
    DocumentID: docId,
    Body:       document,
}
insertResponse, err := req.Do(context.Background(), client)
```

## Performing Bulk Operations

To perform bulk operations:
```go
blk, err := client.Bulk(
    strings.NewReader(`
    { "index" : { "_index" : "go-test-index1", "_id" : "2" } }
    { "title" : "Interstellar", "director" : "Christopher Nolan", "year" : "2014"}
    { "create" : { "_index" : "go-test-index1", "_id" : "3" } }
    { "title" : "Star Trek Beyond", "director" : "Justin Lin", "year" : "2015"}
    { "update" : {"_id" : "3", "_index" : "go-test-index1" } }
    { "doc" : {"year" : "2016"} }
`),
)
```

## Searching for Documents

To search for documents:
```go
content := strings.NewReader(`{
    "size": 5,
    "query": {
        "multi_match": {
        "query": "miller",
        "fields": ["title^2", "director"]
        }
    }
}`)

search := opensearchapi.SearchRequest{
    Index: []string{"go-test-index1"},
    Body: content,
}

searchResponse, err := search.Do(context.Background(), client)
```

In order to log Applicative activities, generate a log entry struct that collects applicative telemetry :
```
type LogEntry struct {
    Timestamp string `json:"timestamp"`
    Level     string `json:"level"`
    Message   string `json:"message"`
    Source    string `json:"source"`
    Module    string `json:"module"`
    Function  string `json:"function"`
    UserID    string `json:"user_id"`
}
```
This would log into a dedicated applicative index for storing the application's telemetry info


Here is a complete sample application:

```
package main

import (
    "context"
    "crypto/tls"
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "time"

    opensearch "github.com/opensearch-project/opensearch-go"
    opensearchapi "github.com/opensearch-project/opensearch-go/opensearchapi"
)

// LogEntry represents the structure of the log entry
type LogEntry struct {
    Timestamp string `json:"timestamp"`
    Level     string `json:"level"`
    Message   string `json:"message"`
    Source    string `json:"source"`
    Module    string `json:"module"`
    Function  string `json:"function"`
    UserID    string `json:"user_id"`
}

// InitOpenSearchClient initializes the OpenSearch client
func InitOpenSearchClient() (*opensearch.Client, error) {
    client, err := opensearch.NewClient(opensearch.Config{
        Transport: &http.Transport{
            TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
        },
        Addresses: []string{"https://localhost:9200"},
        Username:  "admin",
        Password:  "admin",
    })
    if err != nil {
        return nil, fmt.Errorf("failed to create OpenSearch client: %w", err)
    }
    return client, nil
}

// LogToOpenSearch logs the provided entry to OpenSearch
func LogToOpenSearch(client *opensearch.Client, entry LogEntry) error {
    data, err := json.Marshal(entry)
    if err != nil {
        return fmt.Errorf("failed to marshal log entry: %w", err)
    }

    req := opensearchapi.IndexRequest{
        Index:      "logs",
        DocumentID: fmt.Sprintf("%d", time.Now().UnixNano()),
        Body:       strings.NewReader(string(data)),
    }

    res, err := req.Do(context.Background(), client)
    if err != nil {
        return fmt.Errorf("failed to index log entry: %w", err)
    }
    defer res.Body.Close()

    if res.IsError() {
        return fmt.Errorf("error indexing log entry: %s", res.String())
    }

    return nil
}

func main() {
    client, err := InitOpenSearchClient()
    if err != nil {
        log.Fatalf("Error initializing OpenSearch client: %s", err)
    }

    logEntry := LogEntry{
        Timestamp: "2024-02-05T12:05:00",
        Level:     "info",
        Message:   "Processing user request.",
        Source:    "your_project",
        Module:    "request_handler",
        Function:  "process_request",
        UserID:    "user_123",
    }

    err = LogToOpenSearch(client, logEntry)
    if err != nil {
        log.Fatalf("Error logging to OpenSearch: %s", err)
    }

    log.Println("Log entry successfully written to OpenSearch")
}
```

## Best Practices for Effective Logging

1. **Descriptive Log Messages**: Include clear and detailed information.
2. **Appropriate Log Levels**: Use different levels (INFO, DEBUG, ERROR) to categorize log messages.
3. **Timestamps**: Always include timestamps for chronological analysis.
4. **Contextual Information**: Add details like module, function, or user IDs.
5. **Avoid Redundant Logging**: Balance between sufficient information and avoiding overload.
6. **Secure Sensitive Information**: Do not log sensitive data in plain text.
7. **Structured Logging**: Use JSON for consistent log formats.

## Advanced Features of OpenSearch

- **Index Patterns and Mappings**: Optimize log data structure for better analysis and retrieval.
- **Visualization with Dashboards**: Create interactive dashboards for real-time log insights.

# How to build an Application Monitor Dashboard
Based on the ingested logs, lets review the process of generating an informative monitor dashboard for the applicative logs:

## Step-by-Step Tutorial: Creating an OpenSearch Dashboard for Application Logs

### 1. Log in to opensearch dashboards
- Navigate to OpenSearch Dashboards.
- Log in and verify the logs index was created and contains logs data
- Go to Discover tab, select the index name and view the data

### 2. Create an Index Pattern
-  Go to 'Management' > 'Index Patterns'.
-  Click 'Create Index Pattern' and enter the pattern (e.g., logs-*).
-  Select the timestamp field (e.g., @timestamp) for time-based data.
-  Save the index pattern.

### 3. Build Log Queries
- Go to the 'Discover' tab.
- Use the search bar to filter logs, e.g., `log_level:ERROR` to find all error logs.
- For advanced filtering, utilize the Dashboard Query Language (DQL).

### 4. Save Your Query
- After refining your query, save it by clicking on the 'Save' button in the 'Discover' tab.
- Name your saved query for easy reference.

### 5. Create Visualizations
- Go to 'Visualize' > 'Create Visualization'.
- Select the type of visualization you want to create (e.g., bar chart, pie chart).
- Choose your saved query as the data source.

### 6. Add Buckets for Data Aggregation
- In the visualization settings, add buckets to aggregate your data. For example:
    - Use 'Date Histogram' for the X-axis to display logs over time.
    - Add other metrics or aggregations as needed.

### 7. Split Series for Detailed Insights
- Add another bucket to split data by specific fields, such as `service.name` or `host.name`.
- This will allow you to see log distributions across different services or hosts.

### 8. Customize Visualization
- Customize the visualization with labels, colors, and other settings to make it more informative and visually appealing.

### 9. Save and Add to Dashboard
- Save the visualization with a descriptive name.
- Navigate to the 'Dashboard' tab and create a new dashboard.
- Add your saved visualizations to the dashboard by selecting them from the list.

### 10. Finalize and Share
- Arrange the visualizations on the dashboard as desired.
- Save the dashboard with a meaningful name.
- Share the dashboard with your team by generating a shareable link or embedding it in your application.

### Tips for Effective Dashboards
- Use different types of visualizations to present various aspects of your log data.
- Regularly update the time filter to ensure you're viewing the most recent logs.
- Take advantage of OpenSearch Dashboards' interactive features, such as drill-downs and filters, for deeper analysis.

