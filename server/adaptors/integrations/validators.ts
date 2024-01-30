/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import Ajv, { JSONSchemaType } from 'ajv';

const ajv = new Ajv();

const staticAsset: JSONSchemaType<StaticAsset> = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    annotation: { type: 'string', nullable: true },
    data: { type: 'string', nullable: true },
  },
  required: ['path'],
  additionalProperties: false,
};

const templateSchema: JSONSchemaType<IntegrationConfig> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    version: { type: 'string' },
    displayName: { type: 'string', nullable: true },
    license: { type: 'string' },
    type: { type: 'string' },
    labels: { type: 'array', items: { type: 'string' }, nullable: true },
    tags: { type: 'array', items: { type: 'string' }, nullable: true },
    author: { type: 'string', nullable: true },
    description: { type: 'string', nullable: true },
    sourceUrl: { type: 'string', nullable: true },
    statics: {
      type: 'object',
      properties: {
        logo: { ...staticAsset, nullable: true },
        gallery: { type: 'array', items: staticAsset, nullable: true },
        darkModeLogo: { ...staticAsset, nullable: true },
        darkModeGallery: { type: 'array', items: staticAsset, nullable: true },
      },
      additionalProperties: false,
      nullable: true,
    },
    components: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
          data: { type: 'string', nullable: true },
        },
        required: ['name', 'version'],
      },
    },
    assets: {
      type: 'object',
      properties: {
        savedObjects: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            version: { type: 'string' },
            data: { type: 'string', nullable: true },
          },
          required: ['name', 'version'],
          nullable: true,
          additionalProperties: false,
        },
        queries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              version: { type: 'string' },
              language: { type: 'string' },
              data: { type: 'string', nullable: true },
            },
            required: ['name', 'version', 'language'],
          },
          nullable: true,
        },
      },
      additionalProperties: false,
    },
    sampleData: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        data: { type: 'string', nullable: true },
      },
      required: ['path'],
      additionalProperties: false,
      nullable: true,
    },
  },
  required: ['name', 'version', 'license', 'type', 'components', 'assets'],
  additionalProperties: false,
};

const instanceSchema: JSONSchemaType<IntegrationInstance> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    templateName: { type: 'string' },
    dataSource: { type: 'string' },
    creationDate: { type: 'string' },
    assets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          assetType: { type: 'string' },
          assetId: { type: 'string' },
          isDefaultAsset: { type: 'boolean' },
          description: { type: 'string' },
        },
        required: ['assetType', 'assetId', 'isDefaultAsset', 'description'],
      },
    },
  },
  required: ['name', 'templateName', 'dataSource', 'creationDate', 'assets'],
};

const templateValidator = ajv.compile(templateSchema);
const instanceValidator = ajv.compile(instanceSchema);

/**
 * Validates an integration template against a predefined schema using the AJV library.
 * Since AJV validators use side effects for errors,
 * this is a more conventional wrapper that simplifies calling.
 *
 * @param data The data to be validated as an IntegrationTemplate.
 * @return A Result indicating whether the validation was successful or not.
 *         If validation succeeds, returns an object with 'ok' set to true and the validated data.
 *         If validation fails, returns an object with 'ok' set to false and an Error object describing the validation error.
 */
export const validateTemplate = (data: unknown): Result<IntegrationConfig> => {
  if (!templateValidator(data)) {
    return { ok: false, error: new Error(ajv.errorsText(templateValidator.errors)) };
  }
  // We assume an invariant that the type of an integration is connected with its component.
  if (data.components.findIndex((x) => x.name === data.type) < 0) {
    return {
      ok: false,
      error: new Error(`The integration type '${data.type}' must be included as a component`),
    };
  }
  return {
    ok: true,
    value: data,
  };
};

/**
 * Validates an integration instance against a predefined schema using the AJV library.
 *
 * @param data The data to be validated as an IntegrationInstance.
 * @return A Result indicating whether the validation was successful or not.
 *         If validation succeeds, returns an object with 'ok' set to true and the validated data.
 *         If validation fails, returns an object with 'ok' set to false and an Error object describing the validation error.
 */
export const validateInstance = (data: unknown): Result<IntegrationInstance> => {
  if (!instanceValidator(data)) {
    return {
      ok: false,
      error: new Error(ajv.errorsText(instanceValidator.errors)),
    };
  }
  return {
    ok: true,
    value: data,
  };
};
