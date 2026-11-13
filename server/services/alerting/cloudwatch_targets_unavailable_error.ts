/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `get()` of a CloudWatch id when the source's targets read failed or timed out: the id can't be
 * checked against the offered pairs, so it isn't looked up as a saved object either.
 * `targetsError` is the read's error, for classification (a timeout is retryable).
 */
export class CloudWatchTargetsUnavailableError extends Error {
  constructor(public readonly targetsError: unknown) {
    super('CloudWatch account list is not available');
    this.name = 'CloudWatchTargetsUnavailableError';
  }
}
