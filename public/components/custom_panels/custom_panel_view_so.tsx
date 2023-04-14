/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* // eslint-disable no-console */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiBreadcrumb,
  EuiButton,
  EuiContextMenu,
  EuiContextMenuPanelDescriptor,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiOverlayMask,
  EuiPage,
  EuiPageBody,
  EuiPageContentBody,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiPopover,
  EuiSpacer,
  EuiSuperDatePicker,
  EuiTitle,
  OnTimeChangeProps,
  ShortDate,
} from '@elastic/eui';
import { last } from 'lodash';
import React, { useEffect, useState } from 'react';
import { DurationRange } from '@elastic/eui/src/components/date_picker/types';
import moment from 'moment';
import _ from 'lodash';
import { useDispatch, useSelector } from 'react-redux';
import { useRef } from 'react';
import DSLService from '../../services/requests/dsl';
import { CoreStart, SimpleSavedObject } from '../../../../../src/core/public';
import { EmptyPanelView } from './panel_modules/empty_panel';
import {
  CREATE_PANEL_MESSAGE,
  CUSTOM_PANELS_API_PREFIX,
  CUSTOM_PANELS_SAVED_OBJECT_TYPE,
} from '../../../common/constants/custom_panels';
import {
  CustomPanelType,
} from '../../../common/types/custom_panels';
import { PanelGridSO } from './panel_modules/panel_grid/panel_grid_so';

import { getCustomModal } from './helpers/modal_containers';
import PPLService from '../../services/requests/ppl';
import {
  isDateValid,
  convertDateTime,
  isPPLFilterValid,
  isNameValid,
  prependRecentlyUsedRange,
} from './helpers/utils';
import { UI_DATE_FORMAT } from '../../../common/constants/shared';
import { VisaulizationFlyout } from './panel_modules/visualization_flyout';
import { uiSettingsService } from '../../../common/utils';
import { PPLReferenceFlyout } from '../common/helpers';
import { Autocomplete } from '../common/search/autocomplete';
import {
  parseGetSuggestions,
  onItemSelect,
  parseForIndices,
} from '../common/search/autocomplete_logic';
import { AddVisualizationPopover } from './helpers/add_visualization_popover';
import { DeleteModal } from '../common/helpers/delete_modal';
import { VisaulizationFlyoutSO } from './panel_modules/visualization_flyout/visualization_flyout_so';
import { addVisualizationPanel } from './helpers/add_visualization_helper';
import { fetchPanel, selectPanel, setPanel, setPanelEt, setPanelId, setPanelSt, updatePanel } from './redux/panel_slice';
import { coreRefs } from '../../framework/core_refs';

/*
 * "CustomPanelsView" module used to render an Operational Panel
 *
 * Props taken in as params are:
 * panelId: Name of the panel opened
 * page: Page where component is called
 * http: http core service
 * coreSavedObjects : savedObjects core service
 * pplService: ppl requestor service
 * dslService: dsl requestor service
 * chrome: chrome core service
 * parentBreadcrumb: parent breadcrumb
 * renameCustomPanel: Rename function for the panel
 * deleteCustomPanel: Delete function for the panel
 * cloneCustomPanel: Clone function for the panel
 * setToast: create Toast function
 * onEditClick: Edit function for visualization
 * startTime: Starting time
 * endTime: Ending time
 * setStartTime: Function to change start time
 * setEndTime: Function to change end time
 * childBreadcrumbs: Breadcrumbs to extend
 * appId: id of application that panel belongs to
 * onAddClick: Function for add button instead of add visualization popover
 */

interface CustomPanelViewProps {
  panelId: string;
  page: 'app' | 'operationalPanels';
  coreSavedObjects: CoreStart['savedObjects'];
  chrome: CoreStart['chrome'];
  parentBreadcrumbs: EuiBreadcrumb[];
  deleteCustomPanel: (customPanelId: string, customPanelName: string) => Promise<any>;
  cloneCustomPanel: (clonedCustomPanelName: string, clonedCustomPanelId: string) => Promise<string>;
  setToast: (
    title: string,
    color?: string,
    text?: React.ReactChild | undefined,
    side?: string | undefined
  ) => void;
  onEditClick: (savedVisualizationId: string) => any;
  childBreadcrumbs?: EuiBreadcrumb[];
  appId?: string;
  updateAvailabilityVizId?: any;
  onAddClick?: any;
}

export const CustomPanelViewSO = (props: CustomPanelViewProps) => {
  const {
    panelId,
    page,
    appId,
    pplService,
    dslService,
    chrome,
    parentBreadcrumbs,
    childBreadcrumbs,
    updateAvailabilityVizId,
    deleteCustomPanel,
    cloneCustomPanel,
    setToast,
    onEditClick,
    onAddClick,
  } = props;

  const dispatch = useDispatch();

  const panel = useSelector(selectPanel);

  const [pplFilterValue, setPPLFilterValue] = useState('');
  const [baseQuery, setBaseQuery] = useState('');
  const [onRefresh, setOnRefresh] = useState(false);

  const [inputDisabled, setInputDisabled] = useState(true);
  const [addVizDisabled, setAddVizDisabled] = useState(false);
  const [editDisabled, setEditDisabled] = useState(false);
  const [dateDisabled, setDateDisabled] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false); // Modal Toggle
  const [modalLayout, setModalLayout] = useState(<EuiOverlayMask />); // Modal Layout
  const [isFlyoutVisible, setIsFlyoutVisible] = useState(false); // Add Visualization Flyout
  const [isFlyoutReplacement, setisFlyoutReplacement] = useState<boolean | undefined>(false);
  const [replaceVisualizationId, setReplaceVisualizationId] = useState<string | undefined>('');
  const [panelsMenuPopover, setPanelsMenuPopover] = useState(false);
  const [editActionType, setEditActionType] = useState('');
  const [isHelpFlyoutVisible, setHelpIsFlyoutVisible] = useState(false);

  const appPanel = page === 'app';

  const closeHelpFlyout = () => {
    setAddVizDisabled(false);
    setHelpIsFlyoutVisible(false);
  };

  const showHelpFlyout = () => {
    setAddVizDisabled(true);
    setHelpIsFlyoutVisible(true);
  };

  // DateTimePicker States/add
  const [recentlyUsedRanges, setRecentlyUsedRanges] = useState<DurationRange[]>([]);

  const handleQueryChange = (newQuery: string) => {
    setPPLFilterValue(newQuery);
  };

  const closeModal = () => {
    setIsModalVisible(false);
  };

  const showModal = () => {
    setIsModalVisible(true);
  };

  const onDatePickerChange = (timeProps: OnTimeChangeProps) => {
    const updatedRanges = prependRecentlyUsedRange(timeProps.start, timeProps.end, recentlyUsedRanges);
    dispatch(updatePanel({ ...panel, timeRange: { from: timeProps.start, to: timeProps.end } }))

    setRecentlyUsedRanges(updatedRanges.slice(0, 9))
    onRefreshFilters(timeProps.start, timeProps.end);
  };

  const onDelete = async () => {
    deleteCustomPanel(panelId, panel?.title).then((res) => {
      setTimeout(() => {
        window.location.assign(`${last(parentBreadcrumbs)!.href}`);
      }, 1000);
    });
    closeModal();
  };

  const deletePanel = () => {
    setModalLayout(
      <DeleteModal
        onConfirm={onDelete}
        onCancel={closeModal}
        title={`Delete ${panel?.title}`}
        message={`Are you sure you want to delete this Operational Panel?`}
      />
    );
    showModal();
  };

  const renameCustomPanel = (editedCustomPanelName: string) => {
    if (!isNameValid(editedCustomPanelName)) {
      setToast('Invalid Custom Panel name', 'danger');
      return Promise.reject();
    }

    const updatedPanel = { ...panel, name: editedCustomPanelName };

    return coreRefs.savedObjectsClient
      .update(CUSTOM_PANELS_SAVED_OBJECT_TYPE, panel.id, panel)
      .then((res) => {
        setOpenPanelName(editedCustomPanelName);
        setToast(`Operational Panel successfully renamed into "${editedCustomPanelName}"`);
      })
      .catch((err) => {
        setToast(
          'Error renaming Operational Panel, please make sure you have the correct permission.',
          'danger'
        );
        console.error(err.body.message);
      });
  };
  const onRename = async (newCustomPanelName: string) => {
    const newPanel = { ...panel, title: newCustomPanelName };
    dispatch(updatePanel(newPanel));
    closeModal();
  };

  const renamePanel = () => {
    setModalLayout(
      getCustomModal(
        onRename,
        closeModal,
        'Name',
        'Rename Panel',
        'Cancel',
        'Rename',
        panel.title,
        CREATE_PANEL_MESSAGE
      )
    );
    showModal();
  };

  const onClone = async (newCustomPanelName: string) => {
    cloneCustomPanel(newCustomPanelName, panelId).then((id: string) => {
      window.location.assign(`${last(parentBreadcrumbs)!.href}${id}`);
    });
    closeModal();
  };

  const clonePanel = () => {
    setModalLayout(
      getCustomModal(
        onClone,
        closeModal,
        'Name',
        'Duplicate Panel',
        'Cancel',
        'Duplicate',
        panel.title + ' (copy)',
        CREATE_PANEL_MESSAGE
      )
    );
    showModal();
  };

  // toggle between panel edit mode

  const startEdit = () => {
    setIsEditing(true);
  };

  const applyEdits = () => {
    console.log('applyEdits', panel);
    dispatch(updatePanel(panel));
    setIsEditing(false);
  };

  const cancelEdit = () => {
    console.log('cancelEdits');
    dispatch(fetchPanel(panelId));
    setIsEditing(false);
  };

  const closeFlyout = () => {
    setIsFlyoutVisible(false);
    setAddVizDisabled(false);
    checkDisabledInputs();
  };

  const showFlyout = (isReplacement?: boolean, replaceVizId?: string) => {
    setisFlyoutReplacement(isReplacement);
    setReplaceVisualizationId(replaceVizId);
    setIsFlyoutVisible(true);
    setAddVizDisabled(true);
    setInputDisabled(true);
  };

  const checkDisabledInputs = () => {
    // When not in edit mode and panel has no visualizations
    if (panel.visualizations.length === 0 && !isEditing) {
      setEditDisabled(true);
      setInputDisabled(true);
      setAddVizDisabled(false);
      setDateDisabled(false);
    }

    // When panel has visualizations
    if (panel.visualizations.length > 0) {
      setEditDisabled(false);
      setInputDisabled(false);
      setAddVizDisabled(false);
      setDateDisabled(false);
    }

    // When in edit mode
    if (isEditing) {
      setEditDisabled(false);
      setInputDisabled(true);
      setAddVizDisabled(true);
      setDateDisabled(true);
    }
  };

  const buildBaseQuery = async () => {
    // const indices: string[] = [];
    // for (let i = 0; i < visualizations.length; i++) {
    //   const visualizationId = visualizations[i].savedVisualizationId;
    //   // TODO: create route to get list of visualizations in one call
    //   const visData: SavedVisualizationType = await fetchVisualizationById(
    //     http,
    //     visualizationId,
    //     (error: VizContainerError) => setToast(error.errorMessage, 'danger')
    //   );

    //   if (!_.isEmpty(visData)) {
    //     const moreIndices = parseForIndices(visData.query);
    //     for (let j = 0; j < moreIndices.length; j++) {
    //       if (!indices.includes(moreIndices[j])) {
    //         indices.push(moreIndices[j]);
    //       }
    //     }
    //   }
    // }
    // setBaseQuery('source = ' + indices.join(', '));
    return;
  };

  const onRefreshFilters = (start: ShortDate, end: ShortDate) => {
    if (!isDateValid(convertDateTime(start), convertDateTime(end, false), setToast)) {
      return;
    }

    if (!isPPLFilterValid(pplFilterValue, setToast)) {
      console.log(pplFilterValue)
      return;
    }

    const panelFilterBody = {
      panelId,
      query: pplFilterValue,
      language: 'ppl',
      to: end,
      from: start,
    };

    // http
    //   .post(`${CUSTOM_PANELS_API_PREFIX}/panels/filter`, {
    //     body: JSON.stringify(panelFilterBody),
    //   })
    //   .then((res) => {
    //     setOnRefresh(!onRefresh);
    //   })
    //   .catch((err) => {
    //     setToast('Error is adding filters to the operational panel', 'danger');
    //     console.error(err.body.message);
    //   });
  };

  const cloneVisualization = (visualzationTitle: string, savedVisualizationId: string) => {
    // http
    //   .post(`${CUSTOM_PANELS_API_PREFIX}/visualizations`, {
    //     body: JSON.stringify({
    //       panelId,
    //       savedVisualizationId,
    //     }),
    //   })
    //   .then(async (res) => {
    //     setPanelVisualizations(res.visualizations);
    //     setToast(`Visualization ${visualzationTitle} successfully added!`, 'success');
    //   })
    //   .catch((err) => {
    //     setToast(`Error in adding ${visualzationTitle} visualization to the panel`, 'danger');
    //     console.error(err);
    //   });
  };

  const cancelButton = (
    <EuiButton
      data-test-subj="cancelPanelButton"
      iconType="cross"
      color="danger"
      onClick={cancelEdit}
    >
      Cancel
    </EuiButton>
  );

  const saveButton = (
    <EuiButton data-test-subj="savePanelButton" iconType="save" onClick={applyEdits}>
      Save
    </EuiButton>
  );

  const editButton = (
    <EuiButton
      data-test-subj="editPanelButton"
      iconType="pencil"
      onClick={startEdit}
      disabled={editDisabled}
    >
      Edit
    </EuiButton>
  );

  const addButton = (
    <EuiButton
      data-test-subj="addVisualizationButton"
      iconType="plusInCircle"
      onClick={onAddClick}
      isDisabled={addVizDisabled}
    >
      Add
    </EuiButton>
  );

  // Panel Actions Button
  const panelActionsButton = (
    <EuiButton
      data-test-subj="panelActionContextMenu"
      iconType="arrowDown"
      iconSide="right"
      onClick={() => setPanelsMenuPopover(true)}
      disabled={addVizDisabled}
    >
      Panel actions
    </EuiButton>
  );

  const addVisualizationToCurrentPanel = async ({
    savedVisualizationId,
    oldVisualizationId,
  }: {
    savedVisualizationId: string;
    oldVisualizationId?: string;
  }) => {
    const allVisualizations = panel!.visualizations;

    const visualizationsWithNewPanel = addVisualizationPanel(
      savedVisualizationId,
      oldVisualizationId,
      allVisualizations
    );

    const updatedPanel = { ...panel, visualizations: visualizationsWithNewPanel };
    try {
      dispatch(updatePanel(updatedPanel));
    } catch (err) {
      setToast('Error adding visualization to this panel', 'danger');
      console.error(err?.body?.message || err);
    }
  };

  const setPanelVisualizations = (newVis) => {
    const newPanel: CustomPanelType = { ...panel, visualizations: newVis };
    dispatch(setPanel(newPanel));
  };

  let flyout;
  if (isFlyoutVisible) {
    flyout = (
      <VisaulizationFlyoutSO
        panelId={panelId}
        closeFlyout={closeFlyout}
        pplFilterValue={pplFilterValue}
        start={panel.timeRange.from}
        end={panel.timeRange.to}
        setToast={setToast}
        http={coreRefs.http!}
        pplService={pplService}
        setPanelVisualizations={setPanelVisualizations}
        isFlyoutReplacement={isFlyoutReplacement}
        replaceVisualizationId={replaceVisualizationId}
        appId={appId}
        addVisualizationPanel={addVisualizationToCurrentPanel}
      />
    );
  }

  let helpFlyout;
  if (isHelpFlyoutVisible) {
    helpFlyout = <PPLReferenceFlyout module="panels" closeFlyout={closeHelpFlyout} />;
  }

  const panelActionsMenu: EuiContextMenuPanelDescriptor[] = [
    {
      id: 0,
      title: 'Panel actions',
      items: [
        {
          name: 'Reload panel',
          'data-test-subj': 'reloadPanelContextMenuItem',
          onClick: () => {
            setPanelsMenuPopover(false);
            dispatch(fetchPanel(panelId));
          },
        },
        {
          name: 'Rename panel',
          'data-test-subj': 'renamePanelContextMenuItem',
          onClick: () => {
            setPanelsMenuPopover(false);
            renamePanel();
          },
        },
        {
          name: 'Duplicate panel',
          'data-test-subj': 'duplicatePanelContextMenuItem',
          onClick: () => {
            setPanelsMenuPopover(false);
            clonePanel();
          },
        },
        {
          name: 'Delete panel',
          'data-test-subj': 'deletePanelContextMenuItem',
          onClick: () => {
            setPanelsMenuPopover(false);
            deletePanel();
          },
        },
      ],
    },
  ];
  // Fetch the custom panel on Initial Mount
  useEffect(() => {
    dispatch(fetchPanel(panelId));
  }, []);

  // Toggle input type (disabled or not disabled)
  // Disabled when there no visualizations in panels or when the panel is in edit mode
  useEffect(() => {
    checkDisabledInputs();
  }, [isEditing]);

  // Build base query with all of the indices included in the current visualizations
  useEffect(() => {
    checkDisabledInputs();
    buildBaseQuery();
  }, [panel]);

  // Edit the breadcrumb when panel name changes
  useEffect(() => {
    if (!panel) return;

    let newBreadcrumb;
    if (childBreadcrumbs) {
      newBreadcrumb = childBreadcrumbs;
    } else {
      newBreadcrumb = [
        {
          text: panel.title,
          href: `${last(parentBreadcrumbs)!.href}${panelId}`,
        },
      ];
    }
    chrome.setBreadcrumbs([...parentBreadcrumbs, ...newBreadcrumb]);
  }, [panelId, panel]);

  return (
    <div>
      <EuiPage id={`panelView${appPanel ? 'InApp' : ''}`}>
        <EuiPageBody component="div">
          <EuiPageHeader>
            {appPanel || (
              <>
                <EuiPageHeaderSection>
                  <EuiTitle size="l">
                    <h1 data-test-subj="panelNameHeader">{panel?.title}</h1>
                  </EuiTitle>
                  <EuiFlexItem>
                    <EuiSpacer size="s" />
                  </EuiFlexItem>
                  Created on {moment(panel?.dateCreated || 0).format(UI_DATE_FORMAT)}
                </EuiPageHeaderSection>
                <EuiPageHeaderSection>
                  <EuiFlexGroup gutterSize="s">
                    {isEditing ? (
                      <>
                        <EuiFlexItem>{cancelButton}</EuiFlexItem>
                        <EuiFlexItem>{saveButton}</EuiFlexItem>
                      </>
                    ) : (
                      <EuiFlexItem>{editButton}</EuiFlexItem>
                    )}
                    <EuiFlexItem grow={false}>
                      <EuiPopover
                        panelPaddingSize="none"
                        button={panelActionsButton}
                        isOpen={panelsMenuPopover}
                        closePopover={() => setPanelsMenuPopover(false)}
                      >
                        <EuiContextMenu initialPanelId={0} panels={panelActionsMenu} />
                      </EuiPopover>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <AddVisualizationPopover
                        addVizDisabled={addVizDisabled}
                        showFlyout={showFlyout}
                      />
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiPageHeaderSection>
              </>
            )}
          </EuiPageHeader>
          <EuiPageContentBody>
            <EuiFlexGroup gutterSize="s">
              <EuiFlexItem>
                <Autocomplete
                  key={'autocomplete-search-bar'}
                  query={pplFilterValue}
                  tempQuery={pplFilterValue}
                  baseQuery={baseQuery}
                  handleQueryChange={handleQueryChange}
                  handleQuerySearch={() =>
                    onRefreshFilters(panel.timeRange.from, panel.timeRange.to)
                  }
                  dslService={dslService}
                  getSuggestions={parseGetSuggestions}
                  onItemSelect={onItemSelect}
                  isDisabled={inputDisabled}
                  tabId={'panels-filter'}
                  placeholder={
                    "Use PPL 'where' clauses to add filters on all visualizations [where Carrier = 'OpenSearch-Air']"
                  }
                  possibleCommands={[{ label: 'where' }]}
                  append={
                    <EuiLink
                      aria-label="ppl-info"
                      onClick={showHelpFlyout}
                      style={{ padding: '10px' }}
                    >
                      PPL
                    </EuiLink>
                  }
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiSuperDatePicker
                  dateFormat={uiSettingsService.get('dateFormat')}
                  start={panel.timeRange.from}
                  end={panel.timeRange.to}
                  onTimeChange={onDatePickerChange}
                  recentlyUsedRanges={recentlyUsedRanges}
                  isDisabled={dateDisabled}
                />
              </EuiFlexItem>
              {appPanel && (
                <>
                  {isEditing ? (
                    <>
                      <EuiFlexItem grow={false}>{cancelButton}</EuiFlexItem>
                      <EuiFlexItem grow={false}>{saveButton}</EuiFlexItem>
                    </>
                  ) : (
                    <EuiFlexItem grow={false}>{editButton}</EuiFlexItem>
                  )}
                  <EuiFlexItem grow={false}>{addButton}</EuiFlexItem>
                </>
              )}
            </EuiFlexGroup>
            <EuiSpacer size="l" />
            {panel.visualizations.length === 0 && (
              <EmptyPanelView
                addVizDisabled={addVizDisabled}
                showFlyout={showFlyout}
                {...(appPanel ? { addButton } : {})}
              />
            )}
            <PanelGridSO
              // http={coreRefs.http}
              panelId={panelId}
              updateAvailabilityVizId={updateAvailabilityVizId}
              chrome={chrome}
              panelVisualizations={panel?.visualizations || []}
              setPanelVisualizations={setPanelVisualizations}
              editMode={isEditing}
              startTime={panel.timeRange.from}
              endTime={panel.timeRange.to}
              onRefresh={onRefresh}
              cloneVisualization={cloneVisualization}
              pplFilterValue={pplFilterValue}
              showFlyout={showFlyout}
              editActionType={editActionType}
              onEditClick={onEditClick}
            />
          </EuiPageContentBody>
        </EuiPageBody>
      </EuiPage>
      {isModalVisible && modalLayout}
      {flyout}
      {helpFlyout}
    </div>
  );
};
