# AWS VPC Flow Logs Integration Assets

API: http://osd:5601/api/saved_objects/_import?overwrite=true

- [Assets](aws_vpc_flow-1.0.0.ndjson)

## Asset List

The next table details the assets

| Name                                               |     Type      |                                 Description                                 |
| -------------------------------------------------- | :-----------: | :-------------------------------------------------------------------------: |
| `ss4o_logs_vpc-aws_vpc_flow-*-*`                   | index-pattern |                              The Index Pattern                              |
| `AWS VPC Flow Logs Overview`                       |   dashboard   |               The pre-canned dashboard for AWS VPC flow logs                |
| `[AWS VPC Flow Logs] Filters`                      | visualization |       [Controls] Interactive controls for easy dashboard manipulation       |
| `[AWS VPC Flow Logs] Total Requests`               | visualization |                   [Metric] Total requests through the VPC                   |
| `[AWS VPC Flow Logs] Request History`              | visualization |           [Vertical Bar] Number of Requests counted against time            |
| `[AWS VPC Flow Logs] Requests by VPC ID`           | visualization |              [Pie] Compare parts of Requests from each VPC ID               |
| `[AWS VPC Flow Logs] Total Requests By Action`     | visualization |                  [Metric] Number of Accept/Reject requests                  |
| `[AWS VPC Flow Logs] Bytes`                        | visualization |              [Line] Trend of bytes transferred during the flow              |
| `[AWS VPC Flow Logs] Packets`                      | visualization |             [Line] Trend of Packets transferred during the flow             |
| `[AWS VPC Flow Logs] Bytes Metric`                 | visualization |       [Metric] Total ingress/egress bytes transferred during the flow       |
| `[AWS VPC Flow Logs] Requests by Direction`        | visualization |               [Pie] Compare parts of ingress/egress requests                |
| `[AWS VPC Flow Logs] Requests by Direction Metric` | visualization |                 [Metric] Number of ingress/egress requests                  |
| `[AWS VPC Flow Logs] Top Source Bytes`             | visualization |   [Table] Top 10 source with number of bytes transferred during the flow    |
| `[AWS VPC Flow Logs] Top Destination Bytes`        | visualization | [Table] Top 10 destination with number of bytes transferred during the flow |
| `[AWS VPC Flow Logs] Top Sources`                  | visualization |     [Table] Top 10 source with number of requests send during the flow      |
| `[AWS VPC Flow Logs] Top Destinations`             | visualization |   [Table] Top 10 destination with number of requests send during the flow   |
| `[AWS VPC Flow Logs] Flow`                         | visualization |           [Vega] Illustrates the flow from Source to Destination            |
| `[AWS VPC Flow Logs] Heat Map`                     | visualization |                [Heat Map] Heat Map of source and destination                |
| `[AWS VPC Flow Logs] Top Source AWS Services`      | visualization |              [Pie] Compare parts of AWS service as flow source              |
| `[AWS VPC Flow Logs] Top Destination AWS Services` | visualization |           [Pie] Compare parts of AWS service as flow destination            |
| `[AWS VPC Flow Logs] General Search`               |    search     |                 The pre-canned search for AWS VPC flow logs                 |
