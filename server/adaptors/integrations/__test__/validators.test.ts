/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { validateTemplate, validateInstance } from '../validators';
import { TEST_INTEGRATION_CONFIG } from '../../../../test/constants';

const validInstance: IntegrationInstance = {
  name: 'test',
  templateName: 'test',
  dataSource: 'test',
  creationDate: new Date(0).toISOString(),
  assets: [],
};

describe('validateTemplate', () => {
  it('Returns a success value for a valid Integration Template', () => {
    const result: Result<IntegrationConfig> = validateTemplate(TEST_INTEGRATION_CONFIG);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(TEST_INTEGRATION_CONFIG);
  });

  it('Returns a failure value if a template is missing a license', () => {
    const sample = structuredClone(TEST_INTEGRATION_CONFIG);
    sample.license = (undefined as unknown) as string;

    const result: Result<IntegrationConfig> = validateTemplate(sample);

    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
  });

  it('Returns a failure if a template has an invalid type', () => {
    const sample = structuredClone(TEST_INTEGRATION_CONFIG);
    sample.components[0].name = 'not-logs';

    const result: Result<IntegrationConfig> = validateTemplate(sample);

    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
  });

  it("Doesn't crash if given a non-object", () => {
    // May happen in some user-provided JSON parsing scenarios.
    expect(validateTemplate([]).ok).toBe(false);
  });
});

describe('validateInstance', () => {
  it('Returns true for a valid Integration Instance', () => {
    const result: Result<IntegrationInstance> = validateInstance(validInstance);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(validInstance);
  });

  it('Returns false if an instance is missing a template', () => {
    const sample: IntegrationInstance = structuredClone(validInstance);
    sample.templateName = (undefined as unknown) as string;

    const result: Result<IntegrationInstance> = validateInstance(sample);

    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
  });

  it("Doesn't crash if given a non-object", () => {
    // May happen in some user-provided JSON parsing scenarios.
    expect(validateInstance([]).ok).toBe(false);
  });
});
