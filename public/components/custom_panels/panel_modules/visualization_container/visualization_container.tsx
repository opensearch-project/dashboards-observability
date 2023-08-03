/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiButtonIcon,
  EuiCodeBlock,
  EuiExpression,
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
  EuiContextMenu,
} from '@elastic/eui';
import React, { useEffect, useMemo, useState } from 'react';
import _ from 'lodash';
import { useSelector } from 'react-redux';
import { CoreStart } from '../../../../../../../src/core/public';
import PPLService from '../../../../services/requests/ppl';
import {
  displayVisualization,
  renderCatalogVisualization,
  renderSavedVisualization,
} from '../../helpers/utils';
import './visualization_container.scss';
import { VizContainerError } from '../../../../../common/types/custom_panels';
import { MetricType } from '../../../../../common/types/metrics';
import { MetricsEditInline } from '../../../metrics/sidebar/metrics_edit_inline';
import { metricQuerySelector } from '../../../metrics/redux/slices/metrics_slice';

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
  http: CoreStart['http'];
  editMode: boolean;
  visualizationId: string;
  savedVisualizationId: string;
  pplService: PPLService;
  fromTime: string;
  toTime: string;
  onRefresh: boolean;
  pplFilterValue: string;
  usedInNotebooks?: boolean;
  onEditClick: (savedVisualizationId: string) => any;
  cloneVisualization?: (visualzationTitle: string, savedVisualizationId: string) => void;
  showFlyout?: (isReplacement?: boolean | undefined, replaceVizId?: string | undefined) => void;
  removeVisualization?: (visualizationId: string) => void;
  catalogVisualization?: boolean;
  spanParam?: string;
  contextMenuId: 'visualization' | 'notebook' | 'metrics';
}

export const VisualizationContainer = ({
  http,
  editMode,
  visualizationId,
  savedVisualizationId,
  pplService,
  fromTime,
  toTime,
  onRefresh,
  pplFilterValue,
  usedInNotebooks,
  onEditClick,
  cloneVisualization,
  showFlyout,
  removeVisualization,
  catalogVisualization,
  spanParam,
  contextMenuId,
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

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState(<></>);

  const queryMetaData = useSelector(metricQuerySelector(visualizationId));
  const closeModal = () => setIsModalVisible(false);

  function flattenPanelTree(tree, array = []) {
    array.push(tree);

    if (tree.items) {
      tree.items.forEach((item) => {
        if (item.panel) {
          flattenPanelTree(item.panel, array);
          item.panel = item.panel.id;
        }
      });
    }

    return array;
  }

  const showErrorModal = () => {
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
          <EuiButton onClick={closeModal} fill>
            Close
          </EuiButton>
        </EuiModalFooter>
      </EuiModal>
    );

    setIsModalVisible(true);
  };
  const showQueryModal = () => {
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
          <EuiButton onClick={closeModal} fill>
            Close
          </EuiButton>
        </EuiModalFooter>
      </EuiModal>
    );

    setIsModalVisible(true);
  };

  const menuItems = {
    visualization: flattenPanelTree({
      id: 0,
      name: 'Visualization Options',
      items: [
        {
          name: 'Edit',
          disabled: editMode,

          onClick: () => {
            closeActionsMenu();
            onEditClick(savedVisualizationId);
          },
        },
        {
          name: 'Replace',
          disabled: editMode,
          onClick: () => {
            closeActionsMenu();
            showFlyout(true, visualizationId);
          },
        },
        {
          name: 'Duplicate',
          disabled: editMode,
          onClick: () => {
            closeActionsMenu();
            cloneVisualization(visualizationTitle, savedVisualizationId);
          },
        },
      ],
    }),

    notebook: flattenPanelTree({
      id: 1,
      name: 'Notebook Options',
      items: [
        {
          name: 'View Query',
          disabled: editMode,
          onClick: () => {
            closeActionsMenu();
            showQueryModal();
          },
        },
      ],
    }),

    metric1: flattenPanelTree({
      id: 0,
      name: 'Example Panel',

      items: [
        {
          name: 'Show full screen',
          icon: <EuiIcon type="search" size="m" />,
          onClick: () => {
            closeActionsMenu();
          },
        },
      ],
    }),

    metrics: flattenPanelTree({
      id: 0,
      name: 'Metric Options',
      items: [
        {
          name: 'View Query',
          disabled: editMode,
          onClick: () => {
            closeActionsMenu();
            showQueryModal();
          },
        },
        {
          name: 'Configure Metric',
          disabled: editMode,
          panel: {
            id: 2,
            width: 200,
            title: 'Configure Metric',
            content: metricsEditPanel,
          },
        },
      ],
    }),
  };

  const loadVisaulization = async () => {
    if (catalogVisualization)
      await renderCatalogVisualization({
        http,
        pplService,
        catalogSource: savedVisualizationId,
        startTime: fromTime,
        endTime: toTime,
        filterQuery: pplFilterValue,
        spanParam,
        setVisualizationTitle,
        setVisualizationType,
        setVisualizationData,
        setVisualizationMetaData,
        setIsLoading,
        setIsError,
        queryMetaData,
      });
    else
      await renderSavedVisualization(
        http,
        pplService,
        savedVisualizationId,
        fromTime,
        toTime,
        pplFilterValue,
        spanParam,
        setVisualizationTitle,
        setVisualizationType,
        setVisualizationData,
        setVisualizationMetaData,
        setIsLoading,
        setIsError,
      );
  };

  const metricVisCss = metricMetaData ? 'metricVis' : '';

  const memoisedVisualizationBox = useMemo(
    () => (
      <div>
      <div className={`visualization-div ${metricVisCss}`}>
        {isLoading ? (
          <EuiLoadingChart size="xl" mono className="visualization-loading-chart" />
        ) : !_.isEmpty(isError) ? (
          <div className="visualization-error-div">
            <EuiIcon type="alert" color="danger" size="s" />
            <EuiSpacer size="s" />
            <EuiText size="s">
              <p>{isError.errorMessage}</p>
            </EuiText>
            {isError.hasOwnProperty('errorDetails') && isError.errorDetails !== '' ? (
              <EuiButton className="viz-error-btn" color="danger" onClick={showErrorModal} size="s">
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
  }, [onRefresh, queryMetaData]);

  const metricVisCss = catalogVisualization ? 'metricVis' : '';

  return (
    <>
      <EuiPanel
        data-test-subj={`${visualizationTitle}VisualizationPanel`}
        className={`panel-full-width visualization-div ${metricVisCss}`}
        grow={false}
      >
        <div className={editMode ? 'mouseGrabber' : ''}>
          <EuiFlexGroup justifyContent="spaceBetween">
            <EuiFlexItem grow={false}>
              <EuiText grow={false} className="panels-title-text">
                <EuiToolTip delay="long" position="top" content={visualizationTitle}>
                  <h5 data-test-subj="visualizationHeader">{visualizationTitle}</h5>
                </EuiToolTip>
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <MetricsEditInline
                visualizationData={visualizationData}
                metricMetaData={metricMetaData}
                updateMetricConfig={updateMetricConfig}
              />
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
                    <EuiButtonIcon
                      aria-label="actionMenuButton"
                      iconType="boxesHorizontal"
                      onClick={onActionsMenuClick}
                    />
                  }
                  isOpen={isPopoverOpen}
                  closePopover={closeActionsMenu}
                  anchorPosition="downLeft"
                >
                  <EuiContextMenu panels={menuItems[contextMenuId]} initialPanelId={0} />
                </EuiPopover>
              )}
            </EuiFlexItem>
          </EuiFlexGroup>
          {catalogVisualization && <MetricsEditInline visualizationId={visualizationId} />}
        </div>
        {memoisedVisualizationBox}
      </EuiPanel>
      {isModalVisible && modalContent}
    </>
  );
};
