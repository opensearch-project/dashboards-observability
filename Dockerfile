# Use OpenSearch image as base
FROM opensearchproject/opensearch-dashboards:3.0.0

# Copy plugin zip into image
COPY ./build/observabilityDashboards-3.0.0.zip /tmp/observabilityDashboards-3.0.0.zip

# Remove old plugin
RUN /usr/share/opensearch-dashboards/bin/opensearch-dashboards-plugin remove observabilityDashboards
# Install updated plugin
RUN /usr/share/opensearch-dashboards/bin/opensearch-dashboards-plugin install file:///tmp/observabilityDashboards-3.0.0.zip

# Switch back to opensearch user
USER opensearch-dashboards
