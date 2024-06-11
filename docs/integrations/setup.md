# Integrations Setup

**Date:** March 22, 2024

When an integration is being installed, there are several steps executed in the process of getting
everything up and running. This document describes the major steps of installing an integration that
happen behind the scenes, to make it more clear how to implement content. It's generally recommended to read this along with the [Config document](config.md).

Currently, two types of integration assets are supported with a synchronous install. The full
installation process installs these separately, in two major chunks.

- The frontend side of the setup is in
  [setup_integrations.tsx](https://github.com/opensearch-project/dashboards-observability/blob/4e1e0e585/public/components/integrations/components/setup_integration.tsx#L450).
  This is where the installation flow is selected based on the type of integration being installed,
  integration `query`s are ran if available, and eventually the build request is sent to the
  backend.
- On the backend the request is routed to a
  [builder](https://github.com/opensearch-project/dashboards-observability/blob/4e1e0e585/server/adaptors/integrations/integrations_builder.ts#L32)
  that handles some further reference tidying (rewriting UUIDs to avoid collisions, modifying which
  index is read, etc) and makes the final integration instance object.

This process is a little confusing and perhaps more convoluted than it needs to be. This is known to
the author in hindsight.

## Query Mapping

If working on S3-based integrations, it's worth noting that queries have some values
[substituted](https://github.com/opensearch-project/dashboards-observability/blob/4e1e0e585/public/components/integrations/components/setup_integration.tsx#L438) when installing. They are:

- `{table_name}` is the fully qualified name of the S3 Glue table, typically `datasource.database.object_name`.
  This is also substituted in any linked Saved Queries when using S3-based integrations.
- `{s3_bucket_location}` to locate data.
- `{s3_checkpoint_location}` to store intermediate results, which is required by Spark.
- `{object_name}` used for giving tables a unique name per-integration to avoid collisions.

For some query examples, it can be worth looking at the assets for the
[VPC integration](https://github.com/opensearch-project/dashboards-observability/blob/4e1e0e585/server/adaptors/integrations/__data__/repository/aws_vpc_flow/assets/README.md).
