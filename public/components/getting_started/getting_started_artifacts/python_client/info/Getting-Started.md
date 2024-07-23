# Python Client Integration
The next integration contains instructions and tutorial of setting up python opensearch client and logging applicative telemetry into opensearch.

## Logging with OpenSearch in Python: 

Logging is an important aspect of software development,OpenSearch, is a robust and scalable solution, stands out for storing and analyzing logs efficiently.
This guide walks you through integrating OpenSearch as a storage and analytics into component used in your Python project for effective logging.

### Install Python Libraries
Install the OpenSearch Python client to interact with OpenSearch:

```bash
pip install opensearch-py
```
See additional documentation [here](https://opensearch.org/docs/latest/clients/python-low-level/).

## Integrating OpenSearch with Your Python Project

### Step 1: Import the OpenSearch Client
In your Python project, import the necessary module:

```python
from opensearchpy import OpenSearch
```

### Step 2: Establish a Connection
Create a connection to your OpenSearch cluster:

```python
os = OpenSearch([{'host': 'opensearch_host', 'port': 9200}])
```

### Step 3: Indexing Logs
Index your logs into OpenSearch:

```python
log_entry = {
    'timestamp': '2024-02-05T12:00:00',
    'level': 'info',
    'message': 'Your log message here.',
    'source': 'your_python_project'
}

index_name = 'index_name'

os.index(index=index_name, body=log_entry)
```

### Step 4: Querying Logs
Retrieve logs using OpenSearch's powerful search capabilities:

```python
query = {
    'query': {
        'match': {'level': 'error'}
    }
}

result = os.search(index=index_name, body=query)
print(result)
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

