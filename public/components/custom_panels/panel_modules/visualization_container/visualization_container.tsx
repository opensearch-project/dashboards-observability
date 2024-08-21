/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiSmallButton,
  EuiSmallButtonIcon,
  EuiCodeBlock,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLoadingChart,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiPanel,
  EuiPopover,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import isEmpty from 'lodash/isEmpty';
import React, { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  OTEL_METRIC_SUBTYPE,
  PROMQL_METRIC_SUBTYPE,
  observabilityMetricsID,
} from '../../../../../common/constants/shared';
import { VizContainerError } from '../../../../../common/types/custom_panels';
import { coreRefs } from '../../../../framework/core_refs';
import { useToast } from '../../../common/toast';
import { metricQuerySelector } from '../../../metrics/redux/slices/metrics_slice';
import {
  displayVisualization,
  fetchVisualizationById,
  renderCatalogVisualization,
  renderOpenTelemetryVisualization,
  renderSavedVisualization,
} from '../../helpers/utils';
import './visualization_container.scss';

/*
 * Visualization container - This module is a placeholder to add visualizations in react-grid-layout
 *
 * Props taken in as params are:
 * editMode: boolean to check if the panel is in edit mode
 * visualizationId: unique visualization id
 * visualizationTitle: visualization name
 * query: ppl query to load the visualization
 * pplService: ppl requestor service
 * type: type of visualization [bar, horizontal_bar, line]
 * fromTime: start time in date filter
 * toTime: end time in date filter
 * onRefresh: boolean value to trigger refresh of visualizations
 * cloneVisualization: function to clone a visualization in panel
 * pplFilterValue: string with panel PPL filter value
 * showFlyout: function to show the flyout
 * removeVisualization: function to remove all the visualizations
 * catalogVisualization: boolean pointing if the container is used for catalog metrics
 * spanParam: Override the span(timestamp, 1h) in visualization to span(timestamp, spanParam)
 */

interface Props {
  editMode: boolean;
  visualizationId: string;
  savedVisualizationId: string;
  inputMetaData: object;
  fromTime: string;
  toTime: string;
  span?: number | string;
  resolution?: string;
  onRefresh: boolean;
  pplFilterValue: string;
  usedInNotebooks?: boolean;
  onEditClick: (savedVisualizationId: string) => any;
  cloneVisualization?: (visualzationTitle: string, savedVisualizationId: string) => void;
  showFlyout?: (isReplacement?: boolean | undefined, replaceVizId?: string | undefined) => void;
  removeVisualization?: (visualizationId: string) => void;
  catalogVisualization?: boolean;
  inlineEditor?: JSX.Element;
  actionMenuType?: string;
  dataSourceMDSId?: string;
}

export const VisualizationContainer = ({
  editMode,
  visualizationId,
  savedVisualizationId,
  inputMetaData,
  fromTime,
  toTime,
  span,
  resolution,
  onRefresh,
  pplFilterValue,
  usedInNotebooks,
  onEditClick,
  cloneVisualization,
  showFlyout,
  removeVisualization,
  catalogVisualization,
  inlineEditor,
  actionMenuType,
  dataSourceMDSId,
}: Props) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [visualizationTitle, setVisualizationTitle] = useState('');
  const [visualizationType, setVisualizationType] = useState('');
  const [visualizationMetaData, setVisualizationMetaData] = useState();
  const [visualizationData, setVisualizationData] = useState<Plotly.Data[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState({} as VizContainerError);
  const onActionsMenuClick = () => setIsPopoverOpen((currPopoverOpen) => !currPopoverOpen);
  const closeActionsMenu = () => setIsPopoverOpen(false);
  const { http, pplService } = coreRefs;
  const { setToast } = useToast();

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState(<></>);

  const queryMetaData = useSelector(metricQuerySelector(visualizationId));
  const closeModal = () => setIsModalVisible(false);
  const showModal = (modalType: string) => {
    if (modalType === 'catalogModal')
      setModalContent(
        <EuiModal onClose={closeModal}>
          <EuiModalHeader>
            <EuiModalHeaderTitle>
              <h1>{visualizationMetaData.name}</h1>
            </EuiModalHeaderTitle>
          </EuiModalHeader>

          <EuiModalBody>
            This PPL Query is generated in runtime from selected data source
            <EuiSpacer />
            <EuiCodeBlock language="html" isCopyable>
              {visualizationMetaData.query}
            </EuiCodeBlock>
          </EuiModalBody>

          <EuiModalFooter>
            <EuiSmallButton onClick={closeModal} fill>
              Close
            </EuiSmallButton>
          </EuiModalFooter>
        </EuiModal>
      );
    else
      setModalContent(
        <EuiModal onClose={closeModal}>
          <EuiModalHeader>
            <EuiModalHeaderTitle>
              <h1>{isError.errorMessage}</h1>
            </EuiModalHeaderTitle>
          </EuiModalHeader>

          <EuiModalBody>
            Error Details
            <EuiSpacer />
            <EuiCodeBlock language="html" isCopyable>
              {isError.errorDetails}
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

  let popoverPanel = [
    <EuiContextMenuItem
      data-test-subj="editVizContextMenuItem"
      key="Edit"
      disabled={editMode}
      onClick={() => {
        closeActionsMenu();
        if (visualizationMetaData?.metricType === PROMQL_METRIC_SUBTYPE) {
          window.location.assign(`${observabilityMetricsID}#/${savedVisualizationId}`);
        } else {
          onEditClick(savedVisualizationId);
        }
      }}
    >
      Edit
    </EuiContextMenuItem>,
    <EuiContextMenuItem
      key="Replace"
      data-test-subj="replaceVizContextMenuItem"
      disabled={editMode}
      onClick={() => {
        closeActionsMenu();
        showFlyout(true, visualizationId);
      }}
    >
      Replace
    </EuiContextMenuItem>,
    <EuiContextMenuItem
      key="Duplicate"
      data-test-subj="duplicateVizContextMenuItem"
      disabled={editMode}
      onClick={() => {
        closeActionsMenu();
        cloneVisualization(visualizationTitle, savedVisualizationId);
      }}
    >
      Duplicate
    </EuiContextMenuItem>,
  ];

  const showPPLQueryPanel = [
    <EuiContextMenuItem
      data-test-subj="showCatalogPPLQuery"
      key="view_query"
      onClick={() => {
        closeActionsMenu();
        showModal('catalogModal');
      }}
    >
      View query
    </EuiContextMenuItem>,
  ];

  if (
    visualizationMetaData?.metricType === PROMQL_METRIC_SUBTYPE &&
    actionMenuType === 'metricsGrid'
  ) {
    popoverPanel = [showPPLQueryPanel];
  } else if (usedInNotebooks) {
    popoverPanel = [popoverPanel[0]];
  }

  const fetchVisualization = async () => {
    return savedVisualizationId
      ? await fetchVisualizationById(savedVisualizationId, setIsError)
      : inputMetaData;
  };

  const loadVisaulization = async () => {
    const visualization = await fetchVisualization();
    setVisualizationMetaData(visualization);

    if (!visualization && !savedVisualizationId) return;

    if (visualization.metricType === OTEL_METRIC_SUBTYPE)
      await renderOpenTelemetryVisualization({
        visualization,
        startTime: fromTime,
        endTime: toTime,
        setVisualizationTitle,
        setVisualizationType,
        setVisualizationData,
        setVisualizationMetaData,
        setIsLoading,
        setIsError,
        setToast,
        dataSourceMDSId,
      });
    else if (visualization.metricType === PROMQL_METRIC_SUBTYPE)
      renderCatalogVisualization({
        visualization,
        pplService,
        catalogSource: visualizationId,
        startTime: fromTime,
        endTime: toTime,
        span,
        resolution,
        filterQuery: pplFilterValue,
        setVisualizationTitle,
        setVisualizationType,
        setVisualizationData,
        setVisualizationMetaData,
        setIsLoading,
        setIsError,
        queryMetaData,
        dataSourceMDSId,
      });
    else
      await renderSavedVisualization({
        visualization,
        http,
        pplService,
        savedVisualizationId,
        startTime: fromTime,
        endTime: toTime,
        filterQuery: pplFilterValue,
        span,
        resolution,
        setVisualizationTitle,
        setVisualizationType,
        setVisualizationData,
        setVisualizationMetaData,
        setIsLoading,
        setIsError,
        dataSourceMDSId,
      });
  };

  const memoisedVisualizationBox = useMemo(
    () => (
      <div className="visualization-div">
        {isLoading ? (
          <EuiLoadingChart size="xl" mono className="visualization-loading-chart" />
        ) : !isEmpty(isError) ? (
          <div className="visualization-error-div">
            <EuiIcon type="alert" color="danger" size="s" />
            <EuiSpacer size="s" />
            <EuiText size="s">
              <p>{isError.errorMessage}</p>
            </EuiText>
            {isError.hasOwnProperty('errorDetails') && isError.errorDetails !== '' ? (
              <EuiButton
                className="viz-error-btn"
                color="danger"
                onClick={() => showModal('errorModal')}
                size="s"
              >
                See error details
              </EuiButton>
            ) : (
              <></>
            )}
          </div>
        ) : (
          displayVisualization(visualizationMetaData, visualizationData, visualizationType)
        )}
      </div>
    ),
    [onRefresh, isLoading, isError, visualizationData, visualizationType, visualizationMetaData]
  );

  useEffect(() => {
    loadVisaulization();
  }, [onRefresh, inputMetaData, span, resolution, fromTime, toTime]);

  const metricVisCssClassName = catalogVisualization ? 'metricVis' : '';

  return (
    <>
      <EuiPanel
        data-test-subj={`${visualizationTitle}VisualizationPanel`}
        className={`panel-full-width ${metricVisCssClassName}`}
        grow={false}
      >
        <div>
          <EuiFlexGroup justifyContent="spaceBetween">
            <EuiFlexItem
              className={editMode ? 'mouseGrabber' : ''}
              style={{
                width: '35%',
              }}
            >
              <EuiText grow={false} className="panels-title-text">
                <EuiToolTip delay="long" position="top" content={visualizationTitle}>
                  <h5 data-test-subj="visualizationHeader">{visualizationTitle}</h5>
                </EuiToolTip>
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false} className="visualization-action-button">
              {editMode ? (
                <EuiIcon
                  data-test-subj="removeVisualizationButton"
                  type="crossInACircleFilled"
                  onClick={() => {
                    removeVisualization(visualizationId);
                  }}
                />
              ) : (
                <EuiPopover
                  button={
                    <EuiSmallButtonIcon
                      aria-label="actionMenuButton"
                      iconType="boxesHorizontal"
                      onClick={onActionsMenuClick}
                    />
                  }
                  isOpen={isPopoverOpen}
                  closePopover={closeActionsMenu}
                  anchorPosition="downLeft"
                >
                  <EuiContextMenuPanel
                    items={popoverPanel}
                    data-test-subj="panelViz__popoverPanel"
                  />
                </EuiPopover>
              )}
            </EuiFlexItem>
          </EuiFlexGroup>
          {inlineEditor}
        </div>
        {memoisedVisualizationBox}
      </EuiPanel>
      {isModalVisible && modalContent}
    </>
  );
};
