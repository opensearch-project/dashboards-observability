/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';

const mockExecuteQuery = jest.fn();
jest.mock('../../../query_services/ppl_search_service', () => ({
  PPLSearchService: jest.fn().mockImplementation(() => ({ executeQuery: mockExecuteQuery })),
}));
const mockGetMappedFieldNames = jest.fn();
jest.mock('../../../query_services/field_mapping_service', () => ({
  getMappedFieldNames: (...args: unknown[]) => mockGetMappedFieldNames(...args),
}));
const mockConfig = {
  config: { serviceMapDataset: { id: 'svcmap-id', title: 'otel-v2-apm-service-map*' } },
};
jest.mock('../../../config/apm_config_context', () => ({
  useApmConfig: () => mockConfig,
}));

import { useResolvedNodeType } from '../use_resolved_node_type';

const resolve = async (name: string, hint?: string, environment = 'generic:default') => {
  const { result } = renderHook(() => useResolvedNodeType(name, environment, hint));
  expect(result.current.resolving).toBe(true);
  await waitFor(() => expect(result.current.resolving).toBe(false));
  return result.current.nodeType;
};

describe('useResolvedNodeType', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMappedFieldNames.mockResolvedValue(new Set(['targetNode.type']));
  });

  it('uses the service-map type over a wrong URL hint', async () => {
    mockExecuteQuery.mockResolvedValue({ jsonData: [{ 'targetNode.type': 'service' }] });
    expect(await resolve('svc-000-api', 'database')).toBe('service');
    expect(mockExecuteQuery.mock.calls[0][0]).toBe(
      "source=otel-v2-apm-service-map* | where targetNode.keyAttributes.name = 'svc-000-api'" +
        " and targetNode.keyAttributes.environment = 'generic:default' | head 1 | fields targetNode.type"
    );
  });

  it('resolves a dependency reached without a nodeType (older links, breadcrumbs)', async () => {
    mockExecuteQuery.mockResolvedValue({ jsonData: [{ 'targetNode.type': 'Messaging' }] });
    expect(await resolve('kafka:orders', undefined)).toBe('messaging');
  });

  it('treats a node that is never a target as a root service', async () => {
    mockExecuteQuery.mockResolvedValue({ jsonData: [] });
    expect(await resolve('frontend-proxy', 'external')).toBe('service');
  });

  it('sends no query for service-map data without typed nodes', async () => {
    mockGetMappedFieldNames.mockResolvedValue(new Set(['targetNode.keyAttributes.name']));
    expect(await resolve('checkout', undefined)).toBe('service');
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  it('falls back to the URL hint when the service map cannot be read', async () => {
    mockExecuteQuery.mockRejectedValue(new Error('boom'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await resolve('kafka:orders', 'messaging')).toBe('messaging');
  });
});
