/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { observabilityLogsID } from '../../../../../../common/constants/shared';
import { coreRefs } from '../../../../../framework/core_refs';
import {
  redirectSpansToLogs,
  redirectToServiceLogs,
  redirectToServiceTraces,
  redirectTraceToLogs,
} from '../redirection_helpers';

jest.mock('../../../../../framework/core_refs', () => ({
  coreRefs: {
    application: { navigateToApp: jest.fn() },
    chrome: { navGroup: { getNavGroupEnabled: jest.fn() } },
    dataSource: { dataSourceEnabled: true },
  },
}));

describe('Redirect Functions', () => {
  const mockDataSource = [{ id: 'test-id', label: 'Test Label' }];
  const serviceName = 'test-service';
  const spanId = 'test-span';
  const traceId = 'test-trace';
  const fromTime = '2024-03-30T10:00:00.000Z';
  const toTime = '2024-03-30T11:00:00.000Z';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('redirectToServiceLogs - dataSource MDS enabled', () => {
    coreRefs.dataSource = { dataSourceEnabled: true };
    redirectToServiceLogs({ fromTime, toTime, dataSourceMDSId: mockDataSource, serviceName });
    expect(coreRefs.application?.navigateToApp).toHaveBeenCalledWith(
      'data-explorer',
      expect.objectContaining({})
    );
  });

  test('redirectToServiceLogs - dataSource MDS disabled', () => {
    coreRefs.dataSource = { dataSourceEnabled: false };
    redirectToServiceLogs({ fromTime, toTime, dataSourceMDSId: [], serviceName: '' });
    expect(coreRefs.application?.navigateToApp).toHaveBeenCalledWith(
      observabilityLogsID,
      expect.objectContaining({})
    );
  });

  test('redirectSpansToLogs - dataSource MDS enabled', () => {
    coreRefs.dataSource = { dataSourceEnabled: true };
    redirectSpansToLogs({ fromTime, toTime, dataSourceMDSId: mockDataSource, spanId });
    expect(coreRefs.application?.navigateToApp).toHaveBeenCalledWith(
      'data-explorer',
      expect.objectContaining({})
    );
  });

  test('redirectSpansToLogs - dataSource MDS disabled', () => {
    coreRefs.dataSource = { dataSourceEnabled: false };
    redirectSpansToLogs({ fromTime, toTime, dataSourceMDSId: [], spanId: '' });
    expect(coreRefs.application?.navigateToApp).toHaveBeenCalledWith(
      observabilityLogsID,
      expect.objectContaining({})
    );
  });

  test('redirectTraceToLogs - dataSource MDS enabled', () => {
    coreRefs.dataSource = { dataSourceEnabled: true };
    redirectTraceToLogs({ fromTime, toTime, dataSourceMDSId: mockDataSource, traceId });
    expect(coreRefs.application?.navigateToApp).toHaveBeenCalledWith(
      'data-explorer',
      expect.objectContaining({})
    );
  });

  test('redirectTraceToLogs - dataSource MDS disabled', () => {
    coreRefs.dataSource = { dataSourceEnabled: false };
    redirectTraceToLogs({ fromTime, toTime, dataSourceMDSId: [], traceId: '' });
    expect(coreRefs.application?.navigateToApp).toHaveBeenCalledWith(
      observabilityLogsID,
      expect.objectContaining({})
    );
  });

  test('redirectToServiceTraces - new navigation enabled', () => {
    coreRefs.chrome = {
      navGroup: { getNavGroupEnabled: () => true },
    };
    const mockAddFilter = jest.fn();

    redirectToServiceTraces({
      mode: 'data_prepper',
      addFilter: mockAddFilter,
      dataSourceMDSId: mockDataSource,
      serviceName,
    });
    expect(coreRefs.application?.navigateToApp).toHaveBeenCalled();
  });

  test('redirectToServiceTraces - new navigation disabled', () => {
    coreRefs.chrome = {
      navGroup: { getNavGroupEnabled: () => false },
    };
    const mockAddFilter = jest.fn();

    delete window.location;
    window.location = { assign: jest.fn(), href: '' };

    redirectToServiceTraces({
      mode: 'data_prepper',
      addFilter: mockAddFilter,
      dataSourceMDSId: mockDataSource,
      serviceName,
    });
    expect(window.location.assign).toHaveBeenCalled();
  });
});
