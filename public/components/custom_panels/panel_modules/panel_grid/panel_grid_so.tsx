/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import forEach from 'lodash/forEach';
import reject from 'lodash/reject';
import omit from 'lodash/omit';
import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Layout, Responsive, WidthProvider } from 'react-grid-layout';
import useObservable from 'react-use/lib/useObservable';
import { CoreStart } from '../../../../../../../src/core/public';
import { VisualizationContainer } from '../visualization_container';
import { VisualizationType } from '../../../../../common/types/custom_panels';
import './panel_grid.scss';
import { mergeLayoutAndVisualizations } from '../../helpers/utils';
import { coreRefs } from '../../../../framework/core_refs';
import { selectPanel } from '../../redux/panel_slice';

// HOC container to provide dynamic width for Grid layout
const ResponsiveGridLayout = WidthProvider(Responsive);

/*
 * PanelGrid - This module is places all visualizations in react-grid-layout
 *
 * Props taken in as params are:
 * chrome: chrome core service;
 * panelId: OpenPanel Id
 * updateAvailabilityVizId: function to update application if availabilityViz is removed from panel
 * panelVisualizations: list of panel visualizations
 * setPanelVisualizations: function to set panel visualizations
 * editMode: boolean to check if the panel is in edit mode
 * startTime: start time in date filter
 * endTime: end time in date filter
 * onRefresh: boolean value to trigger refresh of visualizations
 * cloneVisualization: function to clone a visualization in panel
 * pplFilterValue: string with panel PPL filter value
 * showFlyout: function to show the flyout
 * editActionType: Type of action done while clicking the edit button
 */

interface PanelGridProps {
  chrome: CoreStart['chrome'];
  panelId: string;
  updateAvailabilityVizId?: any;
  panelVisualizations: VisualizationType[];
  setPanelVisualizations: React.Dispatch<React.SetStateAction<VisualizationType[]>>;
  editMode: boolean;
  startTime: string;
  endTime: string;
  onEditClick: (savedVisualizationId: string) => any;
  onRefresh: boolean;
  cloneVisualization: (visualzationTitle: string, savedVisualizationId: string) => void;
  pplFilterValue: string;
  showFlyout: (isReplacement?: boolean | undefined, replaceVizId?: string | undefined) => void;
  editActionType: string;
  setEditVizId?: any;
}

export const PanelGridSO = (props: PanelGridProps) => {
  const {
    chrome,
    panelId,
    updateAvailabilityVizId,
    panelVisualizations,
    setPanelVisualizations,
    editMode,
    startTime,
    endTime,
    onEditClick,
    onRefresh,
    cloneVisualization,
    pplFilterValue,
    showFlyout,
    editActionType,
  } = props;

  const panel = useSelector(selectPanel);
  const [currentLayout, setCurrentLayout] = useState<Layout[]>([]);
  const [postEditLayout, setPostEditLayout] = useState<Layout[]>([]);
  const [gridData, setGridData] = useState(panelVisualizations.map(() => <></>));
  const isLocked = useObservable(chrome.getIsNavDrawerLocked$());

  // Reset Size of Visualizations when layout is changed
  const layoutChanged = (currLayouts: Layout[]) => {
    window.dispatchEvent(new Event('resize'));
    setPostEditLayout(currLayouts);
  };

  const loadVizComponents = () => {
    const gridDataComps = panelVisualizations.map((panelVisualization: VisualizationType) => (
      <VisualizationContainer
        key={panelVisualization.id}
        http={coreRefs.http!}
        editMode={editMode}
        visualizationId={panelVisualization.id}
        savedVisualizationId={panelVisualization.savedVisualizationId}
        pplService={coreRefs.pplService!}
        fromTime={startTime}
        toTime={endTime}
        onRefresh={onRefresh}
        onEditClick={onEditClick}
        cloneVisualization={cloneVisualization}
        pplFilterValue={pplFilterValue}
        showFlyout={showFlyout}
        removeVisualization={removeVisualization}
        contextMenuId="visualization"
        metricType={panelVisualization?.metricType || ''}
        panelVisualization={panelVisualization}
      />
    ));
    setGridData(gridDataComps);
  };

  // Reload the Layout
  const reloadLayout = () => {
    const tempLayout: Layout[] = panelVisualizations.map((panelVisualization) => {
      return {
        i: panelVisualization.id,
        x: panelVisualization.x,
        y: panelVisualization.y,
        w: panelVisualization.w,
        h: panelVisualization.h,
        static: !editMode,
      } as Layout;
    });
    setCurrentLayout(tempLayout);
  };

  // remove visualization from panel in edit mode
  const removeVisualization = (visualizationId: string) => {
    const newVisualizationList = reject(panelVisualizations, {
      id: visualizationId,
    });
    mergeLayoutAndVisualizations(postEditLayout, newVisualizationList, setPanelVisualizations);
  };

  const updateLayout = (visualizations, newLayouts) => {
    const newVisualizations = [];
    forEach(visualizations, (viz) => {
      let newviz = { ...viz };
      forEach(newLayouts, (nwlyt) => {
        if (viz.id === nwlyt.i) {
          newviz = {
            ...newviz,
            ...nwlyt,
          };
          return;
        }
      });
      newVisualizations.push({ ...newviz });
    });
    return newVisualizations;
  };

  // Save Visualization Layouts when not in edit mode anymore (after users saves the panel)
  const saveVisualizationLayouts = async (panelID: string, visualizationParams: any) => {
    const newVisualizations = updateLayout(panel.visualizations, visualizationParams);
    const updateRes = await coreRefs.savedObjectsClient?.update('observability-panel', panelID, {
      ...panel,
      visualizations: newVisualizations,
    });
    setPanelVisualizations(updateRes?.attributes?.visualizations || []);
  };

  // Update layout whenever user edit gets completed
  useEffect(() => {
    if (editMode) {
      reloadLayout();
      loadVizComponents();
    }
  }, [editMode]);

  useEffect(() => {
    if (editActionType === 'save') {
      const visualizationParams = postEditLayout.map((layout) =>
        omit(layout, ['static', 'moved'])
      );
      saveVisualizationLayouts(panelId, visualizationParams);
      if (updateAvailabilityVizId) {
        updateAvailabilityVizId(panelVisualizations);
      }
    }
  }, [editActionType]);

  // Update layout whenever visualizations are updated
  useEffect(() => {
    reloadLayout();
    loadVizComponents();
  }, [panelVisualizations]);

  // Reset Size of Panel Grid when Nav Dock is Locked
  useEffect(() => {
    setTimeout(function () {
      window.dispatchEvent(new Event('resize'));
    }, 300);
  }, [isLocked]);

  useEffect(() => {
    loadVizComponents();
  }, [onRefresh]);

  useEffect(() => {
    loadVizComponents();
  }, []);

  return (
    <ResponsiveGridLayout
      layouts={{ lg: currentLayout, md: currentLayout, sm: currentLayout }}
      className="layout full-width"
      breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
      cols={{ lg: 12, md: 12, sm: 12, xs: 1, xxs: 1 }}
      onLayoutChange={layoutChanged}
      draggableHandle=".mouseGrabber"
    >
      {panelVisualizations.map((panelVisualization: VisualizationType, index) => (
        <div key={panelVisualization.id}>{gridData[index]}</div>
      ))}
    </ResponsiveGridLayout>
  );
};
