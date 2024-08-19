/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// eslint-disable-next-line jest/no-mocks-import
import httpClientMock from '../../../../../test/__mocks__/httpClientMock';
import { AddedIntegrationsTableProps } from '../added_integration_overview_page';
import {
  AvailableIntegrationsCardViewProps,
  AvailableIntegrationsTableProps,
} from '../available_integration_overview_page';

export const availableCardViewData: AvailableIntegrationsCardViewProps = {
  data: {
    hits: [
      {
        name: 'nginx',
        version: '1.0.1',
        displayName: 'NginX Dashboard',
        description: 'Nginx HTTP server collector',
        license: 'Apache-2.0',
        type: 'logs',
        author: 'John Doe',
        sourceUrl: 'https://github.com/',
        statics: {
          logo: { annotation: 'NginX Logo', path: 'logo.svg' },
          gallery: [
            { annotation: 'NginX Dashboard', path: 'dashboard1.png' },
            { annotation: 'NginX Logo', path: 'logo.svg' },
          ],
        },
        components: [
          { name: 'communication', version: '1.0.0' },
          { name: 'http', version: '1.0.0' },
          { name: 'logs', version: '1.0.0' },
        ],
        assets: [
          { name: 'nginx', version: '1.0.1', extension: 'ndjson', type: 'savedObjectBundle' },
        ],
      },
    ],
  },
  isCardView: false,
  setCardView: () => {},
  query: '',
  setQuery: () => {},
  http: {
    ...httpClientMock,
    basePath: {
      get: jest.fn(),
      prepend: jest.fn(),
      remove: jest.fn(),
      serverBasePath: 'mock_base',
    },
  },
};

export const availableTableViewData: AvailableIntegrationsTableProps = {
  data: {
    hits: [
      {
        name: 'nginx',
        version: '1.0.1',
        displayName: 'NginX Dashboard',
        description: 'Nginx HTTP server collector',
        license: 'Apache-2.0',
        type: 'logs',
        author: 'John Doe',
        sourceUrl: 'https://github.com/',
        statics: {
          logo: { annotation: 'NginX Logo', path: 'logo.svg' },
          gallery: [
            { annotation: 'NginX Dashboard', path: 'dashboard1.png' },
            { annotation: 'NginX Logo', path: 'logo.svg' },
          ],
        },
        components: [
          { name: 'communication', version: '1.0.0' },
          { name: 'http', version: '1.0.0' },
          { name: 'logs', version: '1.0.0' },
        ],
        assets: [
          { name: 'nginx', version: '1.0.1', extension: 'ndjson', type: 'savedObjectBundle' },
        ],
      },
    ],
  },
  loading: false,
  isCardView: false,
  setCardView: () => {},
};

export const addedIntegrationData: AddedIntegrationsTableProps = {
  setData: () => {},
  http: httpClientMock,
  data: {
    hits: [
      {
        name: 'nginx',
        templateName: 'nginx',
        dataSource: { sourceType: 'logs', dataset: 'nginx', namespace: 'prod' },
        creationDate: '2023-06-15T16:28:36.370Z',
        status: 'active',
        addedBy: 'admin',
        assets: [
          {
            assetType: 'index-pattern',
            assetId: '3fc41705-8a23-49f4-926c-2819e0d7306d',
            status: 'available',
            isDefaultAsset: false,
            description: 'ss4o_logs-nginx-prod',
          },
          {
            assetType: 'search',
            assetId: 'a0415ddd-047d-4c02-8769-d14bfb70f525',
            status: 'available',
            isDefaultAsset: false,
            description: '[NGINX Core Logs 1.0] Nginx Access Logs',
          },
          {
            assetType: 'visualization',
            assetId: 'a17cd453-fb2f-4c24-81db-aedfc8682829',
            status: 'available',
            isDefaultAsset: false,
            description: '[NGINX Core Logs 1.0] Response codes over time',
          },
          {
            assetType: 'search',
            assetId: '3e47dfed-d9ff-4c1b-b425-04ffc8ed3fa9',
            status: 'available',
            isDefaultAsset: false,
            description: '[NGINX Core Logs 1.0] Nginx Error Logs',
          },
          {
            assetType: 'visualization',
            assetId: '641c2a03-eead-4900-94ee-e12d2fef8383',
            status: 'available',
            isDefaultAsset: false,
            description: '[NGINX Core Logs 1.0] Errors over time',
          },
          {
            assetType: 'visualization',
            assetId: 'ce61594d-8307-4358-9b7e-71101b3ed722',
            status: 'available',
            isDefaultAsset: false,
            description: 'Data Volume',
          },
          {
            assetType: 'visualization',
            assetId: '452bd6e3-3b50-407f-88f2-c35a29c56051',
            status: 'available',
            isDefaultAsset: false,
            description: 'Top Paths',
          },
          {
            assetType: 'visualization',
            assetId: '14a1ddab-08c1-4aba-ba3b-88bae36f7e50',
            status: 'available',
            isDefaultAsset: false,
            description: 'Requests per Minute',
          },
          {
            assetType: 'dashboard',
            assetId: '179bad58-c840-4c6c-9fd8-1667c14bd03a',
            status: 'available',
            isDefaultAsset: true,
            description: '[NGINX Core Logs 1.0] Overview',
          },
        ],
        id: 'ad7e6e30-0b99-11ee-b27c-c9863222e9bf',
      },
    ],
  },
  loading: false,
};

export const addedIntegrationDataWithoutMDS: AddedIntegrationsTableProps = {
  setData: () => {},
  http: httpClientMock,
  data: {
    hits: [
      {
        name: 'nginx',
        templateName: 'nginx',
        dataSource: { sourceType: 'logs', dataset: 'nginx', namespace: 'prod' },
        creationDate: '2023-06-15T16:28:36.370Z',
        status: 'active',
        addedBy: 'admin',
        assets: [
          {
            assetType: 'index-pattern',
            assetId: '3fc41705-8a23-49f4-926c-2819e0d7306d',
            status: 'available',
            isDefaultAsset: false,
            description: 'ss4o_logs-nginx-prod',
          },
          {
            assetType: 'search',
            assetId: 'a0415ddd-047d-4c02-8769-d14bfb70f525',
            status: 'available',
            isDefaultAsset: false,
            description: '[NGINX Core Logs 1.0] Nginx Access Logs',
          },
          {
            assetType: 'visualization',
            assetId: 'a17cd453-fb2f-4c24-81db-aedfc8682829',
            status: 'available',
            isDefaultAsset: false,
            description: '[NGINX Core Logs 1.0] Response codes over time',
          },
          {
            assetType: 'search',
            assetId: '3e47dfed-d9ff-4c1b-b425-04ffc8ed3fa9',
            status: 'available',
            isDefaultAsset: false,
            description: '[NGINX Core Logs 1.0] Nginx Error Logs',
          },
          {
            assetType: 'visualization',
            assetId: '641c2a03-eead-4900-94ee-e12d2fef8383',
            status: 'available',
            isDefaultAsset: false,
            description: '[NGINX Core Logs 1.0] Errors over time',
          },
          {
            assetType: 'visualization',
            assetId: 'ce61594d-8307-4358-9b7e-71101b3ed722',
            status: 'available',
            isDefaultAsset: false,
            description: 'Data Volume',
          },
          {
            assetType: 'visualization',
            assetId: '452bd6e3-3b50-407f-88f2-c35a29c56051',
            status: 'available',
            isDefaultAsset: false,
            description: 'Top Paths',
          },
          {
            assetType: 'visualization',
            assetId: '14a1ddab-08c1-4aba-ba3b-88bae36f7e50',
            status: 'available',
            isDefaultAsset: false,
            description: 'Requests per Minute',
          },
          {
            assetType: 'dashboard',
            assetId: '179bad58-c840-4c6c-9fd8-1667c14bd03a',
            status: 'available',
            isDefaultAsset: true,
            description: '[NGINX Core Logs 1.0] Overview',
          },
        ],
        id: 'ad7e6e30-0b99-11ee-b27c-c9863222e9bf',
      },
    ],
  },
  loading: false,
};

export const testIntegrationInstanceData = {
  data: {
    id: 'ad7e6e30-0b99-11ee-b27c-c9863222e9bf',
    status: 'unknown',
    name: 'nginx',
    templateName: 'nginx',
    dataSource: { sourceType: 'logs', dataset: 'nginx', namespace: 'prod' },
    creationDate: '2023-06-15T16:28:36.370Z',
    assets: [
      {
        assetType: 'index-pattern',
        assetId: '3fc41705-8a23-49f4-926c-2819e0d7306d',
        status: 'available',
        isDefaultAsset: false,
        description: 'ss4o_logs-nginx-prod',
      },
      {
        assetType: 'search',
        assetId: 'a0415ddd-047d-4c02-8769-d14bfb70f525',
        status: 'available',
        isDefaultAsset: false,
        description: '[NGINX Core Logs 1.0] Nginx Access Logs',
      },
      {
        assetType: 'visualization',
        assetId: 'a17cd453-fb2f-4c24-81db-aedfc8682829',
        status: 'available',
        isDefaultAsset: false,
        description: '[NGINX Core Logs 1.0] Response codes over time',
      },
      {
        assetType: 'search',
        assetId: '3e47dfed-d9ff-4c1b-b425-04ffc8ed3fa9',
        status: 'available',
        isDefaultAsset: false,
        description: '[NGINX Core Logs 1.0] Nginx Error Logs',
      },
      {
        assetType: 'visualization',
        assetId: '641c2a03-eead-4900-94ee-e12d2fef8383',
        status: 'available',
        isDefaultAsset: false,
        description: '[NGINX Core Logs 1.0] Errors over time',
      },
      {
        assetType: 'visualization',
        assetId: 'ce61594d-8307-4358-9b7e-71101b3ed722',
        status: 'available',
        isDefaultAsset: false,
        description: 'Data Volume',
      },
      {
        assetType: 'visualization',
        assetId: '452bd6e3-3b50-407f-88f2-c35a29c56051',
        status: 'available',
        isDefaultAsset: false,
        description: 'Top Paths',
      },
      {
        assetType: 'visualization',
        assetId: '14a1ddab-08c1-4aba-ba3b-88bae36f7e50',
        status: 'available',
        isDefaultAsset: false,
        description: 'Requests per Minute',
      },
      {
        assetType: 'dashboard',
        assetId: '179bad58-c840-4c6c-9fd8-1667c14bd03a',
        status: 'available',
        isDefaultAsset: true,
        description: '[NGINX Core Logs 1.0] Overview',
      },
    ],
  },
};

export const nginxIntegrationData = {
  integration: {
    name: 'nginx',
    version: '1.0.1',
    displayName: 'NginX Dashboard',
    integrationType: 'logs',
    description: 'Nginx HTTP server collector',
    license: 'Apache-2.0',
    type: 'logs',
    author: 'John Doe',
    sourceUrl: 'https://github.com/',
    statics: {
      logo: { annotation: 'NginX Logo', path: 'logo.svg' },
      gallery: [
        { annotation: 'NginX Dashboard', path: 'dashboard1.png' },
        { annotation: 'NginX Logo', path: 'logo.svg' },
      ],
    },
    components: [
      { name: 'communication', version: '1.0.0' },
      { name: 'http', version: '1.0.0' },
      { name: 'logs', version: '1.0.0' },
    ],
    assets: { savedObjects: { name: 'nginx', version: '1.0.1' } },
  },
};
