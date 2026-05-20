/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SLO_TOMBSTONE_SO_TYPE, sloTombstoneId, sloTombstoneType } from '../slo_tombstone';

describe('slo-tombstone saved object type', () => {
  it('declares the expected type name', () => {
    expect(SLO_TOMBSTONE_SO_TYPE).toBe('slo-tombstone');
    expect(sloTombstoneType.name).toBe('slo-tombstone');
  });

  it('uses single-namespace scoping', () => {
    expect(sloTombstoneType.namespaceType).toBe('single');
  });

  it('is not importable/exportable (internal registry)', () => {
    expect(sloTombstoneType.management?.importableAndExportable).toBe(false);
  });

  it('declares mapping fields matching the SloTombstoneAttributes interface', () => {
    const props = sloTombstoneType.mappings.properties as Record<string, { type: string }>;
    expect(props.sloId.type).toBe('keyword');
    expect(props.workspaceId.type).toBe('keyword');
    expect(props.datasourceId.type).toBe('keyword');
    expect(props.name.type).toBe('keyword');
    expect(props.reason.type).toBe('keyword');
    expect(props.createdAt.type).toBe('date');
  });

  describe('sloTombstoneId', () => {
    it('follows the slo-tombstone:<sloId> format', () => {
      expect(sloTombstoneId('slo-abc-123')).toBe('slo-tombstone:slo-abc-123');
    });
  });
});
