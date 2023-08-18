# AWS ELB Access Logs Integrations

## What is AWS ELB Access Logs ?

ELB Access Logs is a feature that allows you to capture information about requests sent to your load balancer.

Access logs can help with a number of tasks, such as:

- Optimizing performance by showing response and processing times

- Security analysis by monitoring unusual request patterns or user agents

- Understanding traffic patterns and peak loads

While disabled by default, you can [enable storing access logs](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/enable-access-logging.html) for your load balancer in an AWS S3 bucket.

See additional details [here](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-access-logs.html).

Flow log data is collected outside of the path of your network traffic, and therefore does not affect network throughput or latency. You can create or delete flow logs without any risk of impact to network performance.

See additional details [here](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html).

## What is AWS ELB Access Logs Integration ?

An integration is a bundle of pre-canned assets which are bundled togather in a meaningful manner.

AWS ELB access logs integration includes dashboards, visualisations, queries and index mapping

### Dashboard

<img width="1267" alt="dashboard1" src="https://github.com/danieldong51/dashboards-observability/assets/58446449/aaae3758-80c8-410e-b542-6ad78284425e">
