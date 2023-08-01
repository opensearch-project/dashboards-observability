export const testData = {
  schema: [
    {
      name: 'values',
      type: 'integer',
    },
    {
      name: 'timestamp',
      type: 'timestamp',
    },
    {
      name: 'labels',
      type: 'struct',
    },
    {
      name: 'seriesLabels',
      type: 'struct',
    },
  ],
  datarows: [
    [
      6.0,
      '2023-06-01 00:00:00',
      {
        traceID: 'EpTxMJ40fUus7aGY',
      },
      {
        instance: 'localhost:8090',
        __name__: 'test_exemplar_metric_total',
        service: 'bar',
        job: 'prometheus',
      },
    ],
    [
      13.0,
      '2023-07-01 00:00:00',
      {
        traceID: 'EpTxMJ40fUpUodDF',
      },
      {
        instance: 'localhost:8090',
        __name__: 'test_exemplar_metric_total',
        service: 'bar',
        job: 'prometheus',
      },
    ],
    [
      19.0,
      '2023-06-01 00:00:00',
      {
        traceID: 'Olp9XHlq763ccsfa',
      },
      {
        instance: 'localhost:8090',
        __name__: 'test_exemplar_metric_total',
        service: 'foo',
        job: 'prometheus',
      },
    ],
    [
      12.0,
      '2023-07-01 00:00:00',
      {
        traceID: '1EpTxM5640fpUodSS',
      },
      {
        instance: 'localhost:8090',
        __name__: 'test_exemplar_metric_total',
        service: 'foo',
        job: 'prometheus',
      },
    ],
  ],
  jsonData: [
    {
      value: 9,
      timestamp: '2023-07-01 00:00:00',
      labels: {
        traceID: 'EpTxMJ40fUus7aGY',
      },
      seriesLabels: {
        instance: 'localhost:8090',
        __name__: 'test_exemplar_metric_total',
        service: 'bar',
        job: 'prometheus',
      },
    },
    {
      value: 19,
      timestamp: '2023-09-01 00:00:00',
      labels: {
        traceID: 'Olp9XHlq763ccsfa',
      },
      seriesLabels: {
        instance: 'localhost:8090',
        __name__: 'test_exemplar_metric_total',
        service: 'bar',
        job: 'prometheus',
      },
    },
    {
      value: 13,
      timestamp: '2023-06-01 00:00:00',
      labels: {
        traceID: 'Olp9XHlq763ccsfa',
      },
      seriesLabels: {
        instance: 'localhost:8090',
        __name__: 'test_exemplar_metric_total',
        service: 'foo',
        job: 'prometheus',
      },
    },
    {
      value: 20,
      timestamp: '2023-08-01 00:00:00',
      labels: {
        traceID: 'Olp9XHlq763ccsfa',
      },
      seriesLabels: {
        instance: 'localhost:8090',
        __name__: 'test_exemplar_metric_total',
        service: 'foo',
        job: 'prometheus',
      },
    },
  ],
};

export const testData2 = {
  schema: [
    {
      name: 'labels',
      type: 'struct',
    },
    {
      name: 'value',
      type: 'array',
    },
    {
      name: 'timestamp',
      type: 'array',
    },
  ],
  datarows: [
    [
      {
        instance: 'localhost:8090',
        __name__: 'test_exemplar_metric_total',
        service: 'bar',
        job: 'prometheus',
      },
      [7, 9, 2, 18, 19, 17],
      [
        '2023-06-01 00:00:00',
        '2023-07-01 00:00:00',
        '2023-08-01 00:00:00',
        '2023-09-01 00:00:00',
        '2023-10-01 00:00:00',
      ],
    ],
    [
      {
        instance: 'localhost:8090',
        __name__: 'test_exemplar_metric_total',
        service: 'foo',
        job: 'prometheus',
      },
      [13, 14, 20, 2, 13, 7],
      [
        '2023-06-01 00:00:00',
        '2023-07-01 00:00:00',
        '2023-08-01 00:00:00',
        '2023-09-01 00:00:00',
        '2023-10-01 00:00:00',
      ],
    ],
  ],
  jsonData: [
    {
      labels: {
        instance: 'localhost:8090',
        __name__: 'test_exemplar_metric_total',
        service: 'bar',
        job: 'prometheus',
      },
      value: [7, 9, 2, 18, 19, 17],
      timestamps: [
        '2023-06-01 00:00:00',
        '2023-07-01 00:00:00',
        '2023-08-01 00:00:00',
        '2023-09-01 00:00:00',
        '2023-10-01 00:00:00',
      ],
    },
    {
      labels: {
        instance: 'localhost:8090',
        __name__: 'test_exemplar_metric_total',
        service: 'foo',
        job: 'prometheus',
      },
      value: [13, 14, 20, 2, 13, 7],
      timestamps: [
        '2023-06-01 00:00:00',
        '2023-07-01 00:00:00',
        '2023-08-01 00:00:00',
        '2023-09-01 00:00:00',
        '2023-10-01 00:00:00',
      ],
    },
  ],
};
