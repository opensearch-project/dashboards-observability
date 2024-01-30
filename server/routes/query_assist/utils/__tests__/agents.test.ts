/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreRouteHandlerContext } from '../../../../../../../src/core/server/core_route_handler_context';
import { coreMock, httpServerMock } from '../../../../../../../src/core/server/mocks';
import { agentIdMap, requestWithRetryAgentSearch, searchAgentIdByName } from '../agents';

describe('Agents helper functions', () => {
  const coreContext = new CoreRouteHandlerContext(
    coreMock.createInternalStart(),
    httpServerMock.createOpenSearchDashboardsRequest()
  );
  const client = coreContext.opensearch.client.asCurrentUser;
  const mockedTransport = client.transport.request as jest.Mock;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('searches agent id by name', async () => {
    mockedTransport.mockResolvedValueOnce({
      body: { hits: { total: { value: 1 }, hits: [{ _id: 'agentId' }] } },
    });
    const id = await searchAgentIdByName(client, 'test agent');
    expect(id).toEqual('agentId');
    expect(mockedTransport.mock.calls[0]).toMatchInlineSnapshot(`
      Array [
        Object {
          "body": Object {
            "query": Object {
              "term": Object {
                "name.keyword": "test agent",
              },
            },
            "sort": Object {
              "created_time": "desc",
            },
          },
          "method": "GET",
          "path": "/_plugins/_ml/agents/_search",
        },
      ]
    `);
  });

  it('handles not found errors', async () => {
    mockedTransport.mockResolvedValueOnce({ body: { hits: { total: 0 } } });
    await expect(
      searchAgentIdByName(client, 'test agent')
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"search agent 'test agent' failed, reason: Error: cannot find any agent by name: test agent"`
    );
  });

  it('handles search errors', async () => {
    mockedTransport.mockRejectedValueOnce('request failed');
    await expect(
      searchAgentIdByName(client, 'test agent')
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"search agent 'test agent' failed, reason: request failed"`
    );
  });

  it('requests with valid agent id', async () => {
    agentIdMap['test agent'] = 'test-id';
    mockedTransport.mockResolvedValueOnce({
      body: { inference_results: [{ output: [{ result: 'test response' }] }] },
    });
    const response = await requestWithRetryAgentSearch({
      client,
      agentName: 'test agent',
      shouldRetryAgentSearch: true,
      body: { parameters: { param1: 'value1' } },
    });
    expect(mockedTransport).toBeCalledWith(
      expect.objectContaining({
        path: '/_plugins/_ml/agents/test-id/_execute',
      }),
      expect.anything()
    );
    expect(response.body.inference_results[0].output[0].result).toEqual('test response');
  });

  it('searches for agent id if id is undefined', async () => {
    mockedTransport
      .mockResolvedValueOnce({ body: { hits: { total: { value: 1 }, hits: [{ _id: 'new-id' }] } } })
      .mockResolvedValueOnce({
        body: { inference_results: [{ output: [{ result: 'test response' }] }] },
      });
    const response = await requestWithRetryAgentSearch({
      client,
      agentName: 'new agent',
      shouldRetryAgentSearch: true,
      body: { parameters: { param1: 'value1' } },
    });
    expect(mockedTransport).toBeCalledWith(
      expect.objectContaining({ path: '/_plugins/_ml/agents/new-id/_execute' }),
      expect.anything()
    );
    expect(response.body.inference_results[0].output[0].result).toEqual('test response');
  });

  it('searches for agent id if id is not found', async () => {
    agentIdMap['test agent'] = 'non-exist-agent';
    mockedTransport
      .mockRejectedValueOnce({ statusCode: 404, body: {}, headers: {} })
      .mockResolvedValueOnce({ body: { hits: { total: { value: 1 }, hits: [{ _id: 'new-id' }] } } })
      .mockResolvedValueOnce({
        body: { inference_results: [{ output: [{ result: 'test response' }] }] },
      });
    const response = await requestWithRetryAgentSearch({
      client,
      agentName: 'test agent',
      shouldRetryAgentSearch: true,
      body: { parameters: { param1: 'value1' } },
    });
    expect(mockedTransport).toBeCalledWith(
      expect.objectContaining({ path: '/_plugins/_ml/agents/new-id/_execute' }),
      expect.anything()
    );
    expect(response.body.inference_results[0].output[0].result).toEqual('test response');
  });
});
