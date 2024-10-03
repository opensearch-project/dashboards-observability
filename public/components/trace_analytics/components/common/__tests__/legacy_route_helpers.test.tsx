/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  convertLegacyTraceAnalyticsUrl,
  convertTraceAnalyticsNewNavUrl,
} from '../legacy_route_helpers';
import {
  observabilityTracesID,
  observabilityTracesNewNavID,
  observabilityServicesNewNavID,
} from '../../../../../../common/constants/shared';
import { coreRefs } from '../../../../../framework/core_refs';

describe('ConvertLegacyTraceAnalyticsUrl', () => {
  it('should convert legacy URL correctly', () => {
    const location = {
      pathname: '/app/trace-analytics-dashboards',
      hash: '#/traces',
      search: '?param1=value1',
    } as Location;

    const result = convertLegacyTraceAnalyticsUrl(location);
    expect(result).toBe(`/app/${observabilityTracesID}#/traces?param1=value1`);
  });

  it('should handle URL with existing hash parameters', () => {
    const location = {
      pathname: '/app/trace-analytics-dashboards',
      hash: '#/traces?existing=param',
      search: '?param1=value1',
    } as Location;

    const result = convertLegacyTraceAnalyticsUrl(location);
    expect(result).toBe(`/app/${observabilityTracesID}#/traces?existing=param&param1=value1`);
  });
});

describe('ConvertTraceAnalyticsNewNavUrl', () => {
  let originalLocation;

  beforeEach(() => {
    // Save the original window.location object
    originalLocation = window.location;

    // Mock window.location.assign
    Object.defineProperty(window, 'location', {
      value: {
        assign: jest.fn(),
      },
      writable: true,
    });
  });

  afterEach(() => {
    // Restore the original window.location object after each test
    window.location = originalLocation;
  });

  it('should redirect to the new navigation traces URL if trace ID is present and new nav is enabled', () => {
    const locationMock = {
      pathname: `/app/${observabilityTracesID}`,
      hash: '#/traces/03f9c770db5ee2f1caac0afc36db49ba',
    } as Location;

    coreRefs.chrome = { navGroup: { getNavGroupEnabled: jest.fn().mockReturnValue(true) } };

    convertTraceAnalyticsNewNavUrl(locationMock);

    expect(window.location.assign).toHaveBeenCalledWith(
      `/app/${observabilityTracesNewNavID}#/traces?datasourceId=&traceId=03f9c770db5ee2f1caac0afc36db49ba`
    );
  });

  it('should redirect to the old navigation traces URL if trace ID is present and new nav is disabled', () => {
    const locationMock = {
      pathname: `/app/${observabilityTracesID}`,
      hash: '#/traces/03f9c770db5ee2f1caac0afc36db49ba',
    } as Location;

    coreRefs.chrome = { navGroup: { getNavGroupEnabled: jest.fn().mockReturnValue(false) } };

    convertTraceAnalyticsNewNavUrl(locationMock);

    expect(window.location.assign).toHaveBeenCalledWith(
      `/app/${observabilityTracesID}#/traces?datasourceId=&traceId=03f9c770db5ee2f1caac0afc36db49ba`
    );
  });

  it('should redirect to the new navigation services URL if service ID is present and new nav is enabled', () => {
    const locationMock = {
      pathname: `/app/${observabilityTracesID}`,
      hash: '#/services/analytics-service',
    } as Location;

    coreRefs.chrome = { navGroup: { getNavGroupEnabled: jest.fn().mockReturnValue(true) } };

    convertTraceAnalyticsNewNavUrl(locationMock);

    expect(window.location.assign).toHaveBeenCalledWith(
      `/app/${observabilityServicesNewNavID}#/services?datasourceId=&serviceId=analytics-service`
    );
  });

  it('should redirect to the old navigation services URL if service ID is present and new nav is disabled', () => {
    const locationMock = {
      pathname: `/app/${observabilityTracesID}`,
      hash: '#/services/analytics-service',
    } as Location;

    coreRefs.chrome = { navGroup: { getNavGroupEnabled: jest.fn().mockReturnValue(false) } };

    convertTraceAnalyticsNewNavUrl(locationMock);

    expect(window.location.assign).toHaveBeenCalledWith(
      `/app/${observabilityTracesID}#/services?datasourceId=&serviceId=analytics-service`
    );
  });

  it('should redirect to new navigation traces page if on root traces page and new nav is enabled', () => {
    const locationMock = {
      pathname: `/app/${observabilityTracesID}`,
      hash: '#/traces',
    } as Location;

    coreRefs.chrome = { navGroup: { getNavGroupEnabled: jest.fn().mockReturnValue(true) } };

    convertTraceAnalyticsNewNavUrl(locationMock);

    expect(window.location.assign).toHaveBeenCalledWith(
      `/app/${observabilityTracesNewNavID}#/traces`
    );
  });

  it('should redirect to new navigation services page if on root services page and new nav is enabled', () => {
    const locationMock = {
      pathname: `/app/${observabilityTracesID}`,
      hash: '#/services',
    } as Location;

    coreRefs.chrome = { navGroup: { getNavGroupEnabled: jest.fn().mockReturnValue(true) } };

    convertTraceAnalyticsNewNavUrl(locationMock);

    expect(window.location.assign).toHaveBeenCalledWith(
      `/app/${observabilityServicesNewNavID}#/services`
    );
  });

  it('should not redirect if new nav is disabled and on root traces/services page', () => {
    const locationMock = {
      pathname: `/app/${observabilityTracesID}`,
      hash: '#/services',
    } as Location;

    coreRefs.chrome = { navGroup: { getNavGroupEnabled: jest.fn().mockReturnValue(false) } };

    convertTraceAnalyticsNewNavUrl(locationMock);

    expect(window.location.assign).not.toHaveBeenCalled();
  });
});
