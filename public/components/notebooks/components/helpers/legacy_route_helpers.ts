/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { observabilityNotebookID } from '../../../../../common/constants/shared';

export const convertLegacyNotebooksUrl = (location: Location) => {
  const pathname = location.pathname.replace('notebooks-dashboards', observabilityNotebookID);
  const hash = `${location.hash}${
    location.hash.includes('?') ? location.search.replace(/^\?/, '&') : location.search
  }`;
  return pathname + hash;
};
