/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiButtonIcon,
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
import React, { useEffect, useMemo, useState } from 'react';
import _ from 'lodash';
import { integer } from '@opensearch-project/opensearch/api/types';
import {
  getVisualization,
  pplServiceRequestor,
} from '../../../../../public/components/metrics/helpers/utils';
import { CoreStart } from '../../../../../../../src/core/public';
import PPLService from '../../../../services/requests/ppl';
import {
  displayVisualization,
  renderCatalogVisualization,
  renderSavedVisualization,
} from '../../helpers/utils';
import './visualization_container.scss';
import { VizContainerError } from '../../../../../common/types/custom_panels';

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
  spanParam?: integer;
  resolutionValue?: string;
  metricsPanel?: boolean;
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
  resolutionValue,
  metricsPanel,
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

  const [dimensions, setDimensions] = useState();
  const [queryDimensions, setQueryDimensions] = useState([]);
  const [queryAggregation, setQueryAggregation] = useState('avg()');

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
            <EuiButton onClick={closeModal} fill>
              Close
            </EuiButton>
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
            <EuiButton onClick={closeModal} fill>
              Close
            </EuiButton>
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
        onEditClick(savedVisualizationId);
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

  const showModelPanel = [
    <EuiContextMenuItem
      data-test-subj="showCatalogPPLQuery"
      key="view_query"
      disabled={editMode}
      onClick={() => {
        closeActionsMenu();
        showModal('catalogModal');
      }}
    >
      View query
    </EuiContextMenuItem>,
  ];

  if (usedInNotebooks) {
    popoverPanel = catalogVisualization ? [showModelPanel] : [popoverPanel[0]];
  }

  useEffect(() => {
    getMetricsFunctions();
  }, []);

  const getMetricsFunctions = async () => {
    if (metricsPanel) {
      if (catalogVisualization) {
        const catalogData = await pplServiceRequestor(
          pplService,
          `describe ${savedVisualizationId}`
        );
        console.log('catalogData', catalogData);
        const attributes = catalogData.data.COLUMN_NAME.reduce(
          (acc: Array<{ label: string; name: string }>, column: string) => {
            if (!column.includes('@')) {
              acc.push({ label: column, name: column });
            }
            console.log('acc', acc);
            return acc;
          },
          []
        );
        console.log('attributes', attributes);
        setDimensions(attributes || []);
        //   } else {
        //   const savedVisualization = await getVisualization(http, savedVisualizationId);
        //   const pplResponse = await pplServiceRequestor(
        //     pplService,
        //     savedVisualization.visualization.query.split('|')[0]
        //   );
        //   setDimensions(
        //     pplResponse.metadata.fields.map((row: any) => ({
        //       label: row.name,
        //     }))
        //   );
      }
    }
  };

  // useEffect(() => {
  //   console.log('blah blah dimensions: ', dimensions);
  // }, [dimensions]);

  const loadVisaulization = async () => {
    console.log('blah blah dimensions: ', dimensions);
    if (catalogVisualization)
      await renderCatalogVisualization(
        http,
        pplService,
        savedVisualizationId,
        fromTime,
        toTime,
        pplFilterValue,
        setVisualizationTitle,
        setVisualizationType,
        setVisualizationData,
        setVisualizationMetaData,
        setIsLoading,
        setIsError,
        spanParam,
        resolutionValue,
        dimensions
      );
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
        setIsError
      );
  };

  const memoisedVisualizationBox = useMemo(
    () => (
      <div className="visualization-div">
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
    // console.log('dimensions in useEffect', dimensions);
    // console.log('typeof dimensions: ', typeof dimensions);
  }, [onRefresh, dimensions]);

  return (
    <>
      <EuiPanel
        data-test-subj={`${visualizationTitle}VisualizationPanel`}
        className="panel-full-width"
        grow={false}
      >
        <div className={editMode ? 'mouseGrabber' : ''}>
          <EuiFlexGroup justifyContent="spaceBetween">
            <EuiFlexItem
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
                  <EuiContextMenuPanel
                    items={popoverPanel}
                    data-test-subj="panelViz__popoverPanel"
                  />
                </EuiPopover>
              )}
            </EuiFlexItem>
          </EuiFlexGroup>
        </div>
        {memoisedVisualizationBox}
      </EuiPanel>
      {isModalVisible && modalContent}
    </>
  );
};
