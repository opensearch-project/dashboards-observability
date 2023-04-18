/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { observabilityTracesID } from '../../../../../common/constants/shared';

export const convertLegacyTraceAnalyticsUrl = (location: Location) => {
  const pathname = location.pathname.replace('trace-analytics-dashboards', observabilityTracesID);
  const hash = `${location.hash}${
    location.hash.includes('?') ? location.search.replace(/^\?/, '&') : location.search
  }`;
  return pathname + hash;
};
