/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useContext } from 'react';
import { batch, useDispatch } from 'react-redux';
import { isEmpty } from 'lodash';
import { EuiTitle, EuiSpacer, EuiFieldSearch, EuiAccordion, EuiHorizontalRule } from '@elastic/eui';
import { I18nProvider } from '@osd/i18n/react';
import { Field } from './field';
import { ExplorerFields, IExplorerFields, IField } from '../../../../../common/types/explorer';
import { AVAILABLE_FIELDS, SELECTED_FIELDS } from '../../../../../common/constants/explorer';
import { sortFields, updateFields } from '../../redux/slices/field_slice';
import { TabContext } from '../../hooks/use_tab_context';

interface ISidebarProps {
  query: string;
  explorerFields: IExplorerFields;
  explorerData: any;
  selectedPattern: string;
  isOverridingPattern: boolean;
  selectedTimestamp: string;
  isOverridingTimestamp: boolean;
  isFieldToggleButtonDisabled: boolean;
  handleOverridePattern: (pattern: IField) => void;
  handleOverrideTimestamp: (timestamp: IField) => void;
}

export const Sidebar = (props: ISidebarProps) => {
  const {
    query,
    explorerFields,
    explorerData,
    selectedPattern,
    isOverridingPattern,
    selectedTimestamp,
    isOverridingTimestamp,
    isFieldToggleButtonDisabled,
    handleOverridePattern,
    handleOverrideTimestamp,
  } = props;

  const dispatch = useDispatch();
  const { tabId } = useContext<any>(TabContext);
  const [showFields, setShowFields] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  /**
   * Toggle fields between selected and unselected sets
   * @param fieldState all fields in store
   * @param field field to be toggled
   * @param FieldSetToRemove the set where this field to be removed from
   * @param FieldSetToAdd the set where this field to be added to
   * returns new fields state
   */
  const toggleFields = (
    fieldState: ExplorerFields,
    field: IField,
    fieldSetToRemove: string,
    fieldSetToAdd: string
  ): ExplorerFields => {
    const nextFields = { ...fieldState };
    nextFields[fieldSetToRemove] = nextFields[fieldSetToRemove].filter(
      (fd: IField) => fd.name !== field.name
    );
    nextFields[fieldSetToAdd] = [...nextFields[fieldSetToAdd], field];
    return nextFields;
  };

  const updateStoreFields = (fieldsData: ExplorerFields, tabID: string, modifiedField: string) => {
    batch(() => {
      dispatch(
        updateFields({
          tabId: tabID,
          data: {
            ...fieldsData,
          },
        })
      );
      dispatch(
        sortFields({
          tabId: tabID,
          data: [modifiedField],
        })
      );
    });
  };

  const handleAddField = useCallback(
    (field: IField) => {
      updateStoreFields(
        toggleFields(explorerFields, field, AVAILABLE_FIELDS, SELECTED_FIELDS),
        tabId,
        SELECTED_FIELDS
      );
    },
    [explorerFields, tabId]
  );

  const handleRemoveField = useCallback(
    (field: IField) => {
      updateStoreFields(
        toggleFields(explorerFields, field, SELECTED_FIELDS, AVAILABLE_FIELDS),
        tabId,
        AVAILABLE_FIELDS
      );
    },
    [explorerFields, tabId]
  );

  return (
    <I18nProvider>
      <section className="sidebar-list">
        <div className="dscSidebar__item">
          <EuiFieldSearch
            compressed
            fullWidth
            onChange={(e) => {
              setSearchTerm(e.target.value);
            }}
            placeholder="Search field names"
            value={searchTerm}
            data-test-subj="eventExplorer__sidebarSearch"
          />
        </div>
        <EuiSpacer size="s" />
        <div className="sidebar-list">
          {((explorerData && !isEmpty(explorerData.jsonData) && !isEmpty(explorerFields)) ||
            !isEmpty(explorerFields.availableFields)) && (
            <>
              {explorerFields?.queriedFields && explorerFields.queriedFields?.length > 0 && (
                <EuiAccordion
                  initialIsOpen
                  id="fieldSelector__queriedFields"
                  buttonContent={
                    <EuiTitle size="xxs">
                      <span>Query fields</span>
                    </EuiTitle>
                  }
                  paddingSize="xs"
                >
                <EuiHorizontalRule margin ='xs' />
                  <ul
                    className="dscSidebarList dscFieldList--selected"
                    aria-labelledby="queried_fields"
                    data-test-subj={`fieldList-selected`}
                  >
                    {explorerFields.queriedFields &&
                      explorerFields.queriedFields.map((field) => {
                        return (
                          <li
                            key={`field${field.name}`}
                            data-attr-field={field.name}
                            className="dscSidebar__item sidebar_content"
                          >
                            <Field
                              query={query}
                              field={field}
                              selectedPattern={selectedPattern}
                              isOverridingPattern={isOverridingPattern}
                              handleOverridePattern={handleOverridePattern}
                              isOverridingTimestamp={isOverridingTimestamp}
                              selectedTimestamp={selectedTimestamp}
                              handleOverrideTimestamp={handleOverrideTimestamp}
                              selected={true}
                              isFieldToggleButtonDisabled={true}
                              showTimestampOverrideButton={false}
                              onToggleField={handleRemoveField}
                            />
                          </li>
                        );
                      })}
                  </ul>
                </EuiAccordion>
              )}
              <EuiSpacer size="s" />
              <EuiAccordion
                initialIsOpen
                id="fieldSelector__selectedFields"
                buttonContent={
                  <EuiTitle size="xxs">
                    <span>Selected Fields</span>
                  </EuiTitle>
                }
                paddingSize="xs"
              >
                <EuiHorizontalRule margin ='xs' />
                <ul
                  className="dscSidebarList dscFieldList--selected"
                  aria-labelledby="selected_fields"
                  data-test-subj={`fieldList-selected`}
                >
                  {explorerData &&
                    !isEmpty(explorerData.jsonData) &&
                    explorerFields.selectedFields &&
                    explorerFields.selectedFields.map((field) => {
                      return (
                        <li
                          key={`field${field.name}`}
                          data-attr-field={field.name}
                            className="dscSidebar__item sidebar_content"
                        >
                          <Field
                            query={query}
                            field={field}
                            selectedPattern={selectedPattern}
                            isOverridingPattern={isOverridingPattern}
                            handleOverridePattern={handleOverridePattern}
                            selectedTimestamp={selectedTimestamp}
                            isOverridingTimestamp={isOverridingTimestamp}
                            handleOverrideTimestamp={handleOverrideTimestamp}
                            selected={true}
                            isFieldToggleButtonDisabled={isFieldToggleButtonDisabled}
                            showTimestampOverrideButton={true}
                            onToggleField={handleRemoveField}
                          />
                        </li>
                      );
                    })}
                </ul>
              </EuiAccordion>
              <EuiSpacer size="s" />
              <EuiAccordion
                initialIsOpen
                id="fieldSelector__availableFields"
                buttonContent={
                  <EuiTitle size="xxs">
                    <span>Available Fields</span>
                  </EuiTitle>
                }
                paddingSize="xs"
              >
                <EuiHorizontalRule margin ='xs' />
                <ul
                  className={`dscFieldList dscFieldList--unpopular ${
                    !showFields ? 'hidden-sm hidden-xs' : ''
                  }`}
                  aria-labelledby="available_fields"
                  data-test-subj={`fieldList-unpopular`}
                >
                  {explorerFields.availableFields &&
                    explorerFields.availableFields
                      .filter((field) => searchTerm === '' || field.name.indexOf(searchTerm) !== -1)
                      .map((field) => {
                        return (
                          <li
                            key={`field${field.name}`}
                            data-attr-field={field.name}
                            className="dscSidebar__item sidebar_content"
                          >
                            <Field
                              query={query}
                              field={field}
                              selectedPattern={selectedPattern}
                              isOverridingPattern={isOverridingPattern}
                              handleOverridePattern={handleOverridePattern}
                              selectedTimestamp={selectedTimestamp}
                              isOverridingTimestamp={isOverridingTimestamp}
                              handleOverrideTimestamp={handleOverrideTimestamp}
                              onToggleField={handleAddField}
                              selected={false}
                              isFieldToggleButtonDisabled={isFieldToggleButtonDisabled}
                              showTimestampOverrideButton={true}
                            />
                          </li>
                        );
                      })}
                </ul>
              </EuiAccordion>
            </>
          )}
        </div>
      </section>
    </I18nProvider>
  );
};
