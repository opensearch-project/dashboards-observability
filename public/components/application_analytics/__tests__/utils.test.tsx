/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import httpClientMock from '../../../../test/__mocks__/httpClientMock';
import Adapter from 'enzyme-adapter-react-16';
import PPLService from 'public/services/requests/ppl';

import {
  isNameValid,
  getListItem,
  fetchAppById,
  removeTabData,
  initializeTabData,
  fetchPanelsVizIdList,
  calculateAvailability,
} from '../helpers/utils';
import { HttpResponse } from '../../../../../../src/core/public/http/types';

describe('Utils application analytics helper functions', () => {
  configure({ adapter: new Adapter() });

  it('validates isNameValid function', () => {
    expect(isNameValid('example', [])).toStrictEqual([]);
    expect(isNameValid('example', ['example'])).toStrictEqual(['Name must be unique.']);
    expect(isNameValid('', [])).toStrictEqual(['Name must not be empty.']);
    expect(isNameValid('example123example123example123example123example123', [])).toStrictEqual([
      'Name must be less than 50 characters.',
    ]);
  });

  it('validates and renders getListItem function', () => {
    const wrapper = mount(getListItem('example', 'example description'));
    expect(wrapper).toMatchSnapshot();
  });

  it('validates calculateAvailability function', () => {
    const client = httpClientMock;
    client.get = jest.fn(() => {
      return (Promise.resolve({
        objectId: '1fwqYIwBFPafSCH7X4bf',
        lastUpdatedTimeMs: 1703093973554,
        createdTimeMs: 1702420439006,
        tenant: '',
        operationalPanel: {
          name: "sample's Panel",
          visualizations: [
            {
              id: 'panel_viz_c1c8f4ce-426a-46c9-80d6-4c3b2ab587e2',
              savedVisualizationId:
                'observability-visualization:bc88fae0-9f5e-11ee-8972-ff1ca912e352',
              x: 0,
              y: 0,
              w: 6,
              h: 4,
            },
          ],
          timeRange: {
            to: 'now',
            from: 'now-24h',
          },
          queryFilter: {
            query: '',
            language: 'ppl',
          },
          applicationId: '1PwqYIwBFPafSCH7X4Zv',
        },
      }) as unknown) as HttpResponse;
    });
    const pplService = ({
      http: jest.fn(),
      fetch: jest.fn(),
    } as unknown) as PPLService;
    const application = {
      id: '1PwqYIwBFPafSCH7X4Zv',
      dateCreated: '1702420438885',
      dateModified: '1702420439112',
      name: 'sample',
      description: '',
      baseQuery: 'source = opensearch_dashboards_sample_data_ecommerce ',
      servicesEntities: [],
      traceGroups: [],
      panelId: '1fwqYIwBFPafSCH7X4bf',
      availability: {
        name: '',
        color: 'loading',
        availabilityVisId: '',
      },
    };
    calculateAvailability(client, pplService, application, '', () => {});
  });
});
