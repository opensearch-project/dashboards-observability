/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlertingPromResourcesService } from '../alerting_prom_resources_service';

describe('AlertingPromResourcesService', () => {
  it('constructs with a non-empty datasource id', () => {
    expect(() => new AlertingPromResourcesService('ds-1')).not.toThrow();
  });

  it('throws when constructed with an empty datasource id', () => {
    expect(() => new AlertingPromResourcesService('')).toThrow(/datasourceId is required/);
  });

  it('throws when constructed with a non-string datasource id', () => {
    // Force a runtime bad value through the constructor — covers the
    // "silent bad-URL request against /api/alerting/prometheus/undefined/..."
    // failure mode. The `as` cast mirrors what real call sites can produce
    // at runtime even though TypeScript types say `string`.
    expect(() => new AlertingPromResourcesService((undefined as unknown) as string)).toThrow(
      /datasourceId is required/
    );
  });
});
