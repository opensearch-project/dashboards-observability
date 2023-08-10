# K8s Dashboard Explained

The following queries are used for the k8s dashboard:

> Replace mapping `event.module` with `event.domain`
> Replace query `metricset.name` with `event.dataset` 
> Replace query fields
>      `state_deployment` -> kubernetes.deployment
>      `state_node` -> kubernetes.node
>      `container` -> kubernetes.container
>      `pod` -> kubernetes.pod
> 
 
- Deployment names Graph:
   - Filter: `event.module:kubernetes AND metricset.name:state_deployment` 
   - Query: `kubernetes.deployment.name` 
 - Available pods per deployment (done per deployment aggregation)
   - Filter: `event.module:kubernetes AND metricset.name:state_deployment`
   - Query: `kubernetes.deployment.name`
 - Desired pod
    - Filter: `event.module:kubernetes AND metricset.name:state_deployment`
    - Query: `kubernetes.deployment.replicas.desired`
 - Available pods
   - Filter: `event.module:kubernetes AND metricset.name:state_deployment`
   - Query: `kubernetes.deployment.replicas.available`
 - Unavailable pods
   - Filter: `event.module:kubernetes AND metricset.name:state_deployment`
   - Query: `kubernetes.deployment.replicas.unavailable`
 - Unavailable pods per deployment ( done per deployment aggregation)
   - Filter: `event.module:kubernetes AND metricset.name:state_deployment`
   - Query: `kubernetes.deployment.replicas.unavailable`
 - CPU usage by node
   - Filter: `event.module:kubernetes AND (metricset.name:container OR metricset.name:state_node)`
   - Query: `kubernetes.node.name` , `kubernetes.container.cpu.usage.nanocores`, `kubernetes.node.cpu.capacity.cores`
 - Top memory intensive pods
   - Filter: `event.module:kubernetes AND metricset.name:container`
   - Query: `kubernetes.container._module.pod.name`, `kubernetes.container.memory.usage.bytes`
 - Top CPU intensive pods
   - Filter: `event.module:kubernetes AND metricset.name:container`
   - Query: `kubernetes.container._module.pod.name`, `kubernetes.container.cpu.usage.core.ns`
 - Network in by node 
   - Filter: `event.module:kubernetes AND metricset.name:pod`
   - Query:  `kubernetes.pod.network.rx.bytes`
 - Network out by node
   - Filter: `event.module:kubernetes AND metricset.name:pod`
   - Query: `kubernetes.pod.network.tx.bytes`
