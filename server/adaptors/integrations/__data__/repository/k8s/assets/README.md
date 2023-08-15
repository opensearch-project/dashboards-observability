# K8s Dashboard Explained

The following queries are used for the k8s dashboard:

- Deployment names Graph:

  - Filter: `event.domain:kubernetes AND event.dataset:kubernetes.deployment`
  - Query: `kubernetes.deployment.name`

- Available pods per deployment (done per deployment aggregation)

  - Filter: `event.domain:kubernetes AND event.dataset:kubernetes.deployment`
  - Query: `kubernetes.deployment.name`

- Desired pod

  - Filter: `event.domain:kubernetes AND event.dataset:kubernetes.deployment`
  - Query: `kubernetes.deployment.replicas.desired`

- Available pods

  - Filter: `event.domain:kubernetes AND event.dataset:kubernetes.deployment`
  - Query: `kubernetes.deployment.replicas.available`

- Unavailable pods
  - Filter: `event.domain:kubernetes AND event.dataset:kubernetes.deployment`
  - Query: `kubernetes.deployment.replicas.unavailable`
- Unavailable pods per deployment ( done per deployment aggregation)

  - Filter: `event.domain:kubernetes AND event.dataset:kubernetes.deployment`
  - Query: `kubernetes.deployment.replicas.unavailable`

- CPU usage by node

  - Filter: `event.domain:kubernetes AND (event.dataset:kubernetes.container OR event.dataset:kubernetes.node)`
  - Query: `kubernetes.node.name` , `kubernetes.container.cpu.usage.nanocores`, `kubernetes.node.cpu.capacity.cores`

- Top memory intensive pods

  - Filter: `event.domain:kubernetes AND event.dataset:kubernetes.container`
  - Query: `kubernetes.container._module.pod.name`, `kubernetes.container.memory.usage.bytes`

- Top CPU intensive pods

  - Filter: `event.domain:kubernetes AND event.dataset:kubernetes.container`
  - Query: `kubernetes.container._module.pod.name`, `kubernetes.container.cpu.usage.core.ns`

- Network in by node

  - Filter: `event.domain:kubernetes AND event.dataset:kubernetes.pod`
  - Query: `kubernetes.pod.network.rx.bytes`

- Network out by node
  - Filter: `event.domain:kubernetes AND event.dataset:kubernetes.pod`
  - Query: `kubernetes.pod.network.tx.bytes`
