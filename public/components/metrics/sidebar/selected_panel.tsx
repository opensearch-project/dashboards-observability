/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useSelector } from 'react-redux';
import { useState } from 'react';
import { EuiForm, OuiAvatar } from '@elastic/eui';
import { useCallback } from 'react';
import { useEffect } from 'react';
import { mapMetricsToSelectedPanel } from './metrics_to_dropbox';
import { selectedMetricsSelector } from '../redux/slices/metrics_slice';
import { mapSchemaToAggPanel } from '../../../../../../src/plugins/vis_builder/public/application/components/data_tab/schema_to_dropbox';

export const SelectedPanel = () => {
  // const vizType = useVisualizationType();
  // const editingState = useTypedSelector(
  //   (state) => state.visualization.activeVisualization?.draftAgg
  // );
  const [editingState, setEditingState] = useState(false);

  const selectedMetrics = useSelector(selectedMetricsSelector);

  const mainPanel = useCallback(() => {
    return mapMetricsToSelectedPanel(selectedMetrics);
  }, [selectedMetrics]);

  useEffect(() => console.log(mainPanel()), [mainPanel]);

  return (
    <EuiForm className={` ${editingState ? 'showSecondary' : ''}`}>
      <div className="">{mainPanel}</div>
      {/* <EditMetricPanel /> */}
    </EuiForm>
  );
};
