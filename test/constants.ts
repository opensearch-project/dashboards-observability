/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AvailableIntegrationsList } from 'public/components/integrations/components/available_integration_overview_page';
import { IntegrationSetupInputs } from 'public/components/integrations/components/setup_integration';

export const TEST_SPAN_RESPONSE = {
  took: 1,
  timed_out: false,
  _shards: {
    total: 1,
    successful: 1,
    skipped: 0,
    failed: 0,
  },
  hits: {
    total: {
      value: 3,
      relation: 'eq',
    },
    max_score: 4.4400907,
    hits: [
      {
        _index: 'otel-v1-apm-span-000001',
        _type: '_doc',
        _id: '67c279e1100d75c3',
        _score: 4.4400907,
        _source: {
          traceId: '03f9c770db5ee2f1caac0afc36db49ba',
          spanId: '67c279e1100d75c3',
          traceState: '',
          parentSpanId: '',
          name: 'client_pay_order',
          kind: 'SPAN_KIND_INTERNAL',
          startTime: '2021-03-25T17:23:45.724285696Z',
          endTime: '2021-03-25T17:23:45.949285120Z',
          durationInNanos: 224999424,
          serviceName: 'frontend-client',
          events: [],
          links: [],
          droppedAttributesCount: 0,
          droppedEventsCount: 0,
          droppedLinksCount: 0,
          traceGroup: 'client_pay_order',
          'traceGroupFields.endTime': '2021-03-25T17:23:45.949285120Z',
          'traceGroupFields.statusCode': 0,
          'traceGroupFields.durationInNanos': 224999424,
          'resource.attributes.telemetry@sdk@name': 'opentelemetry',
          'resource.attributes.telemetry@sdk@language': 'python',
          'resource.attributes.telemetry@sdk@version': '0.14b0',
          'resource.attributes.service@name': 'frontend-client',
          'resource.attributes.host@hostname': 'ip-172-31-10-8.us-west-2.compute.internal',
          'status.code': 0,
          'instrumentationLibrary.name': '__main__',
        },
      },
      {
        _index: 'otel-v1-apm-span-000001',
        _type: '_doc',
        _id: '11c4d645b0b6544a',
        _score: 4.4400907,
        _source: {
          traceId: '03f9c770db5ee2f1caac0afc36db49ba',
          spanId: '11c4d645b0b6544a',
          traceState: '',
          parentSpanId: 'e8e61cf518ff0d47',
          name: 'pay_order',
          kind: 'SPAN_KIND_SERVER',
          startTime: '2021-03-25T17:23:45.728619520Z',
          endTime: '2021-03-25T17:23:45.909096192Z',
          durationInNanos: 180476672,
          serviceName: 'order',
          events: [],
          links: [],
          droppedAttributesCount: 0,
          droppedEventsCount: 0,
          droppedLinksCount: 0,
          traceGroup: 'client_pay_order',
          'traceGroupFields.endTime': '2021-03-25T17:23:45.949285120Z',
          'traceGroupFields.statusCode': 0,
          'traceGroupFields.durationInNanos': 224999424,
          'span.attributes.net@peer@ip': '127.0.0.1',
          'instrumentationLibrary.version': '0.14b0',
          'resource.attributes.telemetry@sdk@language': 'python',
          'span.attributes.host@port': 8088,
          'span.attributes.http@status_text': 'OK',
          'resource.attributes.telemetry@sdk@version': '0.14b0',
          'resource.attributes.service@instance@id': '139858677314952',
          'resource.attributes.service@name': 'order',
          'span.attributes.component': 'http',
          'status.code': 0,
          'instrumentationLibrary.name': 'opentelemetry.instrumentation.flask',
          'span.attributes.http@method': 'POST',
          'span.attributes.http@user_agent': 'python-requests/2.25.1',
          'span.attributes.net@peer@port': 56894,
          'resource.attributes.telemetry@sdk@name': 'opentelemetry',
          'span.attributes.http@server_name': '0.0.0.0',
          'span.attributes.http@route': '/pay_order',
          'span.attributes.http@host': 'localhost:8088',
          'span.attributes.http@target': '/pay_order',
          'span.attributes.http@scheme': 'http',
          'resource.attributes.host@hostname': 'ip-172-31-10-8.us-west-2.compute.internal',
          'span.attributes.http@flavor': '1.1',
          'span.attributes.http@status_code': 200,
        },
      },
      {
        _index: 'otel-v1-apm-span-000001',
        _type: '_doc',
        _id: '421660af43ed2f96',
        _score: 4.4400907,
        _source: {
          traceId: '03f9c770db5ee2f1caac0afc36db49ba',
          spanId: '421660af43ed2f96',
          traceState: '',
          parentSpanId: 'a4869b984bdcdb69',
          name: 'cart_sold',
          kind: 'SPAN_KIND_INTERNAL',
          startTime: '2021-03-25T17:23:45.745376768Z',
          endTime: '2021-03-25T17:23:45.819226880Z',
          durationInNanos: 73850112,
          serviceName: 'database',
          events: [],
          links: [],
          droppedAttributesCount: 0,
          droppedEventsCount: 0,
          droppedLinksCount: 0,
          traceGroup: 'client_pay_order',
          'traceGroupFields.endTime': '2021-03-25T17:23:45.949285120Z',
          'traceGroupFields.statusCode': 0,
          'traceGroupFields.durationInNanos': 224999424,
          'resource.attributes.telemetry@sdk@name': 'opentelemetry',
          'resource.attributes.telemetry@sdk@language': 'python',
          'resource.attributes.telemetry@sdk@version': '0.14b0',
          'resource.attributes.service@instance@id': '140307275923408',
          'resource.attributes.service@name': 'database',
          'resource.attributes.host@hostname': 'ip-172-31-10-8.us-west-2.compute.internal',
          'status.code': 0,
          'instrumentationLibrary.name': '__main__',
        },
      },
    ],
  },
};
export const TEST_JAEGER_SPAN_RESPONSE = {
  took: 10,
  timed_out: false,
  _shards: {
    total: 5,
    successful: 5,
    skipped: 0,
    failed: 0,
  },
  hits: {
    total: {
      value: 1,
      relation: 'eq',
    },
    max_score: 4.0943446,
    hits: [
      {
        _index: 'jaeger-span-2022-12-16',
        _id: 'FQ_alIUB3s3m6OOm24MJ',
        _score: 4.0943446,
        _source: {
          traceID: '00de6a9aaf045bd4',
          spanID: '00de6a9aaf045bd4',
          flags: 1,
          operationName: 'HTTP GET /config',
          references: [],
          startTime: 1671214092597974,
          startTimeMillis: 1671214092597,
          duration: 40,
          tags: [],
          tag: {
            component: 'net/http',
            'http@method': 'GET',
            'http@status_code': 200,
            'http@url': '/config?nonse=0.8009634976926217',
            'internal@span@format': 'proto',
            'sampler@param': true,
            'sampler@type': 'const',
            'span@kind': 'server',
          },
          logs: [],
          process: {
            serviceName: 'frontend',
            tags: [],
            tag: {
              'client-uuid': '40958cebd77cf9a2',
              hostname: 'b0f1d89879ca',
              ip: '10.18.203.1',
              'jaeger@version': 'Go-2.30.0',
            },
          },
        },
      },
    ],
  },
};

export const TEST_SERVICE_MAP_GRAPH = {
  graph: {
    nodes: [
      {
        id: 1,
        label: 'order',
        size: 15,
        title: 'order\n\n Average duration: 90.1ms \n Error rate: 4.17% \n Request rate: 48',
        borderWidth: 3,
        color: {
          background: 'rgba(158, 134, 192, 1)',
          border: '#4A4A4A',
        },
        font: {
          color: 'rgba(72, 122, 180, 1)',
        },
        average_latency: 'Average duration: 90.1ms',
        error_rate: 'Error rate: 4.17%',
        throughput: 'Request rate: 48',
      },
      {
        id: 2,
        label: 'analytics-service',
        size: 15,
        title:
          'analytics-service\n\n Average duration: 12.99ms \n Error rate: 0% \n Request rate: 37',
        borderWidth: 3,
        color: {
          background: 'rgba(210, 202, 224, 1)',
          border: '#4A4A4A',
        },
        font: {
          color: 'rgba(72, 122, 180, 1)',
        },
        average_latency: 'Average duration: 12.99ms',
        error_rate: 'Error rate: 0%',
        throughput: 'Request rate: 37',
      },
      {
        id: 3,
        label: 'database',
        size: 15,
        title: 'database\n\n Average duration: 49.54ms \n Error rate: 3.77% \n Request rate: 53',
        borderWidth: 3,
        color: {
          background: 'rgba(187, 171, 212, 1)',
          border: '#4A4A4A',
        },
        font: {
          color: 'rgba(72, 122, 180, 1)',
        },
        average_latency: 'Average duration: 49.54ms',
        error_rate: 'Error rate: 3.77%',
        throughput: 'Request rate: 53',
      },
      {
        id: 4,
        label: 'frontend-client',
        size: 15,
        title:
          'frontend-client\n\n Average duration: 207.71ms \n Error rate: 7.41% \n Request rate: 27',
        borderWidth: 3,
        color: {
          background: 'rgba(78, 42, 122, 1)',
          border: '#4A4A4A',
        },
        font: {
          color: 'rgba(72, 122, 180, 1)',
        },
        average_latency: 'Average duration: 207.71ms',
        error_rate: 'Error rate: 7.41%',
        throughput: 'Request rate: 27',
      },
      {
        id: 5,
        label: 'inventory',
        size: 15,
        title: 'inventory\n\n Average duration: 183.52ms \n Error rate: 3.23% \n Request rate: 31',
        borderWidth: 3,
        color: {
          background: 'rgba(95, 61, 138, 1)',
          border: '#4A4A4A',
        },
        font: {
          color: 'rgba(72, 122, 180, 1)',
        },
        average_latency: 'Average duration: 183.52ms',
        error_rate: 'Error rate: 3.23%',
        throughput: 'Request rate: 31',
      },
      {
        id: 6,
        label: 'authentication',
        size: 15,
        title:
          'authentication\n\n Average duration: 139.09ms \n Error rate: 8.33% \n Request rate: 12',
        borderWidth: 3,
        color: {
          background: 'rgba(125, 95, 166, 1)',
          border: '#4A4A4A',
        },
        font: {
          color: 'rgba(72, 122, 180, 1)',
        },
        average_latency: 'Average duration: 139.09ms',
        error_rate: 'Error rate: 8.33%',
        throughput: 'Request rate: 12',
      },
      {
        id: 7,
        label: 'payment',
        size: 15,
        title: 'payment\n\n Average duration: 134.36ms \n Error rate: 9.09% \n Request rate: 11',
        borderWidth: 3,
        color: {
          background: 'rgba(129, 99, 169, 1)',
          border: '#4A4A4A',
        },
        font: {
          color: 'rgba(72, 122, 180, 1)',
        },
        average_latency: 'Average duration: 134.36ms',
        error_rate: 'Error rate: 9.09%',
        throughput: 'Request rate: 11',
      },
      {
        id: 8,
        label: 'recommendation',
        size: 15,
        title:
          'recommendation\n\n Average duration: 176.97ms \n Error rate: 6.25% \n Request rate: 16',
        borderWidth: 3,
        color: {
          background: 'rgba(100, 66, 143, 1)',
          border: '#4A4A4A',
        },
        font: {
          color: 'rgba(72, 122, 180, 1)',
        },
        average_latency: 'Average duration: 176.97ms',
        error_rate: 'Error rate: 6.25%',
        throughput: 'Request rate: 16',
      },
    ],
    edges: [
      {
        from: 1,
        to: 2,
        color: 'rgba(0, 0, 0, 1)',
      },
      {
        from: 1,
        to: 3,
        color: 'rgba(0, 0, 0, 1)',
      },
      {
        from: 4,
        to: 1,
        color: 'rgba(0, 0, 0, 1)',
      },
      {
        from: 4,
        to: 7,
        color: 'rgba(0, 0, 0, 1)',
      },
      {
        from: 4,
        to: 6,
        color: 'rgba(0, 0, 0, 1)',
      },
      {
        from: 5,
        to: 2,
        color: 'rgba(0, 0, 0, 1)',
      },
      {
        from: 5,
        to: 3,
        color: 'rgba(0, 0, 0, 1)',
      },
      {
        from: 6,
        to: 2,
        color: 'rgba(0, 0, 0, 1)',
      },
      {
        from: 6,
        to: 8,
        color: 'rgba(0, 0, 0, 1)',
      },
      {
        from: 7,
        to: 2,
        color: 'rgba(0, 0, 0, 1)',
      },
      {
        from: 7,
        to: 5,
        color: 'rgba(0, 0, 0, 1)',
      },
      {
        from: 8,
        to: 2,
        color: 'rgba(0, 0, 0, 1)',
      },
      {
        from: 8,
        to: 5,
        color: 'rgba(0, 0, 0, 1)',
      },
    ],
  },
};

export const TEST_SERVICE_MAP = {
  order: {
    serviceName: 'order',
    id: 1,
    average_latency: 100,
    traceGroups: [
      {
        traceGroup: 'client_cancel_order',
        targetResource: ['clear_order'],
      },
      {
        traceGroup: 'client_create_order',
        targetResource: ['update_order'],
      },
      {
        traceGroup: 'client_delivery_status',
        targetResource: ['get_order'],
      },
      {
        traceGroup: 'client_pay_order',
        targetResource: ['pay_order'],
      },
    ],
    targetServices: ['analytics-service', 'database'],
    destServices: ['frontend-client'],
    latency: 90.1,
    error_rate: 4.17,
    throughput: 48,
    relatedServices: ['analytics-service', 'database', 'frontend-client'],
  },
  'analytics-service': {
    serviceName: 'analytics-service',
    id: 2,
    average_latency: 150,
    traceGroups: [
      {
        traceGroup: 'client_cancel_order',
        targetResource: ['/logs'],
      },
      {
        traceGroup: 'client_checkout',
        targetResource: ['/logs'],
      },
      {
        traceGroup: 'client_create_order',
        targetResource: ['/logs'],
      },
      {
        traceGroup: 'client_delivery_status',
        targetResource: ['/logs'],
      },
      {
        traceGroup: 'client_pay_order',
        targetResource: ['/logs'],
      },
      {
        traceGroup: 'load_main_screen',
        targetResource: ['/logs'],
      },
    ],
    targetServices: [],
    destServices: ['order', 'inventory', 'authentication', 'payment', 'recommendation'],
    latency: 12.99,
    error_rate: 0,
    throughput: 37,
    relatedServices: ['order', 'inventory', 'authentication', 'payment', 'recommendation'],
  },
  database: {
    serviceName: 'database',
    id: 3,
    average_latency: 200,
    traceGroups: [
      {
        traceGroup: 'client_cancel_order',
        targetResource: ['cartEmpty'],
      },
      {
        traceGroup: 'client_checkout',
        targetResource: ['updateItem'],
      },
      {
        traceGroup: 'client_create_order',
        targetResource: ['addItemToCart'],
      },
      {
        traceGroup: 'client_delivery_status',
        targetResource: ['getCart'],
      },
      {
        traceGroup: 'client_pay_order',
        targetResource: ['cartSold'],
      },
      {
        traceGroup: 'load_main_screen',
        targetResource: ['getInventory'],
      },
    ],
    targetServices: [],
    destServices: ['order', 'inventory'],
    latency: 49.54,
    error_rate: 3.77,
    throughput: 53,
    relatedServices: ['order', 'inventory'],
  },
  'frontend-client': {
    serviceName: 'frontend-client',
    id: 4,
    average_latency: 250,
    traceGroups: [
      {
        traceGroup: 'client_cancel_order',
        targetResource: [],
      },
      {
        traceGroup: 'client_checkout',
        targetResource: [],
      },
      {
        traceGroup: 'client_create_order',
        targetResource: [],
      },
      {
        traceGroup: 'client_delivery_status',
        targetResource: [],
      },
      {
        traceGroup: 'client_pay_order',
        targetResource: [],
      },
      {
        traceGroup: 'load_main_screen',
        targetResource: [],
      },
    ],
    targetServices: ['order', 'payment', 'authentication'],
    destServices: [],
    latency: 207.71,
    error_rate: 7.41,
    throughput: 27,
    relatedServices: ['order', 'payment', 'authentication'],
  },
  inventory: {
    serviceName: 'inventory',
    id: 5,
    average_latency: 300,
    traceGroups: [
      {
        traceGroup: 'client_checkout',
        targetResource: ['update_inventory'],
      },
      {
        traceGroup: 'load_main_screen',
        targetResource: ['read_inventory'],
      },
    ],
    targetServices: ['analytics-service', 'database'],
    destServices: ['payment', 'recommendation'],
    latency: 183.52,
    error_rate: 3.23,
    throughput: 31,
    relatedServices: ['analytics-service', 'database', 'payment', 'recommendation'],
  },
  authentication: {
    serviceName: 'authentication',
    id: 6,
    average_latency: 350,
    traceGroups: [
      {
        traceGroup: 'load_main_screen',
        targetResource: ['server_request_login'],
      },
    ],
    targetServices: ['analytics-service', 'recommendation'],
    destServices: ['frontend-client'],
    latency: 139.09,
    error_rate: 8.33,
    throughput: 12,
    relatedServices: ['analytics-service', 'recommendation', 'frontend-client'],
  },
  payment: {
    serviceName: 'payment',
    id: 7,
    average_latency: 400,
    traceGroups: [
      {
        traceGroup: 'client_checkout',
        targetResource: ['payment'],
      },
    ],
    targetServices: ['analytics-service', 'inventory'],
    destServices: ['frontend-client'],
    latency: 134.36,
    error_rate: 9.09,
    throughput: 11,
    relatedServices: ['analytics-service', 'inventory', 'frontend-client'],
  },
  recommendation: {
    serviceName: 'recommendation',
    id: 8,
    average_latency: 450,
    traceGroups: [
      {
        traceGroup: 'load_main_screen',
        targetResource: ['recommend'],
      },
    ],
    targetServices: ['analytics-service', 'inventory'],
    destServices: ['authentication'],
    latency: 176.97,
    error_rate: 6.25,
    throughput: 16,
    relatedServices: ['analytics-service', 'inventory', 'authentication'],
  },
};

export const TEST_INTEGRATION_SETUP_INPUTS: IntegrationSetupInputs = {
  displayName: 'Test Instance Name',
  connectionType: 'index',
  connectionDataSource: 'ss4o_logs-nginx-test',
  connectionTableName: '',
  connectionLocation: '',
  checkpointLocation: '',
  enabledWorkflows: [],
};

// TODO fill in the rest of the fields
export const TEST_INTEGRATION_CONFIG: IntegrationConfig = {
  name: 'sample',
  version: '2.0.0',
  license: 'Apache-2.0',
  type: 'logs',
  workflows: [
    {
      name: 'workflow1',
      label: 'Workflow 1',
      description: 'This is a test workflow.',
      enabled_by_default: true,
    },
  ],
  components: [
    {
      name: 'logs',
      version: '1.0.0',
    },
  ],
  assets: [
    {
      name: 'sample',
      version: '1.0.1',
      extension: 'ndjson',
      type: 'savedObjectBundle',
    },
  ],
};

export const TEST_AVAILABLE_INTEGRATIONS: AvailableIntegrationsList = {
  hits: [
    TEST_INTEGRATION_CONFIG,
    { ...TEST_INTEGRATION_CONFIG, name: 'sample2', labels: ['Flint S3'] },
  ],
};

export const TEST_INTEGRATION_SEARCH_RESULTS: IntegrationInstanceResult[] = [
  {
    id: 'd5b55c60-e08c-11ee-9c80-ff3b93498fea',
    status: 'available',
    name: 'aws_waf-sample',
    templateName: 'aws_waf',
    dataSource: 'ss4o_logs_waf-aws_waf-sample-sample',
    creationDate: '2024-03-12T16:23:18.053Z',
    assets: [
      {
        assetType: 'index-pattern',
        assetId: '9506c132-f466-4ce3-a875-f187ddec587c',
        status: 'available',
        isDefaultAsset: false,
        description: 'ss4o_logs_waf-aws_waf-sample-sample',
      },
      {
        assetType: 'visualization',
        assetId: '7770e5be-6f10-4435-9773-021c6188bfe5',
        status: 'available',
        isDefaultAsset: false,
        description: 'logs-waf-Top Client IPs',
      },
      {
        assetType: 'dashboard',
        assetId: '36f26341-22f0-49c5-9820-f787afb4090c',
        status: 'available',
        isDefaultAsset: true,
        description: 'logs-waf-dashboard',
      },
    ],
  },
];

export const mockSavedObjectActions = ({ get = [], getBulk = [] }) => {
  return {
    get: jest.fn().mockResolvedValue({ observabilityObjectList: get }),
    getBulk: jest.fn().mockResolvedValue({ observabilityObjectList: getBulk }),
  };
};

export const fieldCapQueryResponse1 = {
  indices: ['dest1:otel-v1-apm-span-000001', 'dest2:otel-v1-apm-span-000001'],
  fields: {
    'span.attributes.http@url': {
      text: {
        type: 'text',
        searchable: true,
        aggregatable: false,
      },
    },
    'span.attributes.net@peer@ip': {
      text: {
        type: 'text',
        searchable: true,
        aggregatable: false,
      },
    },
    'span.attributes.http@user_agent.keyword': {
      keyword: {
        type: 'keyword',
        searchable: true,
        aggregatable: true,
      },
    },
    'resource.attributes.telemetry@sdk@version.keyword': {
      keyword: {
        type: 'keyword',
        searchable: true,
        aggregatable: true,
      },
    },
    'resource.attributes.host@hostname.keyword': {
      keyword: {
        type: 'keyword',
        searchable: true,
        aggregatable: true,
      },
    },
    'unrelated.field.name': {
      text: {
        type: 'text',
        searchable: true,
        aggregatable: false,
      },
    },
    'attributes.url': {
      text: {
        type: 'text',
        searchable: true,
        aggregatable: false,
      },
    },
    'attributes.custom_field.keyword': {
      keyword: {
        type: 'keyword',
        searchable: true,
        aggregatable: true,
      },
    },
  },
};

export const fieldCapQueryResponse2 = {
  indices: ['dest1:otel-v1-apm-span-000001', 'dest2:otel-v1-apm-span-000001'],
  fields: {
    'unrelated.field1': {
      text: {
        type: 'text',
        searchable: true,
        aggregatable: false,
      },
    },
    'another.unrelated.field': {
      keyword: {
        type: 'keyword',
        searchable: true,
        aggregatable: true,
      },
    },
  },
};

export const MOCK_CANVAS_CONTEXT = {
  canvas: document.createElement('canvas'),
  fillRect: jest.fn(),
  clearRect: jest.fn(),
  getImageData: jest.fn(() => ({ data: new Uint8ClampedArray() })),
  putImageData: jest.fn(),
  createImageData: jest.fn(),
  setTransform: jest.fn(),
  drawImage: jest.fn(),
  save: jest.fn(),
  fillText: jest.fn(),
  restore: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  closePath: jest.fn(),
  stroke: jest.fn(),
  translate: jest.fn(),
  scale: jest.fn(),
  rotate: jest.fn(),
  arc: jest.fn(),
  fill: jest.fn(),
  measureText: jest.fn(() => ({ width: 0 })),
  transform: jest.fn(),
  rect: jest.fn(),
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  filter: 'none',
  imageSmoothingEnabled: true,
  imageSmoothingQuality: 'low',
  strokeStyle: '#000',
  fillStyle: '#000',
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  shadowBlur: 0,
  shadowColor: 'rgba(0,0,0,0)',
  lineWidth: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
  miterLimit: 10,
  lineDashOffset: 0,
  font: '10px sans-serif',
  textAlign: 'start',
  textBaseline: 'alphabetic',
  direction: 'ltr',
  getContextAttributes: jest.fn(() => ({
    alpha: true,
    desynchronized: false,
    colorSpace: 'srgb',
    willReadFrequently: false,
  })),
};
