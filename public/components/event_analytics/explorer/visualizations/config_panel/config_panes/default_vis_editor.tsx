/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiForm, EuiCompressedFormRow } from '@elastic/eui';
import { ConfigPanelOptions } from './config_controls';

export const VizDataPanel = ({ visualizations, onConfigChange, vizState = {}, tabProps }: any) => {
  const handleConfigEditing = (stateFieldName) => {
    return (changes) => {
      onConfigChange({
        ...vizState,
        [stateFieldName]: changes,
      });
    };
  };

  const dynamicContent = tabProps.sections.map((section) => {
    const Editor = section.editor;
    return (
      <EuiCompressedFormRow key={section.id} fullWidth>
        <Editor
          visualizations={visualizations}
          schemas={section.schemas}
          handleConfigChange={handleConfigEditing(section.mapTo)}
          vizState={vizState[section.mapTo] || section.defaultState || {}}
          sectionName={section.name}
          sectionId={section.id}
          props={section.props || {}}
        />
      </EuiCompressedFormRow>
    );
  });

  return (
    <div className="visEditorSidebar__config">
      <EuiForm className="visEditorSidebar__form">
        <EuiCompressedFormRow>
          <ConfigPanelOptions
            vizState={vizState?.panelOptions}
            visualizations={visualizations}
            handleConfigChange={handleConfigEditing('panelOptions')}
          />
        </EuiCompressedFormRow>
        {dynamicContent}
      </EuiForm>
    </div>
  );
};
