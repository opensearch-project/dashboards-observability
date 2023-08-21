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
  },
  required: ['path'],
  additionalProperties: false,
};

const templateSchema: JSONSchemaType<IntegrationTemplate> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    version: { type: 'string' },
    displayName: { type: 'string', nullable: true },
    license: { type: 'string' },
    type: { type: 'string' },
    labels: { type: 'array', items: { type: 'string' }, nullable: true },
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
          },
          required: ['name', 'version'],
          nullable: true,
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    sampleData: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
        },
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

// AJV validators use side effects for errors, so we provide a more conventional wrapper.
// The wrapper optionally handles error logging with the `logErrors` parameter.
export const validateTemplate = (data: { name?: unknown }, logErrors?: true): boolean => {
  if (!templateValidator(data)) {
    if (logErrors) {
      console.error(
        `The integration '${data.name ?? 'config'}' is invalid:`,
        ajv.errorsText(templateValidator.errors)
      );
    }
    return false;
  }
  // We assume an invariant that the type of an integration is connected with its component.
  if (data.components.findIndex((x) => x.name === data.type) < 0) {
    if (logErrors) {
      console.error(`The integration type '${data.type}' must be included as a component`);
    }
    return false;
  }
  return true;
};

export const validateInstance = (data: { name?: unknown }, logErrors?: true): boolean => {
  if (!instanceValidator(data)) {
    if (logErrors) {
      console.error(
        `The integration '${data.name ?? 'instance'} is invalid:`,
        ajv.errorsText(instanceValidator.errors)
      );
    }
    return false;
  }
  return true;
};
