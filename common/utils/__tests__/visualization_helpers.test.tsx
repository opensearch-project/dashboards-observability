/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getUserConfigFrom } from '../visualization_helpers';

describe('Utils helper functions', () => {
  describe('getUserConfigFrom', () => {
    it('should return empty object from empty input', () => {
      expect(getUserConfigFrom(undefined)).toEqual({});
      expect(getUserConfigFrom('')).toEqual({});
      expect(getUserConfigFrom({})).toEqual({});
    });
    it('should get object from user_configs json', () => {
      const container = { user_configs: '{ "key": "value" }' };
      expect(getUserConfigFrom(container)).toEqual({ key: 'value' });
    });
    it('should get object from userConfigs', () => {
      const container = { userConfigs: '{ "key": "value" }' };
      expect(getUserConfigFrom(container)).toEqual({ key: 'value' });
    });
  });
});
