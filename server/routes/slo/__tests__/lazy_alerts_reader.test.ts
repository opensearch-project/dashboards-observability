/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AlertingOSClient, Datasource, PromAlert } from '../../../../common/types/alerting';
import { lazyAlertsReader } from '../index';

const client = { transport: { request: jest.fn() } } as unknown as AlertingOSClient;
const ds = {
  id: 'ds-1',
  name: 'prom',
  type: 'prometheus',
  directQueryName: 'prom',
} as unknown as Datasource;
const firing: PromAlert = {
  labels: { slo_id: 'slo-1' },
  annotations: {},
  state: 'firing',
  activeAt: '2026-11-18T21:04:00Z',
  value: '0.3',
};

describe('lazyAlertsReader', () => {
  it('builds the backend on the first read only, and reads with the request client', async () => {
    const getAlerts = jest.fn(async () => [firing]);
    const backendFor = jest.fn(() => ({ getAlerts }));
    const read = lazyAlertsReader(client, backendFor);

    expect(backendFor).not.toHaveBeenCalled();
    await expect(read(ds)).resolves.toEqual([firing]);
    await read(ds);
    expect(backendFor).toHaveBeenCalledTimes(1);
    expect(getAlerts).toHaveBeenCalledTimes(2);
    expect(getAlerts).toHaveBeenCalledWith(client, ds);
  });

  it('turns a backend factory failure into a rejected read', async () => {
    const read = lazyAlertsReader(client, () => {
      throw new Error('no request-scoped backend');
    });
    await expect(read(ds)).rejects.toThrow('no request-scoped backend');
  });
});
