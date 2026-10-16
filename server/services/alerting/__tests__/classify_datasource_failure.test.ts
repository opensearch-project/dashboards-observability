/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for `classifyDatasourceFailure` — the fan-out seam that attaches a
 * structured `errorDetail` to per-datasource warnings. Pins the two contract
 * points: CloudWatch failures classify into named failure classes, and
 * unclassifiable failures return undefined (so the UI keeps its raw-message
 * wording) with sensitive details always stripped.
 */

import type { Datasource } from '../../../../common/types/alerting';
import { __resetDefaultsFlagForTests, registerDefaultClassifiers } from '../../../../common/error';
import { __resetRegistryForTests } from '../../../../common/error/registry';
import { CloudWatchErrorCode } from '../../../../common/error/classifiers/cloudwatch';
import { classifyDatasourceFailure } from '../alert_service';

const cwDs = { id: 'cloudwatch', name: 'CloudWatch', type: 'cloudwatch' } as Datasource;
const osDs = { id: 'local', name: 'Local', type: 'opensearch' } as Datasource;

beforeEach(() => {
  __resetRegistryForTests();
  __resetDefaultsFlagForTests();
  registerDefaultClassifiers();
});

describe('classifyDatasourceFailure', () => {
  it('classifies a CloudWatch credentials miss into a named failure class', () => {
    const err = new Error('CloudWatch credentials not found.');
    err.name = 'CloudWatchCredentialsError';
    const out = classifyDatasourceFailure(err, cwDs, 'unified.rules.fetch');
    expect(out?.code).toBe(CloudWatchErrorCode.CREDENTIALS_MISSING);
    expect(out?.category).toBe('PERMISSION_DENIED');
  });

  it('reads the AWS SDK $metadata http status', () => {
    const err = Object.assign(new Error('Rate exceeded'), {
      name: 'ThrottlingException',
      $metadata: { httpStatusCode: 400 },
    });
    const out = classifyDatasourceFailure(err, cwDs, 'unified.alerts.fetch');
    expect(out?.code).toBe(CloudWatchErrorCode.THROTTLED);
    // Classifier overrides to the canonical 429 regardless of the wire status.
    expect(out?.httpStatus).toBe(429);
  });

  it('attributes DNS failures to CloudWatch only via the datasource type', () => {
    const dnsError = new Error('getaddrinfo ENOTFOUND monitoring.us-eest-1.amazonaws.com');
    expect(classifyDatasourceFailure(dnsError, cwDs, 'unified.rules.fetch')?.code).toBe(
      CloudWatchErrorCode.ENDPOINT_UNREACHABLE
    );
    // Same shape from an OpenSearch datasource must not claim the CW code.
    expect(classifyDatasourceFailure(dnsError, osDs, 'unified.rules.fetch')?.code).not.toBe(
      CloudWatchErrorCode.ENDPOINT_UNREACHABLE
    );
  });

  it('returns undefined for unclassifiable failures (raw message stays authoritative)', () => {
    expect(
      classifyDatasourceFailure(new Error('some opaque backend failure'), osDs, 'op')
    ).toBeUndefined();
    expect(classifyDatasourceFailure(null, osDs, 'op')).toBeUndefined();
  });

  it('never leaks sensitive details into the warning payload', () => {
    const err = new Error('User: arn:aws:iam::123456789012:user/secret-user is not authorized');
    err.name = 'AccessDeniedException';
    const out = classifyDatasourceFailure(err, cwDs, 'unified.rules.fetch');
    expect(out?.details?.some((d) => d.sensitivity === 'sensitive')).toBeFalsy();
  });
});
