/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  checkDataSourceName,
  doTypeValidation,
  doNestedPropertyValidation,
  doPropertyValidation,
  fetchDataSourceMappings,
  fetchIntegrationMappings,
  doExistingDataSourceValidation,
} from '../create_integration_helpers';
import * as create_integration_helpers from '../create_integration_helpers';
import { HttpSetup } from '../../../../../../../src/core/public';

describe('doTypeValidation', () => {
  it('should return true if required type is not specified', () => {
    const toCheck = { type: 'string' };
    const required = {};

    const result = doTypeValidation(toCheck, required);

    expect(result.ok).toBe(true);
  });

  it('should return true if types match', () => {
    const toCheck = { type: 'string' };
    const required = { type: 'string' };

    const result = doTypeValidation(toCheck, required);

    expect(result.ok).toBe(true);
  });

  it('should return true if object has properties', () => {
    const toCheck = { properties: { prop1: { type: 'string' } } };
    const required = { type: 'object' };

    const result = doTypeValidation(toCheck, required);

    expect(result.ok).toBe(true);
  });

  it('should return false if types do not match', () => {
    const toCheck = { type: 'string' };
    const required = { type: 'number' };

    const result = doTypeValidation(toCheck, required);

    expect(result.ok).toBe(false);
  });
});

describe('doNestedPropertyValidation', () => {
  it('should return true if type validation passes and no properties are required', () => {
    const toCheck = { type: 'string' };
    const required = { type: 'string' };

    const result = doNestedPropertyValidation(toCheck, required);

    expect(result.ok).toBe(true);
  });

  it('should return false if type validation fails', () => {
    const toCheck = { type: 'string' };
    const required = { type: 'number' };

    const result = doNestedPropertyValidation(toCheck, required);

    expect(result.ok).toBe(false);
  });

  it('should return false if a required property is missing', () => {
    const toCheck = { type: 'object', properties: { prop1: { type: 'string' } } };
    const required = {
      type: 'object',
      properties: { prop1: { type: 'string' }, prop2: { type: 'number' } },
    };

    const result = doNestedPropertyValidation(toCheck, required);

    expect(result.ok).toBe(false);
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

    expect(result.ok).toBe(true);
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

    expect(result.ok).toBe(true);
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

    expect(result.ok).toBe(false);
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

    expect(result.ok).toBe(false);
  });
});

describe('checkDataSourceName', () => {
  it('Filters out invalid index names', () => {
    const result = checkDataSourceName('ss4o_logs-no-exclams!', 'logs');

    expect(result.ok).toBe(false);
  });

  it('Filters out incorrectly typed indices', () => {
    const result = checkDataSourceName('ss4o_metrics-test-test', 'logs');

    expect(result.ok).toBe(false);
  });

  it('Accepts correct indices', () => {
    const result = checkDataSourceName('ss4o_logs-test-test', 'logs');

    expect(result.ok).toBe(true);
  });
});

describe('fetchDataSourceMappings', () => {
  it('Retrieves mappings', async () => {
    const mockHttp = {
      post: jest.fn().mockResolvedValue({
        source1: { mappings: { properties: { test: true } } },
        source2: { mappings: { properties: { test: true } } },
      }),
    } as Partial<HttpSetup>;

    const result = fetchDataSourceMappings('sample', mockHttp as HttpSetup);

    await expect(result).resolves.toMatchObject({
      source1: { properties: { test: true } },
      source2: { properties: { test: true } },
    });
  });

  it('Catches errors', async () => {
    const mockHttp = {
      post: jest.fn().mockRejectedValue(new Error('Mock error')),
    } as Partial<HttpSetup>;

    const result = fetchDataSourceMappings('sample', mockHttp as HttpSetup);

    await expect(result).resolves.toBeNull();
  });
});

describe('fetchIntegrationMappings', () => {
  it('Returns schema mappings', async () => {
    const mockHttp = {
      get: jest.fn().mockResolvedValue({ data: { mappings: { test: true } }, statusCode: 200 }),
    } as Partial<HttpSetup>;

    const result = fetchIntegrationMappings('target', mockHttp as HttpSetup);

    await expect(result).resolves.toStrictEqual({ test: true });
  });

  it('Returns null if response fails', async () => {
    const mockHttp = {
      get: jest.fn().mockResolvedValue({ statusCode: 404 }),
    } as Partial<HttpSetup>;

    const result = fetchIntegrationMappings('target', mockHttp as HttpSetup);

    await expect(result).resolves.toBeNull();
  });

  it('Catches request error', async () => {
    const mockHttp = {
      get: jest.fn().mockRejectedValue(new Error('mock error')),
    } as Partial<HttpSetup>;

    const result = fetchIntegrationMappings('target', mockHttp as HttpSetup);

    await expect(result).resolves.toBeNull();
  });
});

describe('doExistingDataSourceValidation', () => {
  it('Catches and returns checkDataSourceName errors', async () => {
    const mockHttp = {} as Partial<HttpSetup>;
    jest
      .spyOn(create_integration_helpers, 'checkDataSourceName')
      .mockReturnValue({ ok: false, errors: ['mock'] });

    const result = doExistingDataSourceValidation('target', 'name', 'type', mockHttp as HttpSetup);

    await expect(result).resolves.toHaveProperty('ok', false);
  });

  it('Catches data stream fetch errors', async () => {
    const mockHttp = {} as Partial<HttpSetup>;
    jest.spyOn(create_integration_helpers, 'checkDataSourceName').mockReturnValue({ ok: true });
    jest.spyOn(create_integration_helpers, 'fetchDataSourceMappings').mockResolvedValue(null);
    jest
      .spyOn(create_integration_helpers, 'fetchIntegrationMappings')
      .mockResolvedValue({ test: { template: { mappings: {} } } });

    const result = doExistingDataSourceValidation('target', 'name', 'type', mockHttp as HttpSetup);

    await expect(result).resolves.toHaveProperty('ok', false);
  });

  it('Catches integration fetch errors', async () => {
    const mockHttp = {} as Partial<HttpSetup>;
    jest.spyOn(create_integration_helpers, 'checkDataSourceName').mockReturnValue({ ok: true });
    jest
      .spyOn(create_integration_helpers, 'fetchDataSourceMappings')
      .mockResolvedValue({ test: { properties: {} } });
    jest.spyOn(create_integration_helpers, 'fetchIntegrationMappings').mockResolvedValue(null);

    const result = doExistingDataSourceValidation('target', 'name', 'type', mockHttp as HttpSetup);

    await expect(result).resolves.toHaveProperty('ok', false);
  });

  it('Catches type validation issues', async () => {
    const mockHttp = {} as Partial<HttpSetup>;
    jest.spyOn(create_integration_helpers, 'checkDataSourceName').mockReturnValue({ ok: true });
    jest
      .spyOn(create_integration_helpers, 'fetchDataSourceMappings')
      .mockResolvedValue({ test: { properties: {} } });
    jest
      .spyOn(create_integration_helpers, 'fetchIntegrationMappings')
      .mockResolvedValue({ test: { template: { mappings: {} } } });
    jest
      .spyOn(create_integration_helpers, 'doPropertyValidation')
      .mockReturnValue({ ok: false, errors: ['mock'] });

    const result = doExistingDataSourceValidation('target', 'name', 'type', mockHttp as HttpSetup);

    await expect(result).resolves.toHaveProperty('ok', false);
  });

  it('Returns no errors if everything passes', async () => {
    const mockHttp = {} as Partial<HttpSetup>;
    jest.spyOn(create_integration_helpers, 'checkDataSourceName').mockReturnValue({ ok: true });
    jest
      .spyOn(create_integration_helpers, 'fetchDataSourceMappings')
      .mockResolvedValue({ test: { properties: {} } });
    jest
      .spyOn(create_integration_helpers, 'fetchIntegrationMappings')
      .mockResolvedValue({ test: { template: { mappings: {} } } });
    jest.spyOn(create_integration_helpers, 'doPropertyValidation').mockReturnValue({ ok: true });

    const result = doExistingDataSourceValidation('target', 'name', 'type', mockHttp as HttpSetup);

    await expect(result).resolves.toHaveProperty('ok', true);
  });
});
