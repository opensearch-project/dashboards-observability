/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isEmpty, isString } from 'lodash';

/* The file contains helper functions for visualizaitons operations
 * getUserConfigFrom - returns input objects'  user_configs or userConfigs, JSON parsed if necessary
 */

export const getUserConfigFrom = (container: unknown): object => {
  const config = container?.user_configs || container?.userConfigs || {};

  if (isEmpty(config)) return {};

  if (isString(config)) return JSON.parse(config);
  else return {};
};
