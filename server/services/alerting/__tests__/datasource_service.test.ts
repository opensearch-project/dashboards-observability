/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InMemoryDatasourceService } from '../datasource_service';
import type { Logger } from '../../../../common/types/alerting/types';

const mockLogger: Logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

const dsInput = {
  name: 'test',
  type: 'opensearch' as const,
  url: 'http://localhost',
  enabled: true,
};

describe('InMemoryDatasourceService', () => {
  let svc: InMemoryDatasourceService;

  beforeEach(() => {
    svc = new InMemoryDatasourceService(mockLogger);
  });

  it('create returns datasource with generated id', async () => {
    const ds = await svc.create(dsInput);
    expect(ds.id).toMatch(/^ds-\d+$/);
    expect(ds.name).toBe('test');
  });

  it('get returns created datasource', async () => {
    const ds = await svc.create(dsInput);
    expect(await svc.get(ds.id)).toEqual(ds);
  });

  it('get returns null for unknown id', async () => {
    expect(await svc.get('nope')).toBeNull();
  });

  it('list returns all datasources', async () => {
    await svc.create(dsInput);
    await svc.create({ ...dsInput, name: 'second' });
    expect(await svc.list()).toHaveLength(2);
  });

  it('delete removes datasource', async () => {
    const ds = await svc.create(dsInput);
    expect(await svc.delete(ds.id)).toBe(true);
    expect(await svc.get(ds.id)).toBeNull();
  });

  it('delete returns false for unknown id', async () => {
    expect(await svc.delete('nope')).toBe(false);
  });

  it('update merges fields', async () => {
    const ds = await svc.create(dsInput);
    const updated = await svc.update(ds.id, { name: 'renamed' });
    expect(updated?.name).toBe('renamed');
  });

  it('seed populates multiple datasources', async () => {
    svc.seed([dsInput, { ...dsInput, name: 'b' }]);
    expect(await svc.list()).toHaveLength(2);
  });
});
