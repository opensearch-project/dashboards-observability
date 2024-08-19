/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiSmallButton,
  EuiSmallButtonIcon,
  EuiCallOut,
  EuiCodeBlock,
  EuiDatePicker,
  EuiDatePickerRange,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiCompressedFormRow,
  EuiIcon,
  EuiLoadingChart,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiCompressedSelect,
  EuiSelectOption,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
  ShortDate,
} from '@elastic/eui';
import _ from 'lodash';
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { CoreStart } from '../../../../../../../src/core/public';
import { SAVED_VISUALIZATION } from '../../../../../common/constants/explorer';
import {
  PPLResponse,
  SavedVisualizationType,
  VisualizationType,
  VizContainerError,
} from '../../../../../common/types/custom_panels';
import { uiSettingsService } from '../../../../../common/utils';

import PPLService from '../../../../services/requests/ppl';
import { SavedObjectsActions } from '../../../../services/saved_objects/saved_object_client/saved_objects_actions';
import { ObservabilitySavedVisualization } from '../../../../services/saved_objects/saved_object_client/types';
import { FlyoutContainers } from '../../../common/flyout_containers';
import {
  displayVisualization,
  getQueryResponse,
  isDateValid,
  parseSavedVisualizations,
} from '../../helpers/utils';
import { replaceVizInPanel, selectPanel } from '../../redux/panel_slice';
import './visualization_flyout.scss';
import { useToast } from '../../../common/toast';
import { convertDateTime } from '../../../common/query_utils';

/*
 * VisaulizationFlyoutSO - This module create a flyout to add visualization for SavedObjects custom Panels
 *
 * Props taken in as params are:
 * panelId: panel Id of current Observability Dashboard
 * closeFlyout: function to close the flyout
 * start: start time in date filter
 * end: end time in date filter
 * savedObjects: savedObjects core service
 * pplService: ppl requestor service
 * setPanelVisualizations: function set the visualization list in panel
 * isFlyoutReplacement: boolean to see if the flyout is trigger for add or replace visualization
 * replaceVisualizationId: string id of the visualization to be replaced
 */

interface VisualizationFlyoutSOProps {
  panelId: string;
  pplFilterValue: string;
  closeFlyout: () => void;
  start: ShortDate;
  end: ShortDate;
  http: CoreStart['http'];
  savedObjects: CoreStart['savedObjects'];
  pplService: PPLService;
  setPanelVisualizations: React.Dispatch<React.SetStateAction<VisualizationType[]>>;
  isFlyoutReplacement?: boolean | undefined;
  replaceVisualizationId?: string | undefined;
  appId?: string;
  addVisualizationPanel: any;
}

export const VisaulizationFlyoutSO = ({
  appId = '',
  pplFilterValue,
  closeFlyout,
  start,
  end,
  pplService,
  isFlyoutReplacement,
  replaceVisualizationId,
  addVisualizationPanel,
}: VisualizationFlyoutSOProps) => {
  const dispatch = useDispatch();
  const { setToast } = useToast();

  const panel = useSelector(selectPanel);

  const [newVisualizationTitle, setNewVisualizationTitle] = useState('');
  const [newVisualizationType, setNewVisualizationType] = useState('');
  const [newVisualizationTimeField, setNewVisualizationTimeField] = useState('');
  const [previewMetaData, setPreviewMetaData] = useState<SavedVisualizationType>();
  const [pplQuery, setPPLQuery] = useState('');
  const [previewData, setPreviewData] = useState<PPLResponse>({} as PPLResponse);
  const [previewArea, setPreviewArea] = useState(<></>);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isPreviewError, setIsPreviewError] = useState({} as VizContainerError);
  const [savedVisualizations, setSavedVisualizations] = useState<SavedVisualizationType[]>([]);
  const [visualizationOptions, setVisualizationOptions] = useState<EuiSelectOption[]>([]);
  const [selectValue, setSelectValue] = useState('');

  // DateTimePicker States
  const startDate = convertDateTime(start, true, false);
  const endDate = convertDateTime(end, false, false);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState(<></>);

  const closeModal = () => setIsModalVisible(false);
  const showModal = (modalType: string) => {
    setModalContent(
      <EuiModal onClose={closeModal}>
        <EuiModalHeader>
          <EuiModalHeaderTitle>
            <h1>{isPreviewError.errorMessage}</h1>
          </EuiModalHeaderTitle>
        </EuiModalHeader>

        <EuiModalBody>
          Error Details
          <EuiSpacer />
          <EuiCodeBlock language="html" isCopyable>
            {isPreviewError.errorDetails}
          </EuiCodeBlock>
        </EuiModalBody>

        <EuiModalFooter>
          <EuiSmallButton onClick={closeModal} fill>
            Close
          </EuiSmallButton>
        </EuiModalFooter>
      </EuiModal>
    );

    setIsModalVisible(true);
  };

  const isInputValid = () => {
    if (!isDateValid(convertDateTime(start), convertDateTime(end, false), setToast)) {
      return false;
    }

    if (selectValue === '') {
      setToast('Please make a valid selection', 'danger', undefined);
      return false;
    }

    return true;
  };

  const addVisualization = () => {
    if (!isInputValid()) return;

    if (isFlyoutReplacement) {
      dispatch(
        replaceVizInPanel(panel, replaceVisualizationId, selectValue, newVisualizationTitle)
      );
    } else {
      const visualizationsWithNewPanel = addVisualizationPanel({
        savedVisualizationId: selectValue,
        onSuccess: `Visualization ${newVisualizationTitle} successfully added!`,
        onFailure: `Error in adding ${newVisualizationTitle} visualization to the panel`,
      });
    }
    setToast(`Visualization ${newVisualizationTitle} successfully added!`);
    closeFlyout();
  };

  const onRefreshPreview = () => {
    if (!isInputValid()) return;

    getQueryResponse(
      pplService,
      pplQuery,
      newVisualizationType,
      start,
      end,
      setPreviewData,
      setPreviewLoading,
      setIsPreviewError,
      pplFilterValue,
      newVisualizationTimeField
    );
  };

  const timeRange = (
    <EuiToolTip
      position="bottom"
      content="Picker is disabled. Please edit date/time from panel"
      display="block"
    >
      <EuiCompressedFormRow
        label="Panel Time Range"
        fullWidth
        isInvalid={startDate > endDate}
        // date-picker-preview style reduces height, need to add an empty line
        // above error message so it does not overlap with DatePicker.
        error={['', 'Time range is invalid.']}
      >
        <EuiDatePickerRange
          className="date-picker-preview"
          fullWidth
          readOnly
          startDateControl={
            <EuiDatePicker
              selected={startDate}
              startDate={startDate}
              endDate={endDate}
              isInvalid={startDate > endDate}
              aria-label="Start date"
              dateFormat={uiSettingsService.get('dateFormat')}
            />
          }
          endDateControl={
            <EuiDatePicker
              selected={endDate}
              startDate={startDate}
              endDate={endDate}
              isInvalid={startDate > endDate}
              aria-label="End date"
              dateFormat={uiSettingsService.get('dateFormat')}
            />
          }
        />
      </EuiCompressedFormRow>
    </EuiToolTip>
  );

  const flyoutHeader = (
    <EuiFlyoutHeader hasBorder>
      <EuiTitle size="m">
        <h2 id="addVisualizationFlyout">
          {isFlyoutReplacement ? 'Replace visualization' : 'Select existing visualization'}
        </h2>
      </EuiTitle>
    </EuiFlyoutHeader>
  );

  const onChangeSelection = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectValue(e.target.value);
  };

  const emptySavedVisualizations = (
    <EuiCallOut iconType="help">
      <p>No saved visualizations found!</p>
    </EuiCallOut>
  );

  const flyoutBody =
    savedVisualizations.length > 0 ? (
      <EuiFlyoutBody>
        <>
          <EuiSpacer size="s" />
          <EuiCompressedFormRow label="Visualization name">
            <EuiCompressedSelect
              hasNoInitialSelection
              onChange={(e) => onChangeSelection(e)}
              options={visualizationOptions}
              value={selectValue}
            />
          </EuiCompressedFormRow>
          <EuiSpacer size="l" />
          <EuiFlexGroup alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiText grow={false}>
                <h4>Preview</h4>
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiSmallButtonIcon
                aria-label="refreshPreview"
                iconType="refresh"
                onClick={onRefreshPreview}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="s" />
          {previewArea}
        </>
      </EuiFlyoutBody>
    ) : (
      <EuiFlyoutBody banner={emptySavedVisualizations}>
        <>
          <div>{'Please use the "create new visualization" option in add visualization menu.'}</div>
        </>
      </EuiFlyoutBody>
    );

  const flyoutFooter = (
    <EuiFlyoutFooter>
      <EuiFlexGroup gutterSize="s" justifyContent="spaceBetween">
        <EuiFlexItem grow={false}>
          <EuiSmallButton data-test-subj="closeFlyoutButton" onClick={closeFlyout}>
            Cancel
          </EuiSmallButton>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSmallButton data-test-subj="addFlyoutButton" onClick={addVisualization} fill>
            Add
          </EuiSmallButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlyoutFooter>
  );

  // Fetch all saved visualizations
  const fetchSavedVisualizations = async () => {
    return SavedObjectsActions.getBulk<ObservabilitySavedVisualization>({
      objectType: [SAVED_VISUALIZATION],
      sortOrder: 'desc',
      fromIndex: 0,
    })
      .then((response) => ({
        visualizations: response.observabilityObjectList.map(parseSavedVisualizations),
      }))
      .then((res) => {
        if (res.visualizations.length > 0) {
          setSavedVisualizations(res.visualizations);
          const filterAppVis = res.visualizations.filter((vis: SavedVisualizationType) => {
            return appId
              ? vis.hasOwnProperty('application_id')
                ? vis.application_id === appId
                : false
              : !vis.hasOwnProperty('application_id');
          });
          setVisualizationOptions(
            filterAppVis.map((visualization: SavedVisualizationType) => {
              return { value: visualization.id, text: visualization.name };
            })
          );
        }
      })
      .catch((err) => {
        console.error('Issue in fetching the operational panels', err);
      });
  };

  useEffect(() => {
    const previewTemplate = (
      <>
        {timeRange}
        <EuiFlexGroup>
          <EuiFlexItem>
            {previewLoading ? (
              <EuiLoadingChart size="xl" mono className="visualization-loading-chart-preview" />
            ) : !_.isEmpty(isPreviewError) ? (
              <div className="visualization-error-div">
                <EuiIcon type="alert" color="danger" size="s" />
                <EuiSpacer size="s" />
                <EuiText size="s">
                  <p>{isPreviewError.errorMessage}</p>
                </EuiText>
                {isPreviewError.hasOwnProperty('errorDetails') &&
                isPreviewError.errorDetails !== '' ? (
                  <EuiSmallButton color="danger" onClick={() => showModal('errorModal')} size="s">
                    See error details
                  </EuiSmallButton>
                ) : (
                  <></>
                )}
              </div>
            ) : (
              <div className="visualization-div-preview">
                {displayVisualization(previewMetaData, previewData, newVisualizationType)}
              </div>
            )}
          </EuiFlexItem>
        </EuiFlexGroup>
      </>
    );
    setPreviewArea(previewTemplate);
  }, [previewLoading]);

  // On change of selected visualization change options
  useEffect(() => {
    for (let i = 0; i < savedVisualizations.length; i++) {
      const visualization = savedVisualizations[i];
      if (visualization.id === selectValue) {
        setPPLQuery(visualization.query);
        setNewVisualizationTitle(visualization.name);
        setNewVisualizationType(visualization.type);
        setPreviewMetaData(visualization);
        setNewVisualizationTimeField(visualization.timeField);
        break;
      }
    }
  }, [selectValue]);

  // load saved visualizations
  useEffect(() => {
    fetchSavedVisualizations();
  }, []);

  return (
    <>
      <FlyoutContainers
        closeFlyout={closeFlyout}
        flyoutHeader={flyoutHeader}
        flyoutBody={flyoutBody}
        flyoutFooter={flyoutFooter}
        ariaLabel="addVisualizationFlyout"
      />
      {isModalVisible && modalContent}
    </>
  );
};
