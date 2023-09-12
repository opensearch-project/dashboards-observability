/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiHorizontalRule,
  htmlIdGenerator,
  EuiRadioGroup,
  EuiComboBox,
} from '@elastic/eui';
import _ from 'lodash';
import React, { useEffect, useState } from 'react';
import { EuiPanel } from '@elastic/eui';
import { render } from 'mustache';
import { OPENSEARCH_DOCUMENTATION_URL } from '../../../../common/constants/data_connections';
import { AccessControlCallout } from './access_control_callout';
import { coreRefs } from '../../../../public/framework/core_refs';

const idPrefix = htmlIdGenerator()();

export const AccessControlTab = () => {
  const [mode, setMode] = useState<'view' | 'edit'>('edit');
  const [roles, setRoles] = useState<Array<{ label: string }>>([]);

  useEffect(() => {
    coreRefs.http!.get('/api/v1/configuration/roles').then((data) =>
      setRoles(
        Object.keys(data.data).map((key) => {
          return { label: key };
        })
      )
    );
  }, []);

  const radios = [
    {
      id: `${idPrefix}0`,
      label: 'Restricted - accessible by users with specific OpenSearch roles',
    },
    {
      id: `${idPrefix}1`,
      label: 'Everyone - accessible by all users on this cluster',
    },
  ];

  const [radioIdSelected, setRadioIdSelected] = useState(`${idPrefix}1`);

  const onChange = (optionId) => {
    setRadioIdSelected(optionId);
  };

  const renderViewAccessControlDetails = () => {
    return (
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiFlexGroup direction="column">
            <EuiFlexItem grow={false}>
              <EuiText className="overview-title">Query access</EuiText>
              <EuiText size="s" className="overview-content">
                {'-'}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFlexGroup direction="column">
            <EuiFlexItem grow={false}>
              <EuiText className="overview-title">Acceleration permissions</EuiText>
              <EuiText size="s" className="overview-content">
                {'-'}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  const renderEditAccessControlDetails = () => {
    return (
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiFlexGroup direction="row">
            <EuiFlexItem>
              <EuiText className="overview-title">Query Permissions</EuiText>
              <EuiText size="s" className="overview-content">
                Control which OpenSearch roles have query permissions on this data source.{' '}
                <EuiLink external={true} href={OPENSEARCH_DOCUMENTATION_URL} target="_blank">
                  Learn more
                </EuiLink>
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiRadioGroup
                options={radios}
                idSelected={radioIdSelected}
                onChange={(id) => onChange(id)}
                name="radio group"
                legend={{
                  children: <span>Access level</span>,
                }}
              />
              {radioIdSelected === `${idPrefix}0` ? (
                <EuiComboBox
                  placeholder="Select or create options"
                  options={roles}
                  selectedOptions={[]}
                  onChange={onChange}
                  onCreateOption={() => {}}
                  isClearable={true}
                  data-test-subj="demoComboBox"
                  autoFocus
                />
              ) : (
                <></>
              )}
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  return (
    <>
      <EuiSpacer />
      <AccessControlCallout />
      <EuiSpacer />
      <EuiPanel>
        <EuiFlexGroup direction="row">
          <EuiFlexItem>
            <EuiText size="m">
              <h2 className="panel-title">Access Control</h2>
              Control which OpenSearch users have access to this data source.
            </EuiText>
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <EuiButton
              data-test-subj="createButton"
              onClick={
                mode === 'edit'
                  ? () => {
                      setMode('view');
                    }
                  : () => {
                      setMode('edit');
                    }
              }
              fill={mode === 'edit' ? true : false}
            >
              {mode === 'edit' ? 'Edit' : 'View'}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiHorizontalRule />
        {mode === 'edit' ? renderViewAccessControlDetails() : renderEditAccessControlDetails()}
      </EuiPanel>
    </>
  );
};
