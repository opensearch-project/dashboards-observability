# Kubernetes Integration

## What is Kubernetes?

Kubernetes is an open-source container orchestration platform that automates the deployment, scaling, and management of containerized applications. It provides a robust and scalable infrastructure for running applications in a cloud-native environment.

See additional details [here](https://kubernetes.io/).

## What is Kubernetes Integration?

An integration is a collection of pre-configured assets that are bundled together to streamline monitoring and analysis.

Kubernetes integration includes dashboards, visualizations, queries, and an index mapping.

### Dashboards

![Dashboard](../static/dashboard.png)

With the Kubernetes integration, you can gain valuable insights into the health and performance of your containerized applications. The pre-configured dashboards and visualizations help you monitor key metrics, track resource utilization, and identify potential issues within your Kubernetes clusters. This integration empowers you to efficiently manage your containerized workloads, scale applications as needed, and ensure the reliability and availability of your Kubernetes environment.

### Collecting K8s

The next OpenTelemetry [page](https://opentelemetry.io/docs/kubernetes/collector/components/) describes the K8s attributes and other components

#### Kubernetes Attributes Processor

The Kubernetes Attributes Processor automatically discovers Kubernetes pods, extracts their metadata, and adds the extracted metadata to spans, metrics, and logs as resource attributes.

The following attributes are added by default:

**Cluster**

- `k8s.cluster.name`
- `k8s.cluster.uid`

**Namespace**

- `k8s.namespace.name`

**Pod**

- `k8s.pod.name`
- `k8s.pod.uid`
- `k8s.pod.start_time`
- `k8s.deployment.name`

**Node**

- `k8s.node.name`
- `k8s.node.uid`

**Container**

- `k8s.container.name`
- `k8s.container.restart_count`

**ReplicaSet**

- `k8s.replicaset.name`
- `k8s.replicaset.uid`

**Deployment**

- `k8s.deployment.name`
- `k8s.deployment.uid`

**StatefulSet**

- `k8s.statefulset.name`
- `k8s.statefulset.uid`

**DaemonSet**

- `k8s.daemon.name`
- `k8s.daemon.uid`

**DaemonSet**

- `k8s.job.name`
- `k8s.job.uid`

> All these fields are represented in the k8s-1.0.0.mapping schema and are aliased with the existing ECS based fields

### Important Components for Kubernetes

- [Kubeletstats Receiver](https://opentelemetry.io/docs/kubernetes/collector/components/#kubeletstats-receiver): pulls pod metrics from the API server on a kubelet.
- [Filelog Receiver](https://opentelemetry.io/docs/kubernetes/collector/components/#filelog-receiver): collects Kubernetes logs and application logs written to stdout/stderr.
- [Kubernetes Cluster Receiver](https://opentelemetry.io/docs/kubernetes/collector/components/#kubernetes-cluster-receiver): collects cluster-level metrics and entity events.
- [Kubernetes Objects Receiver](https://opentelemetry.io/docs/kubernetes/collector/components/#kubernetes-objects-receiver): collects objects, such as events, from the Kubernetes API server.
- [Host Metrics Receiver](https://opentelemetry.io/docs/kubernetes/collector/components/#host-metrics-receiver): scrapes host metrics from Kubernetes nodes.
