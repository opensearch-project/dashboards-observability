/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { validateTemplate, validateInstance, ValidationResult } from '../validators';

const validTemplate: IntegrationTemplate = {
  name: 'test',
  version: '1.0.0',
  license: 'Apache-2.0',
  type: 'logs',
  components: [
    {
      name: 'logs',
      version: '1.0.0',
    },
  ],
  assets: {},
};

const validInstance: IntegrationInstance = {
  name: 'test',
  templateName: 'test',
  dataSource: 'test',
  creationDate: new Date(0).toISOString(),
  assets: [],
};

describe('validateTemplate', () => {
  it('Returns a success value for a valid Integration Template', () => {
    const result: ValidationResult<IntegrationTemplate> = validateTemplate(validTemplate);
    expect(result.ok).toBe(true);
    expect((result as any).value).toBe(validTemplate);
  });

  it('Returns a failure value if a template is missing a license', () => {
    const sample: any = structuredClone(validTemplate);
    sample.license = undefined;

    const result: ValidationResult<IntegrationTemplate> = validateTemplate(sample);

    expect(result.ok).toBe(false);
    expect((result as any).error).toBeInstanceOf(Error);
  });

  it('Returns a failure if a template has an invalid type', () => {
    const sample: any = structuredClone(validTemplate);
    sample.components[0].name = 'not-logs';

    const result: ValidationResult<IntegrationTemplate> = validateTemplate(sample);

    expect(result.ok).toBe(false);
    expect((result as any).error).toBeInstanceOf(Error);
  });

  it("Doesn't crash if given a non-object", () => {
    // May happen in some user-provided JSON parsing scenarios.
    expect(validateTemplate([] as any).ok).toBe(false);
  });
});

describe('validateInstance', () => {
  it('Returns true for a valid Integration Instance', () => {
    const result: ValidationResult<IntegrationInstance> = validateInstance(validInstance);
    expect(result.ok).toBe(true);
    expect((result as any).value).toBe(validInstance);
  });

  it('Returns false if an instance is missing a template', () => {
    const sample: any = structuredClone(validInstance);
    sample.templateName = undefined;

    const result: ValidationResult<IntegrationInstance> = validateInstance(sample);

    expect(result.ok).toBe(false);
    expect((result as any).error).toBeInstanceOf(Error);
  });

  it("Doesn't crash if given a non-object", () => {
    // May happen in some user-provided JSON parsing scenarios.
    expect(validateInstance([] as any).ok).toBe(false);
  });
});
