import Ajv, { JSONSchemaType } from 'ajv';

const ajv = new Ajv();

const templateSchema: JSONSchemaType<IntegrationTemplate> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    version: { type: 'string' },
    integrationType: { type: 'string' },
    license: { type: 'string' },
    author: { type: 'string', nullable: true },
    description: { type: 'string', nullable: true },
    tags: {
      type: 'array',
      items: {
        type: 'string',
      },
      nullable: true,
    },
    sourceUrl: { type: 'string', nullable: true },
    statics: {
      type: 'object',
      properties: {
        mapping: {
          type: 'object',
          properties: {
            logo: { type: 'string', nullable: true },
            gallery: { type: 'array', items: { type: 'string' }, nullable: true },
            darkModeLogo: { type: 'string', nullable: true },
            darkModeGallery: { type: 'array', items: { type: 'string' }, nullable: true },
          },
          additionalProperties: false,
          nullable: true,
        },
        assets: {
          type: 'object',
          patternProperties: {
            '^.*$': {
              type: 'object',
              properties: {
                mimeType: { type: 'string' },
                annotation: { type: 'string', nullable: true },
                data: { type: 'string' },
              },
              required: ['mimeType', 'data'],
              additionalProperties: false,
            },
          },
          required: [],
          nullable: true,
        },
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
          description: { type: 'string', nullable: true },
          sourceUrl: { type: 'string', nullable: true },
          schemaBody: { type: 'string' },
          mappingBody: { type: 'string' },
        },
        required: ['name', 'version', 'schemaBody', 'mappingBody'],
      },
    },
    displayAssets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          body: { type: 'string' },
        },
        required: ['body'],
      },
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
    creationDate: { type: 'string', format: 'date-time' },
    tags: { type: 'array', items: { type: 'string' }, nullable: true },
    status: { type: 'string' },
    assets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          assetType: { type: 'string' },
          assetId: { type: 'string', format: 'uuid' },
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
