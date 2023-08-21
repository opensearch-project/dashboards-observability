/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { validateTemplate, validateInstance } from '../validators';

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
  it('Returns true for a valid Integration Template', () => {
    expect(validateTemplate(validTemplate)).toBe(true);
  });

  it('Returns false if a template is missing a license', () => {
    const sample: any = structuredClone(validTemplate);
    sample.license = undefined;
    expect(validateTemplate(sample)).toBe(false);
  });

  it('Returns false if a template has an invalid type', () => {
    const sample: any = structuredClone(validTemplate);
    sample.components[0].name = 'not-logs';
    expect(validateTemplate(sample)).toBe(false);
  });

  it('Respects logErrors', () => {
    const logValidationErrorsMock = jest.spyOn(console, 'error');
    const sample1: any = structuredClone(validTemplate);
    sample1.license = undefined;
    const sample2: any = structuredClone(validTemplate);
    sample2.components[0].name = 'not-logs';

    expect(validateTemplate(sample1, true)).toBe(false);
    expect(validateTemplate(sample2, true)).toBe(false);
    expect(logValidationErrorsMock).toBeCalledTimes(2);
  });
});

describe('validateInstance', () => {
  it('Returns true for a valid Integration Instance', () => {
    expect(validateInstance(validInstance)).toBe(true);
  });

  it('Returns false if an instance is missing a template', () => {
    const sample: any = structuredClone(validInstance);
    sample.templateName = undefined;
    expect(validateInstance(sample)).toBe(false);
  });

  it('Respects logErrors', () => {
    const logValidationErrorsMock = jest.spyOn(console, 'error');
    const sample1: any = structuredClone(validInstance);
    sample1.templateName = undefined;

    expect(validateInstance(sample1, true)).toBe(false);
    expect(logValidationErrorsMock).toBeCalled();
  });
});
