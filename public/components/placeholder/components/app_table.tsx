/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiBadge,
  EuiButton,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiInMemoryTable,
  EuiLink,
  EuiLoadingSpinner,
  EuiOverlayMask,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentHeader,
  EuiPageContentHeaderSection,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiPopover,
  EuiSpacer,
  EuiTableFieldDataColumnType,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import _ from 'lodash';
import React, { ReactElement, useEffect, useState } from 'react';
import moment from 'moment';
import { useNavigate } from 'react-router-dom';
import { DeleteModal } from '../../common/helpers/delete_modal';
import { AppAnalyticsComponentDeps } from '../home';
import { getCustomModal } from '../../custom_panels/helpers/modal_containers';
import { pageStyles, UI_DATE_FORMAT } from '../../../../common/constants/shared';
import { ApplicationType, AvailabilityType } from '../../../../common/types/application_analytics';
import { Synopsis } from './integration_card';
import { navigateToDefaultApp } from '../../../../../../src/plugins/url_forwarding/public/navigate_to_default_app';

interface AppTableProps extends AppAnalyticsComponentDeps {
  loading: boolean;
  applications: ApplicationType[];
  fetchApplications: () => void;
  renameApplication: (newAppName: string, appId: string) => void;
  deleteApplication: (appList: string[], panelIdList: string[], toastMessage?: string) => void;
  clearStorage: () => void;
  moveToApp: (id: string, type: string) => void;
}

export function AppTable(props: AppTableProps) {
  const {
    chrome,
    applications,
    parentBreadcrumbs,
    fetchApplications,
    renameApplication,
    deleteApplication,
    setFilters,
    clearStorage,
    moveToApp,
  } = props;
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isActionsPopoverOpen, setIsActionsPopoverOpen] = useState(false);
  const [modalLayout, setModalLayout] = useState(<EuiOverlayMask />);
  const [selectedApplications, setSelectedApplications] = useState<ApplicationType[]>([]);
  const createButtonText = 'Create application';

  useEffect(() => {
    chrome.setBreadcrumbs([
      ...parentBreadcrumbs,
      {
        text: 'Placeholder',
        href: '#/placeholder',
      },
    ]);
    clear();
    fetchApplications();
  }, []);

  const clear = () => {
    setFilters([]);
    clearStorage();
  };

  const closeModal = () => {
    setIsModalVisible(false);
  };

  const showModal = () => {
    setIsModalVisible(true);
  };

  const onRename = async (newApplicationName: string) => {
    renameApplication(newApplicationName, selectedApplications[0].id);
    closeModal();
  };

  const onDelete = async () => {
    closeModal();
    const toastMessage = `Application${
      selectedApplications.length > 1 ? 's' : ' "' + selectedApplications[0].name + '"'
    } successfully deleted!`;
    await deleteApplication(
      selectedApplications.map((app) => app.id),
      selectedApplications.map((app) => app.panelId),
      toastMessage
    );
  };

  const renameApp = () => {
    setModalLayout(
      getCustomModal(
        onRename,
        closeModal,
        'Name',
        'Rename application',
        'Cancel',
        'Rename',
        selectedApplications[0].name
      )
    );
    showModal();
  };

  const deleteApp = () => {
    const applicationString = `application${selectedApplications.length > 1 ? 's' : ''}`;
    setModalLayout(
      <DeleteModal
        onConfirm={onDelete}
        onCancel={closeModal}
        title={`Delete ${selectedApplications.length} ${applicationString}`}
        message={`Are you sure you want to delete the selected ${selectedApplications.length} ${applicationString}?`}
      />
    );
    showModal();
  };

  const popoverButton = (
    <EuiButton
      data-test-subj="appAnalyticsActionsButton"
      iconType="arrowDown"
      iconSide="right"
      onClick={() => setIsActionsPopoverOpen(!isActionsPopoverOpen)}
    >
      Actions
    </EuiButton>
  );

  const popoverItems: ReactElement[] = [
    <EuiContextMenuItem
      key="rename"
      data-test-subj="renameApplicationContextMenuItem"
      disabled={applications.length === 0 || selectedApplications.length !== 1}
      onClick={() => {
        setIsActionsPopoverOpen(false);
        renameApp();
      }}
    >
      Rename
    </EuiContextMenuItem>,
    // <EuiContextMenuItem
    //   key="duplicate"
    //   disabled={applications.length === 0 || selectedApplications.length !== 1}
    // >
    //   Duplicate
    // </EuiContextMenuItem>,
    <EuiContextMenuItem
      key="delete"
      data-test-subj="deleteApplicationContextMenuItem"
      disabled={applications.length === 0 || selectedApplications.length === 0}
      onClick={() => {
        setIsActionsPopoverOpen(false);
        deleteApp();
      }}
    >
      Delete
    </EuiContextMenuItem>,
    // <EuiContextMenuItem key="addSample">Add sample application</EuiContextMenuItem>,
  ];

  const renderAvailability = (value: AvailabilityType, record: ApplicationType) => {
    if (value.color === 'loading') {
      return <EuiLoadingSpinner />;
    } else if (value.name) {
      return (
        <EuiBadge
          data-test-subj={`${value.name}AvailabilityBadge`}
          color={value.color || 'default'}
        >
          {value.name}
        </EuiBadge>
      );
    } else if (value.color === 'undefined') {
      return <EuiText>No match</EuiText>;
    } else if (value.color === 'null') {
      return <EuiText>-</EuiText>;
    } else {
      return (
        <EuiLink
          data-test-subj="setAvailabilityHomePageLink"
          onClick={() => moveToApp(record.id, 'createSetAvailability')}
        >
          Set Availability
        </EuiLink>
      );
    }
  };

  const tableColumns = [
    {
      field: 'name',
      name: 'Name',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiLink
          data-test-subj={`${record.name}ApplicationLink`}
          href={`#/application_analytics/${record.id}`}
        >
          {_.truncate(record.name, { length: 100 })}
        </EuiLink>
      ),
    },
    {
      field: 'composition',
      name: 'Composition',
      sortable: false,
      truncateText: true,
      render: (value, record) => (
        <EuiToolTip content={record.servicesEntities.concat(record.traceGroups).join(', ')}>
          <EuiText id="compositionColumn" data-test-subj="appAnalytics__compositionColumn">
            {record.servicesEntities.concat(record.traceGroups).join(', ')}
          </EuiText>
        </EuiToolTip>
      ),
    },
    {
      field: 'availability',
      name: 'Current Availability',
      sortable: true,
      render: renderAvailability,
    },
    {
      field: 'dateModified',
      name: 'Date Modified',
      sortable: true,
      render: (value) => <EuiText>{moment(value).format(UI_DATE_FORMAT)}</EuiText>,
    },
  ] as Array<EuiTableFieldDataColumnType<ApplicationType>>;

  const features = ['nginx', 'fluentbit'];

  return (
    <div>
      <EuiFlexGroup alignItems="center">
        <EuiFlexItem grow={1}>
          <EuiTitle size="s">
            <h2 style={{ fontWeight: 430 }}>Integrations (2)</h2>
          </EuiTitle>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiFlexGroup
        direction="column"
        justifyContent="spaceBetween"
        style={{ height: '100%' }}
        gutterSize="none"
      >
        {features.map((feature) => (
          <EuiFlexItem key={feature} grow={false}>
            <Synopsis
              id={'random'}
              description={'random'}
              iconUrl={'blah.com'}
              title={feature}
              onClick={() => {
                window.location.assign(`#/placeholder/${feature}`);
              }}
            />
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
    </div>
  );
}
