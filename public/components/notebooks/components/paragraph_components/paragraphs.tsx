/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiComboBoxOptionOption,
  EuiCompressedFormRow,
  EuiContextMenu,
  EuiContextMenuPanelDescriptor,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiIcon,
  EuiLink,
  EuiPanel,
  EuiPopover,
  EuiSmallButton,
  EuiSmallButtonIcon,
  EuiSpacer,
  EuiText,
  htmlIdGenerator,
} from '@elastic/eui';
import filter from 'lodash/filter';
import moment from 'moment';
import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import {
  CoreStart,
  MountPoint,
  SavedObjectsFindOptions,
  SavedObjectsStart,
} from '../../../../../../../src/core/public';
import {
  DashboardContainerInput,
  DashboardStart,
} from '../../../../../../../src/plugins/dashboard/public';
import { DataSourceManagementPluginSetup } from '../../../../../../../src/plugins/data_source_management/public';
import { ViewMode } from '../../../../../../../src/plugins/embeddable/public';
import { NOTEBOOKS_API_PREFIX } from '../../../../../common/constants/notebooks';
import {
  PPL_DOCUMENTATION_URL,
  SQL_DOCUMENTATION_URL,
  UI_DATE_FORMAT,
} from '../../../../../common/constants/shared';
import { ParaType } from '../../../../../common/types/notebooks';
import { uiSettingsService } from '../../../../../common/utils';
import { dataSourceFilterFn } from '../../../../../common/utils/shared';
import { coreRefs } from '../../../../framework/core_refs';
import PPLService from '../../../../services/requests/ppl';
import { SavedObjectsActions } from '../../../../services/saved_objects/saved_object_client/saved_objects_actions';
import { ObservabilitySavedVisualization } from '../../../../services/saved_objects/saved_object_client/types';
import { ParaInput } from './para_input';
import { ParaOutput } from './para_output';

/*
 * "Paragraphs" component is used to render cells of the notebook open and "add para div" between paragraphs
 *
 * Props taken in as params are:
 * para - parsed paragraph from notebook
 * dateModified - last modified time of paragraph
 * index - index of paragraph in the notebook
 * paragraphSelector - function used to select a para on click
 * textValueEditor - function for handling input in textarea
 * handleKeyPress - function for handling key press like "Shift-key+Enter" to run paragraph
 * addPara - function to add a new para onclick - "Add Para" Div
 * DashboardContainerByValueRenderer - Dashboard container renderer for visualization
 * deleteVizualization - function to delete a para
 * http object - for making API requests
 * selectedViewId - selected view: view_both, input_only, output_only
 * deletePara - function to delete the selected para
 * runPara - function to run the selected para
 * clonePara - function to clone the selected para
 * clearPara - function to clear output of all the paras
 * movePara - function to move a paragraph at an index to another index
 *
 * Cell component of nteract used as a container for paragraphs in notebook UI.
 * https://components.nteract.io/#cell
 */
interface ParagraphProps {
  pplService: PPLService;
  para: ParaType;
  setPara: (para: ParaType) => void;
  dateModified: string;
  index: number;
  paraCount: number;
  paragraphSelector: (index: number) => void;
  textValueEditor: (evt: React.ChangeEvent<HTMLTextAreaElement>, index: number) => void;
  handleKeyPress: (
    evt: React.KeyboardEvent<Element>,
    para: ParaType,
    index: number,
    dataSourceMDSID: string
  ) => void;
  addPara: (index: number, newParaContent: string, inputType: string) => void;
  DashboardContainerByValueRenderer: DashboardStart['DashboardContainerByValueRenderer'];
  deleteVizualization: (uniqueId: string) => void;
  http: CoreStart['http'];
  selectedViewId: string;
  setSelectedViewId: (viewId: string, scrollToIndex?: number) => void;
  deletePara: (para: ParaType, index: number) => void;
  runPara: (
    para: ParaType,
    index: number,
    vizObjectInput?: string,
    paraType?: string,
    dataSourceMDSId?: string
  ) => void;
  clonePara: (para: ParaType, index: number) => void;
  movePara: (index: number, targetIndex: number) => void;
  showQueryParagraphError: boolean;
  queryParagraphErrorMessage: string;
  dataSourceManagement: DataSourceManagementPluginSetup;
  setActionMenu: (menuMount: MountPoint | undefined) => void;
  notifications: CoreStart['notifications'];
  dataSourceEnabled: boolean;
  savedObjectsMDSClient: SavedObjectsStart;
  handleSelectedDataSourceChange: (
    dataSourceMDSId: string | undefined,
    dataSourceMDSLabel: string | undefined
  ) => void;
  paradataSourceMDSId: string;
  dataSourceMDSLabel: string;
}

export const Paragraphs = forwardRef((props: ParagraphProps, ref) => {
  const {
    pplService,
    para,
    index,
    paragraphSelector,
    textValueEditor,
    handleKeyPress,
    DashboardContainerByValueRenderer,
    showQueryParagraphError,
    queryParagraphErrorMessage,
    http,
    dataSourceEnabled,
    dataSourceManagement,
    notifications,
    savedObjectsMDSClient,
    handleSelectedDataSourceChange,
    paradataSourceMDSId,
    dataSourceMDSLabel,
  } = props;

  const [visOptions, setVisOptions] = useState<EuiComboBoxOptionOption[]>([
    { label: 'Dashboards Visualizations', options: [] },
    { label: 'Observability Visualizations', options: [] },
  ]); // options for loading saved visualizations
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [runParaError, setRunParaError] = useState(false);
  const [selectedVisOption, setSelectedVisOption] = useState<EuiComboBoxOptionOption[]>([]);
  const [visInput, setVisInput] = useState(undefined);
  const [visType, setVisType] = useState('');
  const [dataSourceMDSId, setDataSourceMDSId] = useState('');

  // output is available if it's not cleared and vis paragraph has a selected visualization
  const isOutputAvailable =
    (para.out.length > 0 && para.out[0] !== '') ||
    (para.isVizualisation && para.typeOut.length > 0 && visInput !== undefined);

  useImperativeHandle(ref, () => ({
    runParagraph() {
      return onRunPara();
    },
  }));

  const fetchVisualizations = async () => {
    if (dataSourceEnabled) {
      let opts: EuiComboBoxOptionOption[] = [];
      const vizOptions: SavedObjectsFindOptions = {
        type: 'visualization',
      };
      await coreRefs.savedObjectsClient
        ?.find(vizOptions)
        .then((res) => {
          opts = res.savedObjects.map((vizObject) => ({
            label: vizObject.attributes.title,
            key: vizObject.id,
            className: 'VISUALIZATION',
          }));
        })
        .catch((error) => {
          console.error('Failed to fetch visualizations', error);
        });

      const allVisualizations = [{ label: 'Dashboards Visualizations', options: opts }];
      setVisOptions(allVisualizations);

      const selectedObject = filter([...opts], {
        key: para.visSavedObjId,
      });
      if (selectedObject.length > 0) {
        setVisType(selectedObject[0].className ?? 'VISUALIZATION');
        setSelectedVisOption(selectedObject);
      }
    } else {
      let opt1: EuiComboBoxOptionOption[] = [];
      let opt2: EuiComboBoxOptionOption[] = [];
      await http
        .get(`${NOTEBOOKS_API_PREFIX}/visualizations/${dataSourceMDSId ?? ''}`)
        .then((res) => {
          opt1 = res.savedVisualizations.map((vizObject) => ({
            label: vizObject.label,
            key: vizObject.key,
            className: 'VISUALIZATION',
          }));
        })
        .catch((err) => console.error('Fetching dashboard visualization issue', err.body.message));

      await SavedObjectsActions.getBulk<ObservabilitySavedVisualization>({
        objectType: ['savedVisualization'],
      })
        .then((res) => {
          opt2 = res.observabilityObjectList
            .filter((visualization) => !visualization.savedVisualization.application_id)
            .map((visualization) => ({
              label: visualization.savedVisualization.name,
              key: visualization.objectId,
              className: 'OBSERVABILITY_VISUALIZATION',
            }));
        })
        .catch((err) => console.error('Fetching observability visualization issue', err));

      const allVisualizations = [
        { label: 'Dashboards Visualizations', options: opt1 },
        { label: 'Observability Visualizations', options: opt2 },
      ];
      setVisOptions(allVisualizations);

      const selectedObject = filter([...opt1, ...opt2], {
        key: para.visSavedObjId,
      });
      if (selectedObject.length > 0) {
        setVisType(selectedObject[0].className ?? 'VISUALIZATION');
        setSelectedVisOption(selectedObject);
      }
    }
  };

  useEffect(() => {
    if (para.isVizualisation) {
      if (para.visSavedObjId !== '') setVisInput(JSON.parse(para.vizObjectInput));
      fetchVisualizations();
    }
  }, [dataSourceMDSId]);

  const createDashboardVizObject = (objectId: string) => {
    const vizUniqueId = htmlIdGenerator()();
    // a dashboard container object for new visualization
    const newVizObject: DashboardContainerInput = {
      viewMode: ViewMode.VIEW,
      panels: {
        '1': {
          gridData: {
            x: 0,
            y: 0,
            w: 50,
            h: 20,
            i: '1',
          },
          type: 'visualization',
          explicitInput: {
            id: '1',
            savedObjectId: objectId,
          },
        },
      },
      isFullScreenMode: false,
      filters: [],
      useMargins: false,
      id: vizUniqueId,
      timeRange: {
        to: para.visEndTime,
        from: para.visStartTime,
      },
      title: 'embed_viz_' + vizUniqueId,
      query: {
        query: '',
        language: 'lucene',
      },
      refreshConfig: {
        pause: true,
        value: 15,
      },
    };
    return newVizObject;
  };

  const onRunPara = () => {
    if (
      (!para.isVizualisation && !para.inp) ||
      (para.isVizualisation && selectedVisOption.length === 0)
    ) {
      setRunParaError(true);
      return;
    }
    let newVisObjectInput;
    if (para.isVizualisation) {
      const inputTemp = createDashboardVizObject(selectedVisOption[0].key);
      setVisInput(inputTemp);
      setRunParaError(false);
      newVisObjectInput = JSON.stringify(inputTemp);
    }
    setRunParaError(false);
    return props.runPara(para, index, newVisObjectInput, visType, dataSourceMDSId);
  };

  const setStartTime = (time: string) => {
    const newPara = props.para;
    newPara.visStartTime = time;
    props.setPara(newPara);
  };
  const setEndTime = (time: string) => {
    const newPara = props.para;
    newPara.visEndTime = time;
    props.setPara(newPara);
  };
  const setIsOutputStale = (isStale: boolean) => {
    const newPara = props.para;
    newPara.isOutputStale = isStale;
    props.setPara(newPara);
  };

  // do not show output if it is a visualization paragraph and visInput is not loaded yet
  const paraOutput = (!para.isVizualisation || visInput) && (
    <ParaOutput
      http={http}
      pplService={pplService}
      key={para.uniqueId}
      para={para}
      visInput={visInput}
      setVisInput={setVisInput}
      DashboardContainerByValueRenderer={DashboardContainerByValueRenderer}
    />
  );

  // do not show input and EuiPanel if view mode is output_only
  if (props.selectedViewId === 'output_only') {
    return paraOutput;
  }

  const renderParaHeader = (type: string, idx: number) => {
    const panels: EuiContextMenuPanelDescriptor[] = [
      {
        id: 0,
        title: 'Paragraph actions',
        items: [
          {
            name: 'Insert paragraph above',
            panel: 1,
          },
          {
            name: 'Insert paragraph below',
            panel: 2,
          },
          {
            name: 'Run input',
            onClick: () => {
              setIsPopoverOpen(false);
              onRunPara();
            },
          },
          {
            name: 'Move up',
            disabled: idx === 0,
            onClick: () => {
              setIsPopoverOpen(false);
              props.movePara(idx, idx - 1);
            },
          },
          {
            name: 'Move to top',
            disabled: idx === 0,
            onClick: () => {
              setIsPopoverOpen(false);
              props.movePara(idx, 0);
            },
          },
          {
            name: 'Move down',
            disabled: idx === props.paraCount - 1,
            onClick: () => {
              setIsPopoverOpen(false);
              props.movePara(idx, idx + 1);
            },
          },
          {
            name: 'Move to bottom',
            disabled: idx === props.paraCount - 1,
            onClick: () => {
              setIsPopoverOpen(false);
              props.movePara(idx, props.paraCount - 1);
            },
          },
          {
            name: 'Duplicate',
            onClick: () => {
              setIsPopoverOpen(false);
              props.clonePara(para, idx + 1);
            },
            'data-test-subj': 'duplicateParagraphBtn',
          },
          {
            name: 'Delete',
            onClick: () => {
              setIsPopoverOpen(false);
              props.deletePara(para, idx);
            },
          },
        ],
      },
      {
        id: 1,
        title: 'Insert paragraph above',
        items: [
          {
            name: 'Code block',
            onClick: () => {
              setIsPopoverOpen(false);
              props.addPara(idx, '', 'CODE');
            },
          },
          {
            name: 'Visualization',
            onClick: () => {
              setIsPopoverOpen(false);
              props.addPara(idx, '', 'VISUALIZATION');
            },
          },
        ],
      },
      {
        id: 2,
        title: 'Insert paragraph below',
        items: [
          {
            name: 'Code block',
            onClick: () => {
              setIsPopoverOpen(false);
              props.addPara(idx + 1, '', 'CODE');
            },
          },
          {
            name: 'Visualization',
            onClick: () => {
              setIsPopoverOpen(false);
              props.addPara(idx + 1, '', 'VISUALIZATION');
            },
          },
        ],
      },
    ];

    return (
      <>
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiText style={{ fontSize: 17 }}>
              {`[${idx + 1}] ${type} `}
              <EuiSmallButtonIcon
                data-test-subj="paragraphToggleInputBtn"
                aria-label="Toggle show input"
                iconType={para.isInputExpanded ? 'arrowUp' : 'arrowDown'}
                onClick={() => {
                  const newPara = props.para;
                  newPara.isInputExpanded = !newPara.isInputExpanded;
                  props.setPara(newPara);
                }}
              />
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiPopover
              panelPaddingSize="none"
              button={
                <EuiSmallButtonIcon
                  aria-label="Open paragraph menu"
                  iconType="boxesHorizontal"
                  onClick={() => setIsPopoverOpen(!isPopoverOpen)}
                />
              }
              isOpen={isPopoverOpen}
              closePopover={() => setIsPopoverOpen(false)}
            >
              <EuiContextMenu initialPanelId={0} panels={panels} size="s" />
            </EuiPopover>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
      </>
    );
  };

  const renderOutputTimestampMessage = () => {
    if (props.selectedViewId === 'view_both') {
      return (
        <>
          <EuiFlexItem grow={false} />
          <EuiFlexItem grow={false}>
            {para.isOutputStale ? (
              <EuiIcon type="questionInCircle" color="primary" />
            ) : (
              <EuiIcon type="check" color="secondary" />
            )}
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText color="subdued" data-test-subj="lastRunText" size="s">
              {`Last successful run ${moment(props.dateModified).format(UI_DATE_FORMAT)}.`}
            </EuiText>
          </EuiFlexItem>
        </>
      );
    } else {
      // render message when view mode is input_only
      return (
        <>
          <EuiFlexItem grow={false} />
          <EuiFlexItem grow={false}>
            <EuiIcon type="questionInCircle" color="primary" />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText color="subdued" size="s">
              {`Output available from ${moment(props.dateModified).format(UI_DATE_FORMAT)}`}
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText size="s">
              <EuiLink
                data-test-subj="viewBothLink"
                onClick={() => props.setSelectedViewId('view_both', index)}
              >
                View both
              </EuiLink>
            </EuiText>
          </EuiFlexItem>
        </>
      );
    }
  };

  const sqlIcon = (
    <>
      <EuiLink href={SQL_DOCUMENTATION_URL} target="_blank">
        SQL
      </EuiLink>{' '}
    </>
  );

  const pplIcon = (
    <>
      <EuiLink href={PPL_DOCUMENTATION_URL} target="_blank">
        PPL
      </EuiLink>{' '}
    </>
  );

  const paragraphLabel = !para.isVizualisation ? (
    <EuiText size="s">
      Specify the input language on the first line using %[language type]. Supported languages
      include markdown, {sqlIcon} and {pplIcon}.
    </EuiText>
  ) : null;

  const queryErrorMessage = queryParagraphErrorMessage.includes('SQL') ? (
    <EuiText size="s">
      {queryParagraphErrorMessage}. Learn More{' '}
      <EuiLink href={SQL_DOCUMENTATION_URL} target="_blank">
        <EuiIcon type="popout" size="s" />
      </EuiLink>
    </EuiText>
  ) : (
    <EuiText size="s">
      {queryParagraphErrorMessage}.{' '}
      <EuiLink href={PPL_DOCUMENTATION_URL} target="_blank">
        Learn More <EuiIcon type="popout" size="s" />
      </EuiLink>
    </EuiText>
  );

  const paraClass = `notebooks-paragraph notebooks-paragraph-${
    uiSettingsService.get('theme:darkMode') ? 'dark' : 'light'
  }`;
  let DataSourceSelector;
  const onSelectedDataSource = (e) => {
    const dataConnectionId = e[0] ? e[0].id : undefined;
    const dataConnectionLabel = e[0] ? e[0].label : undefined;
    setDataSourceMDSId(dataConnectionId);
    handleSelectedDataSourceChange(dataConnectionId, dataConnectionLabel);
  };

  if (dataSourceEnabled) {
    DataSourceSelector = dataSourceManagement.ui.DataSourceSelector;
  }
  return (
    <>
      <EuiPanel>
        {renderParaHeader(!para.isVizualisation ? 'Code block' : 'Visualization', index)}
        {dataSourceEnabled && !para.isVizualisation && (
          <DataSourceSelector
            savedObjectsClient={savedObjectsMDSClient.client}
            notifications={notifications}
            onSelectedDataSource={onSelectedDataSource}
            disabled={false}
            fullWidth={false}
            removePrepend={false}
            defaultOption={
              paradataSourceMDSId !== undefined && [
                { id: paradataSourceMDSId, label: dataSourceMDSLabel },
              ]
            }
            dataSourceFilter={dataSourceFilterFn}
          />
        )}
        <EuiSpacer size="s" />
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
        <div key={index} className={paraClass} onClick={() => paragraphSelector(index)}>
          {para.isInputExpanded && (
            <>
              <EuiSpacer size="s" />
              <EuiCompressedFormRow
                fullWidth={true}
                helpText={paragraphLabel}
                isInvalid={showQueryParagraphError}
                error={queryErrorMessage}
              >
                <ParaInput
                  para={para}
                  index={index}
                  runParaError={runParaError}
                  textValueEditor={textValueEditor}
                  handleKeyPress={handleKeyPress}
                  startTime={para.visStartTime}
                  setStartTime={setStartTime}
                  endTime={para.visEndTime}
                  setEndTime={setEndTime}
                  setIsOutputStale={setIsOutputStale}
                  visOptions={visOptions}
                  selectedVisOption={selectedVisOption}
                  setSelectedVisOption={setSelectedVisOption}
                  setVisType={setVisType}
                  dataSourceManagement={dataSourceManagement}
                  notifications={notifications}
                  dataSourceEnabled={dataSourceEnabled}
                  savedObjectsMDSClient={savedObjectsMDSClient}
                />
              </EuiCompressedFormRow>
              {runParaError && (
                <EuiText color="danger" size="s" data-test-subj="paragraphInputErrorText">{`${
                  para.isVizualisation ? 'Visualization' : 'Input'
                } is required.`}</EuiText>
              )}
              <EuiSpacer size="m" />
              <EuiFlexGroup alignItems="center" gutterSize="s">
                <EuiFlexItem grow={false}>
                  <EuiSmallButton
                    data-test-subj={`runRefreshBtn-${index}`}
                    onClick={() => onRunPara()}
                  >
                    {isOutputAvailable ? 'Refresh' : 'Run'}
                  </EuiSmallButton>
                </EuiFlexItem>
                {isOutputAvailable && renderOutputTimestampMessage()}
              </EuiFlexGroup>
              <EuiSpacer size="m" />
            </>
          )}
          {props.selectedViewId !== 'input_only' && isOutputAvailable && (
            <>
              <EuiHorizontalRule margin="none" />
              <div style={{ opacity: para.isOutputStale ? 0.5 : 1, padding: '15px' }}>
                {paraOutput}
              </div>
            </>
          )}
        </div>
      </EuiPanel>
    </>
  );
});
