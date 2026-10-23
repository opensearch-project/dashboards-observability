/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The single seam between the alerting plugin and AWS CloudWatch.
 *
 * `CloudWatchAlarmSource` is the ONLY interface the rest of the plugin depends on for
 * CloudWatch data. This plugin ships no implementation and no AWS SDK: a deployment that can
 * reach CloudWatch (with the caller's own credentials) passes a `CloudWatchAlarmSourceFactory`
 * to `setupRoutes`, the same way it can pass a Prometheus backend. Without one, the CloudWatch
 * backend, routes and UI stay off even when `observability.cloudwatch.enabled` is set.
 */
import type { CloudWatchAlarmSource } from '../../../../common/types/alerting';
import type { OpenSearchDashboardsRequest } from '../../../../../../src/core/server';

/**
 * A specific error type the source throws when the request has no usable AWS
 * credentials. Callers translate this into a per-datasource fetch error so a
 * mis-configured environment surfaces as a warning row rather than crashing the
 * whole fan-out.
 */
export class CloudWatchCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudWatchCredentialsError';
  }
}

/**
 * Builds a source for one request, so calls carry that caller's credentials and account.
 * Supplied by the deployment; see the file comment.
 */
export type CloudWatchAlarmSourceFactory = (
  request: OpenSearchDashboardsRequest
) => CloudWatchAlarmSource;

// The source contract itself is a plain type in common/ so a deployment's implementation can
// import it alongside the other alerting types; re-exported here for server callers.
export type {
  CloudWatchAlarmSource,
  CloudWatchCallerIdentity,
  CloudWatchMetricDataQuery,
  CloudWatchStateChange,
  CloudWatchStateChangesQuery,
} from '../../../../common/types/alerting';
