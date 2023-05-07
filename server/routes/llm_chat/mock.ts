import { IConversation } from '../../../common/types/observability_saved_object_attributes';

export const getOutputs = () => {
  const response = `${new Date().toString()}`;

  const visResponse = `{"viewMode":"view","panels":{"1":{"gridData":{"x":0,"y":0,"w":50,"h":20,"i":"1"},"type":"visualization","explicitInput":{"id":"1","savedObjectId":"c8fc3d30-4c87-11e8-b3d7-01146121b73d"}}},"isFullScreenMode":false,"filters":[],"useMargins":false,"id":"i4a940a01-eaa6-11ed-8736-ed64a7c880d5","timeRange":{"to":"2023-05-04T18:05:41.966Z","from":"2023-04-04T18:05:41.966Z"},"title":"embed_viz_i4a940a01-eaa6-11ed-8736-ed64a7c880d5","query":{"query":"","language":"lucene"},"refreshConfig":{"pause":true,"value":15}}`;

  const pplVisResponse =
    'source = opensearch_dashboards_sample_data_flights | stats count() by Dest';

  const mdOutput: IConversation = {
    type: 'output',
    content: response,
    contentType: 'markdown',
    suggestedActions: [{ actionType: 'send_as_input', message: 'show more' }],
  };
  const visOutput: IConversation = {
    type: 'output',
    content: visResponse,
    contentType: 'visualization',
  };
  const pplOutput: IConversation = {
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
  };
  return new Promise((resolve) => setTimeout(resolve, 5000)).then(() => [mdOutput]);
};
