import Ajv, { JSONSchemaType } from 'ajv';

const ajv = new Ajv();

const staticAsset: JSONSchemaType<StaticAsset> = {
  type: 'object',
  properties: {
    mimeType: { type: 'string' },
    path: { type: 'string' },
    annotation: { type: 'string', nullable: true },
  },
  required: ['mimeType', 'path'],
  additionalProperties: false,
};

const templateSchema: JSONSchemaType<IntegrationTemplate> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    version: { type: 'string' },
    integrationType: { type: 'string' },
    license: { type: 'string' },
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
    displayAssets: {
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
  },
  required: ['name', 'version', 'integrationType', 'license', 'components', 'displayAssets'],
  additionalProperties: false,
};

const instanceSchema: JSONSchemaType<IntegrationInstance> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    templateName: { type: 'string' },
    dataSource: {
      type: 'object',
      properties: {
        sourceType: { type: 'string' },
        dataset: { type: 'string' },
        namespace: { type: 'string' },
      },
      required: ['sourceType', 'dataset', 'namespace'],
      additionalProperties: false,
    },
    creationDate: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' }, nullable: true },
    status: { type: 'string' },
    assets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          assetType: { type: 'string' },
          assetId: { type: 'string' },
          status: { type: 'string' },
          isDefaultAsset: { type: 'boolean' },
          description: { type: 'string' },
        },
        required: ['assetType', 'assetId', 'status', 'isDefaultAsset', 'description'],
      },
    },
  },
  required: ['name', 'templateName', 'dataSource', 'creationDate', 'status', 'assets'],
};

export const templateValidator = ajv.compile(templateSchema);
export const instanceValidator = ajv.compile(instanceSchema);
