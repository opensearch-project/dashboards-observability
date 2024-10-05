/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  observabilityTracesID,
  observabilityTracesNewNavID,
  observabilityServicesNewNavID,
} from '../../../../../common/constants/shared';
import { coreRefs } from '../../../../framework/core_refs';

export const convertLegacyTraceAnalyticsUrl = (location: Location) => {
  const pathname = location.pathname.replace('trace-analytics-dashboards', observabilityTracesID);
  const hash = `${location.hash}${
    location.hash.includes('?') ? location.search.replace(/^\?/, '&') : location.search
  }`;
  return pathname + hash;
};

export const convertTraceAnalyticsNewNavUrl = (location: Location) => {
  const pathname = location.pathname;
  const hash = location.hash;

  const isNewNavEnabled = coreRefs?.chrome?.navGroup?.getNavGroupEnabled();

  // Handle service URLs with IDs
  if (hash.includes('#/services/')) {
    const serviceId = location.hash.split('/services/')[1]?.split('?')[0] || '';
    if (serviceId) {
      if (isNewNavEnabled) {
        window.location.assign(
          `/app/${observabilityServicesNewNavID}#/services?datasourceId=&serviceId=${encodeURIComponent(
            serviceId
          )}`
        );
      } else {
        window.location.assign(
          `/app/${observabilityTracesID}#/services?datasourceId=&serviceId=${encodeURIComponent(
            serviceId
          )}`
        );
      }
      return;
    }
  }

  // Handle trace URLs with IDs
  if (hash.includes('#/traces/')) {
    const traceId = location.hash.split('/traces/')[1]?.split('?')[0] || '';
    if (traceId) {
      if (isNewNavEnabled) {
        window.location.assign(
          `/app/${observabilityTracesNewNavID}#/traces?datasourceId=&traceId=${encodeURIComponent(
            traceId
          )}`
        );
      } else {
        window.location.assign(
          `/app/${observabilityTracesID}#/traces?datasourceId=&traceId=${encodeURIComponent(
            traceId
          )}`
        );
      }
      return;
    }
  }

  if (hash === '#/traces') {
    if (isNewNavEnabled) {
      window.location.assign(`/app/${observabilityTracesNewNavID}#/traces`);
    }
    return;
  }

  if (hash === '#/services') {
    if (isNewNavEnabled) {
      window.location.assign(`/app/${observabilityServicesNewNavID}#/services`);
    }
    return;
  }

  if (pathname === `/app/${observabilityTracesID}`) {
    if (isNewNavEnabled) {
      window.location.assign(`/app/${observabilityTracesNewNavID}#/traces`);
    }
  }
};
