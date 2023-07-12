/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import _ from 'lodash';
import { CounterType } from './types';

export const WINDOW = 3600;
export const INTERVAL = 60;
export const CAPACITY = (WINDOW / INTERVAL) * 2;
export const MILLIS_MULTIPLIER = 1000;

export const COMPONENTS = [
  'application_analytics',
  'operational_panels',
  'event_analytics',
  'notebooks',
  'trace_analytics',
  'metrics_analytics',
  'integrations',
] as const;
export const REQUESTS = ['create', 'get', 'update', 'delete'] as const;

export const GLOBAL_BASIC_COUNTER: CounterType = (() => {
  const counter = {} as CounterType;
  Object.entries(COMPONENTS).forEach(([component, requests]) => {
    requests.forEach((request) => {
      _.set(counter, [component, request, 'total'], 0);
    });
  });
  return counter;
})();

export const DEFAULT_ROLLING_COUNTER: CounterType = (() => {
  const counter = {} as CounterType;
  Object.entries(COMPONENTS).forEach(([component, requests]) => {
    requests.forEach((request) => {
      _.set(counter, [component, request, 'count'], 0);
      _.set(counter, [component, request, 'system_error'], 0);
      _.set(counter, [component, request, 'user_error'], 0);
    });
  });
  return counter;
})();
