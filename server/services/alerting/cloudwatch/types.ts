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
/* eslint-disable max-classes-per-file */
import type { CloudWatchAlarmSource } from '../../../../common/types/alerting';
import { CLOUDWATCH_SCOPE_UNAVAILABLE_ERROR_NAME } from '../../../../common/types/alerting';
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
 * A datasource names an account scope the source can't provide for this request (`forScope`
 * is absent or returned undefined). The message is fixed: it never carries the scope id.
 */
export class CloudWatchScopeUnavailableError extends Error {
  readonly statusCode = 404;
  constructor() {
    super('CloudWatch account scope is not available');
    this.name = CLOUDWATCH_SCOPE_UNAVAILABLE_ERROR_NAME;
  }
}

/**
 * Builds a source for one request, so calls carry that caller's credentials and account.
 * Supplied by the deployment; see the file comment. It may decide per request: returning
 * `undefined` (or resolving to it) turns CloudWatch off for that request, on the server (the
 * virtual datasource, the unified fan-out and the `/api/alerting/cloudwatch/*` routes) and in
 * the browser (the `cloudWatchAlarmsEnabled` capability).
 */
export type CloudWatchAlarmSourceFactory = (
  request: OpenSearchDashboardsRequest
) => CloudWatchAlarmSource | undefined | Promise<CloudWatchAlarmSource | undefined>;

/** The per-request CloudWatch flag (`observability.cloudwatch.enabled`, dynamic config aware). */
export type CloudWatchFlagResolver = (request: OpenSearchDashboardsRequest) => Promise<boolean>;

// The source contract itself is a plain type in common/ so a deployment's implementation can
// import it alongside the other alerting types; re-exported here for server callers.
export type {
  CloudWatchAccountScope,
  CloudWatchAlarmSource,
  CloudWatchCallerIdentity,
  CloudWatchMetricDataQuery,
  CloudWatchStateChange,
  CloudWatchStateChangesQuery,
  CloudWatchTargets,
} from '../../../../common/types/alerting';
