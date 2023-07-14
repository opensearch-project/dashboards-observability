/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  doTypeValidation,
  doNestedPropertyValidation,
  doPropertyValidation,
} from '../add_integration_flyout';

describe('Validation', () => {
  describe('doTypeValidation', () => {
    it('should return true if required type is not specified', () => {
      const toCheck = { type: 'string' };
      const required = {};

      const result = doTypeValidation(toCheck, required);

      expect(result).toBe(true);
    });

    it('should return true if types match', () => {
      const toCheck = { type: 'string' };
      const required = { type: 'string' };

      const result = doTypeValidation(toCheck, required);

      expect(result).toBe(true);
    });

    it('should return true if object has properties', () => {
      const toCheck = { properties: { prop1: { type: 'string' } } };
      const required = { type: 'object' };

      const result = doTypeValidation(toCheck, required);

      expect(result).toBe(true);
    });

    it('should return false if types do not match', () => {
      const toCheck = { type: 'string' };
      const required = { type: 'number' };

      const result = doTypeValidation(toCheck, required);

      expect(result).toBe(false);
    });
  });

  describe('doNestedPropertyValidation', () => {
    it('should return true if type validation passes and no properties are required', () => {
      const toCheck = { type: 'string' };
      const required = { type: 'string' };

      const result = doNestedPropertyValidation(toCheck, required);

      expect(result).toBe(true);
    });

    it('should return false if type validation fails', () => {
      const toCheck = { type: 'string' };
      const required = { type: 'number' };

      const result = doNestedPropertyValidation(toCheck, required);

      expect(result).toBe(false);
    });

    it('should return false if a required property is missing', () => {
      const toCheck = { type: 'object', properties: { prop1: { type: 'string' } } };
      const required = {
        type: 'object',
        properties: { prop1: { type: 'string' }, prop2: { type: 'number' } },
      };

      const result = doNestedPropertyValidation(toCheck, required);

      expect(result).toBe(false);
    });

    it('should return true if all required properties pass validation', () => {
      const toCheck = {
        type: 'object',
        properties: {
          prop1: { type: 'string' },
          prop2: { type: 'number' },
        },
      };
      const required = {
        type: 'object',
        properties: {
          prop1: { type: 'string' },
          prop2: { type: 'number' },
        },
      };

      const result = doNestedPropertyValidation(toCheck, required);

      expect(result).toBe(true);
    });
  });

  describe('doPropertyValidation', () => {
    it('should return true if all properties pass validation', () => {
      const rootType = 'root';
      const dataSourceProps = {
        prop1: { type: 'string' },
        prop2: { type: 'number' },
      };
      const requiredMappings = {
        root: {
          template: {
            mappings: {
              properties: {
                prop1: { type: 'string' },
                prop2: { type: 'number' },
              },
            },
          },
        },
      };

      const result = doPropertyValidation(rootType, dataSourceProps as any, requiredMappings);

      expect(result).toBe(true);
    });

    it('should return false if a property fails validation', () => {
      const rootType = 'root';
      const dataSourceProps = {
        prop1: { type: 'string' },
        prop2: { type: 'number' },
      };
      const requiredMappings = {
        root: {
          template: {
            mappings: {
              properties: {
                prop1: { type: 'string' },
                prop2: { type: 'boolean' },
              },
            },
          },
        },
      };

      const result = doPropertyValidation(rootType, dataSourceProps as any, requiredMappings);

      expect(result).toBe(false);
    });

    it('should return false if a required nested property is missing', () => {
      const rootType = 'root';
      const dataSourceProps = {
        prop1: { type: 'string' },
      };
      const requiredMappings = {
        root: {
          template: {
            mappings: {
              properties: {
                prop1: { type: 'string' },
                prop2: { type: 'number' },
              },
            },
          },
        },
      };

      const result = doPropertyValidation(rootType, dataSourceProps as any, requiredMappings);

      expect(result).toBe(false);
    });
  });
});
