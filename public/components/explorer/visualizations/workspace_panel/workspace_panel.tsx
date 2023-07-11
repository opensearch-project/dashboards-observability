/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import { uniqueId, find } from 'lodash';
import { WorkspacePanelWrapper } from './workspace_panel_wrapper';
import { Bar } from '../../../visualizations/charts/bar';
import { Line } from '../../../visualizations/charts/line';
import { HorizontalBar } from '../../../visualizations/charts/horizontal_bar';
import { EmptyPlaceholder } from '../shared_components/empty_placeholder';
import SavedObjects from '../../../../services/saved_objects/event_analytics/saved_objects';
import { EuiComboBoxOptionOption, EuiIcon } from '@elastic/eui';

const plotlySharedlayout = {
  showlegend: true,
  margin: {
    l: 50,
    r: 10,
    b: 30,
    t: 30,
    pad: 0,
  },
  height: 500,
  legend: {
    orientation: 'v',
    traceorder: 'normal',
  }
};

const plotlySharedConfig = {
  displaylogo: false,
  responsive: true
};

interface IWorkSpacePanel {
  curVisId: string;
  setCurVisId: any;
  visualizations: any;
  savedObjects: SavedObjects;
  onSaveVisualization: any;
  getSavedObjects: any;
}

export function WorkspacePanel({
  curVisId,
  setCurVisId,
  visualizations
}: IWorkSpacePanel) {

  const memorizedVisualizationTypes = useMemo(() => {
    return ([
      {
        id: 'bar',
        label: 'Bar',
        fullLabel: 'Bar',
        icontype: 'visBarVerticalStacked',
        visualizationId: uniqueId('vis-bar-'),
        selection: {
          dataLoss: 'nothing'
        },
        chart: (!visualizations || !visualizations.data) ? 
        <EmptyPlaceholder
          icon="visBarVerticalStacked"
        /> : <Bar 
          visualizations={ visualizations }
          barConfig={ plotlySharedConfig }
          layoutConfig={ plotlySharedlayout }
        />
      },
      {
        id: 'horizontal_bar',
        label: 'H. Bar',
        fullLabel: 'H. Bar',
        icontype: 'visBarHorizontalStacked',
        visualizationId: uniqueId('vis-horizontal-bar-'),
        selection: {
          dataLoss: 'nothing'
        },
        chart: (!visualizations || !visualizations.data) ? 
        <EmptyPlaceholder
          icon="visBarHorizontalStacked"
        /> : <HorizontalBar
          visualizations={ visualizations }
          layoutConfig={ plotlySharedlayout }
          horizontalConfig={ plotlySharedConfig }
        />
      },
      {
        id: 'line',
        label: 'Line',
        fullLabel: 'Line',
        icontype: 'visLine',
        visualizationId: uniqueId('vis-line-'),
        selection: {
          dataLoss: 'nothing'
        },
        chart: (!visualizations || !visualizations.data) ? 
        <EmptyPlaceholder
          icon="visLine"
        /> : <Line
          visualizations={ visualizations }
          layoutConfig={ plotlySharedlayout }
          lineConfig={ plotlySharedConfig }
        />
      }
    ]);
  }, [
    curVisId,
    visualizations
  ]);

  const [savePanelName, setSavePanelName] = useState<string>('');

  function onDrop() {}
  
  const getCurChart = () => {
    return find(memorizedVisualizationTypes, (v) => {
      return v.id === curVisId;
    });
  }

  const vizSelectableItemRenderer = (option: EuiComboBoxOptionOption<any>) => {
    const { icontype = 'empty', label = '' } = option;

    return (
      <div className="configPanel__vizSelector-item">
        <EuiIcon className="visSwitcher" type={icontype} size="m" />
        &nbsp;&nbsp;
        <span>{label}</span>
      </div>
    );
  };

  const getSelectedVisById = useCallback(
    (visId) => {
      const selectedOption = find(memorizedVisualizationTypes, (v) => {
        return v.id === visId;
      });
      selectedOption.iconType = selectedOption.icontype;
      return selectedOption;
    },
    [memorizedVisualizationTypes]
  );
  
  function renderVisualization() {
    return getCurChart()?.chart;
  }

  return (
    <WorkspacePanelWrapper
      title={''}
      emptyExpression={true}
      setVis={ setCurVisId }
      vis={ getCurChart() }
      visualizationTypes={ memorizedVisualizationTypes }
      handleSavePanelNameChange={ (name: string) => {
        setSavePanelName(name) 
      } }
      savePanelName={ savePanelName }
      getSelectedVisById={getSelectedVisById}
      vizSelectableItemRenderer={vizSelectableItemRenderer}
      curVisId={curVisId}
    >
      { renderVisualization() }
    </WorkspacePanelWrapper>
  );
}