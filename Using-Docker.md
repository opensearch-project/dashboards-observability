# Using Docker
Using docker as the runtime environment for testing and validating new developments is now available using the next commands:

## Build the plugin
First the plugin must be build using the `yarn build` command.

Once this build was completed - the expected zip location of the plugin is `./build/observabilityDashboards-?.?.?.zip` where as the `?.?.?` represents the version of this dashboard plugin.

> Note that the plugin version must correspond to the OpenSearch-Dashboards version - this information appears [here](opensearch_dashboards.json)
> 

Once the build is completed, make sure to overide the [Dockerfile](Dockerfile) target zip file with the exact name 
```
# Install updated plugin
RUN /usr/share/opensearch-dashboards/bin/opensearch-dashboards-plugin install file:///tmp/observabilityDashboards-3.0.0.zip
```

## Run the docker compose
The [docker-compose](docker-compose.yml) file represents a simple assembly of an OpenSearch cluster with two nodes and an opensearch dashboard that has the updated image with the latest changes in this plugin.

run `docker compose up -d` to start the services and once the service is up and running you can start testing the changes.

> Note that the OpenSearch version also must correspond to the OpenSearch-Dashboards version

## Accessing the Dashboard
The dashboard service uses port `localhost:5601` for access and this was already exported in the docker-compose service definition
```yaml
    ports:
      - 5601:5601 # Map host port 5601 to container port 5601
```

## Security Notice
The default User:Password for this demo test is (admin:admin) - pay attention not to use this configuration in a production or any environment that may contain
confident or personal information without first changing the security definition for accessing the servers.
