/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render } from '@testing-library/react';
import { configure, mount, shallow } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { Provider } from 'react-redux';
import { legacy_createStore as createStore } from 'redux';
import {
  getOSDHttp,
  setPPLService,
  uiSettingsService,
} from '../../../../../../common/utils/core_services';
import {
  sampleObservabilityVizParagraph,
  sampleParsedParagraghs1,
} from '../../../../../../test/notebooks_constants';
import { rootReducer } from '../../../../../framework/redux/reducers';
import PPLService from '../../../../../services/requests/ppl';
import { ParaOutput } from '../para_output';

describe('<ParaOutput /> spec', () => {
  configure({ adapter: new Adapter() });
  const store = createStore(rootReducer);

  it('renders markdown outputs', () => {
    const para = sampleParsedParagraghs1[0];
    para.isSelected = true;
    const setVisInput = jest.fn();
    const utils = render(
      <ParaOutput
        key={para.uniqueId}
        para={para}
        visInput={jest.fn()}
        setVisInput={setVisInput}
        DashboardContainerByValueRenderer={jest.fn()}
      />
    );
    expect(utils.container.firstChild).toMatchSnapshot();
  });

  it('renders query outputs', () => {
    const para = sampleParsedParagraghs1[3];
    para.isSelected = true;
    const setVisInput = jest.fn();
    const utils = render(
      <ParaOutput
        key={para.uniqueId}
        para={para}
        visInput={jest.fn()}
        setVisInput={setVisInput}
        DashboardContainerByValueRenderer={jest.fn()}
      />
    );
    expect(utils.container.firstChild).toMatchSnapshot();
  });

  it('renders query outputs with error', () => {
    const para = sampleParsedParagraghs1[3];
    para.out = ['{"error":"Invalid SQL query"}'];
    para.isSelected = true;
    const setVisInput = jest.fn();
    const utils = render(
      <ParaOutput
        key={para.uniqueId}
        para={para}
        visInput={jest.fn()}
        setVisInput={setVisInput}
        DashboardContainerByValueRenderer={jest.fn()}
      />
    );
    expect(utils.container.firstChild).toMatchSnapshot();
  });

  it('renders dashboards visualization outputs', () => {
    const para = sampleParsedParagraghs1[2];
    para.isSelected = true;

    uiSettingsService.get = jest.fn().mockReturnValue('YYYY-MMM-DD HH:mm:ss');
    const setVisInput = jest.fn();
    const utils = render(
      <ParaOutput
        key={para.uniqueId}
        para={para}
        visInput={{
          timeRange: { from: '2020-JUL-21 18:37:44', to: '2020-AUG-20 18:37:44' },
        }}
        setVisInput={setVisInput}
        DashboardContainerByValueRenderer={() => null}
      />
    );
    expect(utils.container.textContent).toMatch('2020-Jul-21 18:37:44 - 2020-Aug-20 18:37:44');
    expect(utils.container.firstChild).toMatchSnapshot();
  });

  it('renders observability visualization outputs', () => {
    setPPLService(new PPLService(getOSDHttp()));
    const para = sampleObservabilityVizParagraph;
    para.isSelected = true;

    uiSettingsService.get = jest.fn().mockReturnValue('YYYY-MMM-DD HH:mm:ss');
    const setVisInput = jest.fn();
    const utils = render(
      <Provider store={store}>
        <ParaOutput
          key={para.uniqueId}
          para={para}
          visInput={{
            timeRange: { from: '2020-JUL-21 18:37:44', to: '2020-AUG-20 18:37:44' },
          }}
          setVisInput={setVisInput}
          DashboardContainerByValueRenderer={() => null}
        />
      </Provider>
    );
    expect(utils.container.textContent).toMatch('2020-Jul-21 18:37:44 - 2020-Aug-20 18:37:44');
    expect(utils.container.firstChild).toMatchSnapshot();
  });

  it('renders other types of outputs', () => {
    const para = sampleParsedParagraghs1[0];
    para.isSelected = true;
    para.typeOut = ['HTML', 'TABLE', 'IMG', 'UNKNOWN', undefined];
    para.out = ['', '', '', '', ''];
    const setVisInput = jest.fn();
    const utils = render(
      <ParaOutput
        key={para.uniqueId}
        para={para}
        visInput={jest.fn()}
        setVisInput={setVisInput}
        DashboardContainerByValueRenderer={jest.fn()}
      />
    );
    expect(utils.container.firstChild).toMatchSnapshot();
  });
});
