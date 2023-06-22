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

export const templateValidator = ajv.compile(templateSchema);
export const instanceValidator = ajv.compile(instanceSchema);
