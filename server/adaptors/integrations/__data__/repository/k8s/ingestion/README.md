# Setting Fluent Bit Ingestion Deployment in Kubernetes

Fluent Bit is an open-source and multi-platform Log Processor and Forwarder. It allows you to unify the data collection and logging of your system. This particular YAML configuration deploys Fluent Bit in a Kubernetes cluster for monitoring purposes.

## Components

The YAML consists of four primary components:

**ClusterRole:** For defining permissions.
**ClusterRoleBinding:** To bind the permissions to a specific service account.
**ConfigMap:** To store the configuration details for Fluent Bit.
**DaemonSet:** For deploying Fluent Bit on all nodes in the cluster.

1. **ClusterRole**
   This part of the YAML file defines a ClusterRole named fluent-bit-read. It sets the permissions for accessing various resources in the cluster:
2. **ClusterRoleBinding**
   This binds the above ClusterRole to a ServiceAccount named fluent-bit in the logging namespace. It ensures the permissions defined in the ClusterRole are applied to this service account.
3. **ConfigMap**
   The fluent-bit-config ConfigMap stores the Fluent Bit configuration, including service, input, filter, output, and parser details. Configuration related to different aspects of log collection and forwarding is included in this section.
4. **DaemonSet**
   Fluent Bit is deployed as a DaemonSet, which means a Fluent Bit container will run on every node in the cluster. This ensures that logs from all nodes are collected and processed.

This Fluent Bit deployment in Kubernetes is instrumental in gathering, processing, and forwarding logs from different parts of the cluster.
It can be integrated with various log analytics tools and used for monitoring the behavior of the cluster, facilitating prompt insights and responses to system events. Make sure to tailor the configuration to match your specific requirements and infrastructure.

### References

- [K8s Filter Plugin](https://docs.fluentbit.io/manual/pipeline/filters/kubernetes)

**Kubernetes filter performs the following operations:**

Analyzes the data and extracts the metadata such as `Pod name`, `namespace`, `container name`, and `container ID` .
Queries Kubernetes API server to get extra metadata for the given Pod including the `Pod ID`, `labels`, `annotations`.

This metadata is then appended to each record (log message).
This data is cached locally in memory and is appended to each log record.

The following parameters represent a minimum configuration for this filter used in the ConfigMap above:

- `Name` — the name of the filter plugin.
- `Kube_URL` — API Server end-point. E.g https://kubernetes.default.svc.cluster.local/
- `Match` — a tag to match filtering against.
