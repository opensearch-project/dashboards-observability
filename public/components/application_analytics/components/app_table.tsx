/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import React, { useEffect, useState } from 'react';
import {
  EuiBadge,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiInMemoryTable,
  EuiLink,
  EuiLoadingSpinner,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentHeader,
  EuiSmallButton,
  EuiSpacer,
  EuiText,
  EuiToolTip,
  EuiFieldText,
  EuiButton,
  EuiModal,
  EuiModalHeader,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeaderTitle,
  EuiTitle,
  EuiPageHeader,
} from '@elastic/eui';
import moment from 'moment';
import truncate from 'lodash/truncate';
import { AppAnalyticsComponentDeps } from '../home';
import { ApplicationType, AvailabilityType } from '../../../../common/types/application_analytics';
import { UI_DATE_FORMAT } from '../../../../common/constants/shared';
import { setNavBreadCrumbs } from '../../../../common/utils/set_nav_bread_crumbs';
import { DeleteModal } from '../../common/helpers/delete_modal';
import { HeaderControlledComponentsWrapper } from '../../../../public/plugin_helpers/plugin_headerControl';
import { coreRefs } from '../../../framework/core_refs';
import { TopNavControlButtonData } from '../../../../../../src/plugins/navigation/public';

const newNavigation = coreRefs.chrome?.navGroup.getNavGroupEnabled();

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
  const [searchQuery, setSearchQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [selectedApplication, setSelectedApplication] = useState<ApplicationType | null>(null);
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const createButtonText = 'Create application';

  useEffect(() => {
    setNavBreadCrumbs(
      [...parentBreadcrumbs],
      [
        {
          text: 'Applications',
          href: '#/',
        },
      ],
      applications.length
    );
    clear();
    fetchApplications();
  }, [applications.length]);

  const clear = () => {
    setFilters([]);
    clearStorage();
  };

  const closeModal = () => {
    setIsModalVisible(false);
    setIsDeleteModalVisible(false);
    setNewName('');
    setSelectedApplication(null);
  };

  const onRename = async () => {
    if (selectedApplication && newName.trim()) {
      await renameApplication(newName.trim(), selectedApplication.id);
      closeModal();
    }
  };

  const renameApp = (app: ApplicationType) => {
    setSelectedApplication(app);
    setNewName(app.name);
    setIsModalVisible(true);
  };

  const confirmDelete = async () => {
    if (selectedApplication) {
      const toastMessage = `Application${
        applications.length > 1 ? 's' : ' "' + selectedApplication.name + '"'
      } successfully deleted!`;
      await deleteApplication(
        [selectedApplication.id],
        [selectedApplication.panelId],
        toastMessage
      );
      closeModal();
    }
  };

  const deleteApp = (app: ApplicationType) => {
    setSelectedApplication(app);
    setIsDeleteModalVisible(true);
  };

  const actions = [
    {
      name: 'Rename',
      description: 'Rename this application',
      icon: 'pencil',
      type: 'icon',
      onClick: (app: ApplicationType) => renameApp(app),
    },
    {
      name: 'Delete',
      description: 'Delete this application',
      icon: 'trash',
      type: 'icon',
      color: 'danger',
      onClick: (app: ApplicationType) => deleteApp(app),
    },
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
        <EuiLink data-test-subj={`${record.name}ApplicationLink`} href={`#/${record.id}`}>
          {truncate(record.name, { length: 100 })}
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
    {
      name: 'Actions',
      actions,
    },
  ];

  const filteredApplications = applications.filter((app) =>
    app.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <EuiPage>
        <EuiPageBody component="div">
          <EuiPageHeader>
            {!newNavigation && (
              <EuiTitle size="l">
                <h3>Applications {` (${applications.length})`}</h3>
              </EuiTitle>
            )}
            <EuiFlexItem grow={false}>
              <HeaderControlledComponentsWrapper
                components={
                  newNavigation
                    ? [
                        {
                          label: createButtonText,
                          run: () => {
                            window.location.href = '#/create';
                          },
                          iconType: 'plus',
                          iconSide: 'left',
                          fill: true,
                          controlType: 'button',
                        } as TopNavControlButtonData,
                      ]
                    : [
                        <EuiSmallButton fill href="#/create" iconType="plus" iconSide="left">
                          {createButtonText}
                        </EuiSmallButton>,
                      ]
                }
              />
            </EuiFlexItem>
          </EuiPageHeader>
          <EuiPageContent id="applicationArea" paddingSize="m">
            <EuiPageContentHeader>
              <EuiFlexGroup gutterSize="s" alignItems="center">
                <EuiFlexItem>
                  <EuiFieldSearch
                    compressed
                    fullWidth
                    placeholder="Search applications"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    isClearable={true}
                    aria-label="Search applications"
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPageContentHeader>
            {filteredApplications.length > 0 ? (
              <EuiInMemoryTable
                loading={props.loading}
                items={filteredApplications}
                itemId="id"
                columns={tableColumns}
                tableLayout="auto"
                pagination={{
                  initialPageSize: 10,
                  pageSizeOptions: [5, 10, 20],
                }}
                sorting={{
                  sort: {
                    field: 'dateModified',
                    direction: 'desc',
                  },
                }}
                allowNeutralSort={false}
              />
            ) : (
              <>
                <EuiSpacer size="xxl" />
                <EuiText textAlign="center">
                  <h2>No applications</h2>
                </EuiText>
                <EuiSpacer size="m" />
                <EuiFlexGroup justifyContent="center">
                  <EuiFlexItem grow={false}>
                    <EuiSmallButton
                      fullWidth={false}
                      href={`#/create`}
                      iconType="plus"
                      iconSide="left"
                    >
                      {createButtonText}
                    </EuiSmallButton>
                  </EuiFlexItem>
                </EuiFlexGroup>
                <EuiSpacer size="xxl" />
              </>
            )}
          </EuiPageContent>
        </EuiPageBody>
      </EuiPage>

      {isModalVisible && (
        <EuiModal onClose={closeModal}>
          <EuiModalHeader>
            <EuiModalHeaderTitle>Rename Application</EuiModalHeaderTitle>
          </EuiModalHeader>

          <EuiModalBody>
            <EuiFieldText
              fullWidth
              placeholder="New application name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              aria-label="Application name input"
            />
          </EuiModalBody>

          <EuiModalFooter>
            <EuiButton onClick={closeModal} color="text">
              Cancel
            </EuiButton>
            <EuiButton onClick={onRename} fill>
              Rename
            </EuiButton>
          </EuiModalFooter>
        </EuiModal>
      )}

      {isDeleteModalVisible && (
        <DeleteModal
          onConfirm={confirmDelete}
          onCancel={closeModal}
          title={`Delete Application`}
          message={`Are you sure you want to delete the application "${selectedApplication?.name}"?`}
        />
      )}
    </>
  );
}
