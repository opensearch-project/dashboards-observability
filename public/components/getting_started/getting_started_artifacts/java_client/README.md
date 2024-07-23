```markdown
# OpenSearch Java Client Documentation

The OpenSearch Java client allows you to interact with your OpenSearch clusters through Java methods and data structures rather than HTTP methods and raw JSON. This guide illustrates how to connect to OpenSearch, index documents, and run queries.

## Installing the Client

### Using RestClient Transport
Add the following dependencies to your `pom.xml`:
```xml
<dependency>
  <groupId>org.opensearch.client</groupId>
  <artifactId>opensearch-rest-client</artifactId>
  <version>2.15.0</version>
</dependency>
<dependency>
  <groupId>org.opensearch.client</groupId>
  <artifactId>opensearch-java</artifactId>
  <version>2.6.0</version>
</dependency>
```
For Gradle:
```gradle
dependencies {
  implementation 'org.opensearch.client:opensearch-rest-client:2.15.0'
  implementation 'org.opensearch.client:opensearch-java:2.6.0'
}
```

## Security
Configure the application's truststore to connect to the Security plugin:
```bash
keytool -import <path-to-cert> -alias <alias-to-call-cert> -keystore <truststore-name>
```

## Sample Data
Define an `IndexData` class:
```java
static class IndexData {
  private String firstName;
  private String lastName;

  public IndexData(String firstName, String lastName) {
    this.firstName = firstName;
    this.lastName = lastName;
  }

  public String getFirstName() { return firstName; }
  public void setFirstName(String firstName) { this.firstName = firstName; }
  public String getLastName() { return lastName; }
  public void setLastName(String lastName) { this.lastName = lastName; }

  @Override
  public String toString() {
    return String.format("IndexData{first name='%s', last name='%s'}", firstName, lastName);
  }
}
```

## Initializing the Client with SSL and TLS

### Using RestClient Transport
```java
import org.apache.http.HttpHost;
import org.apache.http.auth.AuthScope;
import org.apache.http.auth.UsernamePasswordCredentials;
import org.apache.http.impl.client.BasicCredentialsProvider;
import org.opensearch.client.RestClient;
import org.opensearch.client.RestClientBuilder;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.transport.rest_client.RestClientTransport;

public class OpenSearchClientExample {
  public static void main(String[] args) throws Exception {
    System.setProperty("javax.net.ssl.trustStore", "/full/path/to/keystore");
    System.setProperty("javax.net.ssl.trustStorePassword", "password-to-keystore");

    final HttpHost host = new HttpHost("https", "localhost", 9200);
    final BasicCredentialsProvider credentialsProvider = new BasicCredentialsProvider();
    credentialsProvider.setCredentials(new AuthScope(host), new UsernamePasswordCredentials("admin", "admin".toCharArray()));

    final RestClient restClient = RestClient.builder(host).setHttpClientConfigCallback(httpClientBuilder -> {
      return httpClientBuilder.setDefaultCredentialsProvider(credentialsProvider);
    }).build();

    final OpenSearchClient client = new OpenSearchClient(new RestClientTransport(restClient, new JacksonJsonpMapper()));
  }
}
```

## Creating an Index
```java
String index = "sample-index";
CreateIndexRequest createIndexRequest = new CreateIndexRequest.Builder().index(index).build();
client.indices().create(createIndexRequest);

IndexSettings indexSettings = new IndexSettings.Builder().autoExpandReplicas("0-all").build();
PutIndicesSettingsRequest putIndicesSettingsRequest = new PutIndicesSettingsRequest.Builder().index(index).value(indexSettings).build();
client.indices().putSettings(putIndicesSettingsRequest);
```

## Indexing Data
```java
IndexData indexData = new IndexData("first_name", "Bruce");
IndexRequest<IndexData> indexRequest = new IndexRequest.Builder<IndexData>().index(index).id("1").document(indexData).build();
client.index(indexRequest);
```

## Searching for Documents
```java
SearchResponse<IndexData> searchResponse = client.search(s -> s.index(index), IndexData.class);
for (int i = 0; i< searchResponse.hits().hits().size(); i++) {
  System.out.println(searchResponse.hits().hits().get(i).source());
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

Based on the ingested logs, let's review the process of generating an informative monitor dashboard for the application logs:

## Step-by-Step Tutorial: Creating an OpenSearch Dashboard for Application Logs

### 1. Log in to OpenSearch Dashboards

- Navigate to OpenSearch Dashboards.
- Log in and verify the logs index was created and contains logs data.
- Go to the Discover tab, select the index name, and view the data.

### 2. Create an Index Pattern

- Go to 'Management' > 'Index Patterns'.
- Click 'Create Index Pattern' and enter the pattern (e.g., logs-*).
- Select the timestamp field (e.g., @timestamp) for time-based data.
- Save the index pattern.

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