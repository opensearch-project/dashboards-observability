/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { coreRefs } from '../../../../framework/core_refs';
import {
  FIELD_MAPPING_CACHE_TTL_MS,
  clearFieldMappingCache,
  getMappedFieldNames,
} from '../field_mapping_service';

// coreRefs.data is optional and set at plugin start; tests install a stub.
const refs = coreRefs as { data?: unknown };

describe('getMappedFieldNames', () => {
  const getFieldsForWildcard = jest.fn();

  beforeEach(() => {
    clearFieldMappingCache();
    getFieldsForWildcard.mockReset();
    getFieldsForWildcard.mockResolvedValue([
      { name: 'attributes.server.address' },
      { name: 'startTime' },
    ]);
    refs.data = { indexPatterns: { getFieldsForWildcard } };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete refs.data;
  });

  it('returns the mapped field names for the pattern and data source', async () => {
    const fields = await getMappedFieldNames('otel-v1-apm-span-*', 'ds-1');

    expect(fields).toEqual(new Set(['attributes.server.address', 'startTime']));
    expect(getFieldsForWildcard).toHaveBeenCalledWith({
      pattern: 'otel-v1-apm-span-*',
      dataSourceId: 'ds-1',
    });
  });

  it('caches per data source and pattern until the TTL passes', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    await getMappedFieldNames('spans');
    await getMappedFieldNames('spans');
    await getMappedFieldNames('spans', 'ds-1');
    expect(getFieldsForWildcard).toHaveBeenCalledTimes(2);

    now.mockReturnValue(1_000 + FIELD_MAPPING_CACHE_TTL_MS);
    await getMappedFieldNames('spans');
    expect(getFieldsForWildcard).toHaveBeenCalledTimes(3);
  });

  it('does not cache a failed lookup', async () => {
    getFieldsForWildcard.mockRejectedValueOnce(new Error('403'));
    await expect(getMappedFieldNames('spans')).rejects.toThrow('403');

    await expect(getMappedFieldNames('spans')).resolves.toEqual(
      new Set(['attributes.server.address', 'startTime'])
    );
    expect(getFieldsForWildcard).toHaveBeenCalledTimes(2);
  });

  it('rejects when the data plugin is unavailable', async () => {
    delete refs.data;
    await expect(getMappedFieldNames('spans')).rejects.toThrow('unavailable');
  });
});
