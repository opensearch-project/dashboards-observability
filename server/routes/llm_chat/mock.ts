const messages = [
  [
    {
      type: 'output',
      content:
        'These are your services list according to the services logs ingested in the past week:\n\n```\n- accountingservice\n- adservice\n- cartservice\n- checkoutservice\n- currencyservice\n- emailservice\n- featureflagservice\n- frauddetectionservice\n- frontend\n- frontendproxy\n- loadgenerator\n- paymentservice\n- productcatalogservice\n- quoteservice\n- recommendationservice\n- shippingservice\n```',
      contentType: 'markdown',
    },
  ],
  // I have a notification of a possible memory issue, can you show me which services have the issue?
  [
    {
      type: 'output',
      content:
        'Certainly, the next services has exceeded their normal activity boundary in the recent week  :',
      contentType: 'markdown',
    },
    {
      type: 'output',
      content:
        "source = opensearch_dashboards_sample_data_logs | where response='503' or response='404' | stats count() by span(timestamp,1d)",
      contentType: 'ppl_visualization',
    },
  ],
  [
    {
      type: 'output',
      content:
        "Yes, the next graph shows the `recommendationservice` KPI's during the during last 24 hours.",
      contentType: 'markdown',
    },
    {
      type: 'output',
      content: '- Latency',
      contentType: 'markdown',
    },
    {
      type: 'output',
      content:
        'source = opensearch_dashboards_sample_data_logs | stats max(bytes), avg(bytes) by host',
      contentType: 'ppl_visualization',
    },
    {
      type: 'output',
      content: '- CPU utilization',
      contentType: 'markdown',
    },
    {
      type: 'output',
      content: 'source = opensearch_dashboards_sample_data_logs | stats count() by tags',
      contentType: 'ppl_visualization',
    },
    {
      type: 'output',
      content: '- Memory utilization',
      contentType: 'markdown',
    },
    {
      type: 'output',
      content:
        "source = opensearch_dashboards_sample_data_logs | where geo.src='US' | where geo.dest='JP' or geo.dest='CN' or geo.dest='IN' | stats count() by geo.dest",
      contentType: 'ppl_visualization',
      suggestedActions: [
        {
          message: 'correlate the traces from this service during this period',
          actionType: 'send_as_input',
        },
      ],
    },
  ],
  [
    {
      type: 'output',
      content: 'Here is the traces related to the service during the last 24 hours.',
      contentType: 'markdown',
    },
    {
      type: 'output',
      content:
        "source=opensearch_dashboards_sample_data_logs | where response='503' or response='404' |      stats count() as ip_count, sum(bytes)      as sum_bytes by host, response |      rename response as resp_code |      sort - ip_count, + sum_bytes |      eval per_ip_bytes=sum_bytes/ip_count,       double_per_ip_bytes = 2 * per_ip_bytes",
      contentType: 'ppl_visualization',
    },
  ],
  [
    {
      type: 'output',
      content: 'Yes, I will show you the longest span details',
      contentType: 'markdown',
    },
    {
      type: 'output',
      content:
        "source = opensearch_dashboards_sample_data_logs | where match(machine.os,'win')  |  stats avg(machine.ram) by span(timestamp,1d)",
      contentType: 'ppl_visualization',
      suggestedActions: [
        {
          message: 'overlay the span from this call during different time period',
          actionType: 'send_as_input',
        },
      ],
    },
  ],
  [
    {
      type: 'output',
      content:
        'This 12 hours time window in the upper screen is the one we are currently investigating - `get_product_list`, the lower one is a week older...',
      contentType: 'markdown',
    },
    {
      type: 'output',
      content:
        "source = opensearch_dashboards_sample_data_logs | where machine.os='osx' or  machine.os='ios' |  stats avg(machine.ram) by span(timestamp,1d)",
      contentType: 'ppl_visualization',
    },
  ],
  [
    {
      type: 'output',
      content:
        'According to a diff operation between the two spans across the tow time periods, it seems that a `app.cache_hit` attribute is currently set to false, and that the `app.products.count` value is extremely high compared to last week',
      contentType: 'markdown',
    },
  ],
];

let i = 0;

export const getOutputs = (chatId?: string) => {
  if (chatId === undefined) {
    i = 0;
  }
  const response = `${new Date().toString()}`;

  // const visResponse = `{"viewMode":"view","panels":{"1":{"gridData":{"x":0,"y":0,"w":50,"h":20,"i":"1"},"type":"visualization","explicitInput":{"id":"1","savedObjectId":"c8fc3d30-4c87-11e8-b3d7-01146121b73d"}}},"isFullScreenMode":false,"filters":[],"useMargins":false,"id":"i4a940a01-eaa6-11ed-8736-ed64a7c880d5","timeRange":{"to":"2023-05-04T18:05:41.966Z","from":"2023-04-04T18:05:41.966Z"},"title":"embed_viz_i4a940a01-eaa6-11ed-8736-ed64a7c880d5","query":{"query":"","language":"lucene"},"refreshConfig":{"pause":true,"value":15}}`;

  /* const pplVisResponse =
    'source = opensearch_dashboards_sample_data_flights | stats count() by Dest'; */

  i += 1;
  /* const visOutput: IMessage = {
    type: 'output',
    content: visResponse,
    contentType: 'visualization',
  }; */
  /* const pplOutput: IMessage = {
    type: 'output',
    content: pplVisResponse,
    contentType: 'ppl_visualization',
    suggestedActions: [
      {
        actionType: 'send_as_input',
        message: 'show more',
      },
      {
        actionType: 'send_as_input',
        message: 'show more',
      },
      {
        actionType: 'send_as_input',
        message: 'show more',
      },
    ],
  }; */
  // return new Promise((resolve) => setTimeout(resolve, 5000)).then(() => [mdOutput]);
  return messages[i - 1];
};
