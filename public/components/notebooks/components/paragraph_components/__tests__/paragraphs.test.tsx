/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { getOSDHttp } from '../../../../../../common/utils';
import { sampleParsedParagraghs1 } from '../../../../../../test/notebooks_constants';
import { Paragraphs } from '../paragraphs';

jest.mock('../../../../../../../../src/plugins/embeddable/public', () => ({
  ViewMode: {
    EDIT: 'edit',
    VIEW: 'view',
  },
}));

const mockFind = jest.fn().mockResolvedValue({
  savedObjects: [],
});

jest.mock('../../../../../framework/core_refs', () => ({
  coreRefs: {
    savedObjectsClient: {
      find: (options) => mockFind(options),
    },
  },
}));

describe('<Paragraphs /> spec', () => {
  it('renders the component', async () => {
    const setPara = jest.fn();
    const paragraphSelector = jest.fn();
    const textValueEditor = jest.fn();
    const handleKeyPress = jest.fn();
    const addPara = jest.fn();
    const DashboardContainerByValueRenderer = jest.fn();
    const deleteVizualization = jest.fn();
    const setSelectedViewId = jest.fn();
    const deletePara = jest.fn();
    const runPara = jest.fn();
    const clonePara = jest.fn();
    const movePara = jest.fn();
    const para = sampleParsedParagraghs1[0];
    para.isInputExpanded = true;
    const utils = render(
      <Paragraphs
        ref={jest.fn()}
        para={para}
        setPara={setPara}
        dateModified="2023-11-01 01:02:03"
        index={0}
        paraCount={2}
        paragraphSelector={paragraphSelector}
        textValueEditor={textValueEditor}
        handleKeyPress={handleKeyPress}
        addPara={addPara}
        DashboardContainerByValueRenderer={DashboardContainerByValueRenderer}
        deleteVizualization={deleteVizualization}
        http={getOSDHttp()}
        selectedViewId="view_both"
        setSelectedViewId={setSelectedViewId}
        deletePara={deletePara}
        runPara={runPara}
        clonePara={clonePara}
        movePara={movePara}
        showQueryParagraphError={false}
        queryParagraphErrorMessage="error-message"
        dataSourceEnabled={false}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });

    // Test menu interactions - just verify the component renders and menu button exists
    const menuButton = utils.getByLabelText('Open paragraph menu');
    expect(menuButton).toBeInTheDocument();
  });

  it('use SavedObject find to fetch visualizations when dataSourceEnabled', () => {
    const setPara = jest.fn();
    const paragraphSelector = jest.fn();
    const textValueEditor = jest.fn();
    const handleKeyPress = jest.fn();
    const addPara = jest.fn();
    const DashboardContainerByValueRenderer = jest.fn();
    const deleteVizualization = jest.fn();
    const setSelectedViewId = jest.fn();
    const deletePara = jest.fn();
    const runPara = jest.fn();
    const clonePara = jest.fn();
    const movePara = jest.fn();
    const para = {
      uniqueId: 'paragraph_1a710988-ec19-4caa-83cc-38eb609427d1',
      isRunning: false,
      inQueue: false,
      isSelected: false,
      isInputHidden: false,
      isOutputHidden: false,
      showAddPara: false,
      isVizualisation: true,
      vizObjectInput: '{}',
      id: 1,
      inp: '# Type your input here',
      isInputExpanded: false,
      isOutputStale: false,
      paraDivRef: undefined,
      paraRef: undefined,
      visEndTime: undefined,
      visSavedObjId: undefined,
      visStartTime: undefined,
      lang: 'text/x-md',
      editorLanguage: 'md',
      typeOut: ['MARKDOWN'],
      out: ['# Type your input here'],
    };
    para.isInputExpanded = true;
    const _utils = render(
      <Paragraphs
        ref={jest.fn()}
        para={para}
        setPara={setPara}
        dateModified="2023-11-01 01:02:03"
        index={0}
        paraCount={2}
        paragraphSelector={paragraphSelector}
        textValueEditor={textValueEditor}
        handleKeyPress={handleKeyPress}
        addPara={addPara}
        DashboardContainerByValueRenderer={DashboardContainerByValueRenderer}
        deleteVizualization={deleteVizualization}
        http={getOSDHttp()}
        selectedViewId="view_both"
        setSelectedViewId={setSelectedViewId}
        deletePara={deletePara}
        runPara={runPara}
        clonePara={clonePara}
        movePara={movePara}
        showQueryParagraphError={false}
        queryParagraphErrorMessage="error-message"
        dataSourceEnabled={true}
        dataSourceManagement={{ ui: { DataSourceSelector: <></> } }}
      />
    );
    expect(document.body).toMatchSnapshot();
    expect(mockFind).toHaveBeenCalledWith({
      type: 'visualization',
    });
  });
});
