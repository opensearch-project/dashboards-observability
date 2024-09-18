/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiCompressedFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiInMemoryTable,
  EuiLink,
  EuiOverlayMask,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentHeader,
  EuiPageContentHeaderSection,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiSmallButton,
  EuiSpacer,
  EuiTableFieldDataColumnType,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import truncate from 'lodash/truncate';
import moment from 'moment';
import React, { useEffect, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import {
  ChromeBreadcrumb,
  CoreStart,
  MountPoint,
  SavedObjectsStart,
} from '../../../../../../src/core/public';
import { DataSourceManagementPluginSetup } from '../../../../../../src/plugins/data_source_management/public';
import {
  CREATE_NOTE_MESSAGE,
  NOTEBOOKS_DOCUMENTATION_URL,
} from '../../../../common/constants/notebooks';
import { UI_DATE_FORMAT } from '../../../../common/constants/shared';
import { setNavBreadCrumbs } from '../../../../common/utils/set_nav_bread_crumbs';
import { HeaderControlledComponentsWrapper } from '../../../../public/plugin_helpers/plugin_headerControl';
import { coreRefs } from '../../../framework/core_refs';
import {
  DeleteNotebookModal,
  getCustomModal,
  getSampleNotebooksModal,
} from './helpers/modal_containers';
import { NotebookType } from './main';

const newNavigation = coreRefs.chrome?.navGroup.getNavGroupEnabled();

interface NoteTableProps {
  loading: boolean;
  fetchNotebooks: () => void;
  addSampleNotebooks: (
    dataSourceMDSId: string | undefined,
    dataSourceLabel: string | undefined
  ) => void;
  notebooks: NotebookType[];
  createNotebook: (newNoteName: string) => void;
  renameNotebook: (newNoteName: string, noteId: string) => void;
  cloneNotebook: (newNoteName: string, noteId: string) => void;
  deleteNotebook: (noteList: string[], toastMessage?: string) => void;
  parentBreadcrumb: ChromeBreadcrumb;
  setBreadcrumbs: (newBreadcrumbs: ChromeBreadcrumb[]) => void;
  dataSourceEnabled: boolean;
  dataSourceManagement: DataSourceManagementPluginSetup;
  setActionMenu: (menuMount: MountPoint | undefined) => void;
  savedObjectsMDSClient: SavedObjectsStart;
  notifications: CoreStart['notifications'];
  // setToast: (title: string, color?: string, text?: string) => void;
}

export function NoteTable({
  loading,
  fetchNotebooks,
  addSampleNotebooks,
  notebooks,
  createNotebook,
  deleteNotebook,
  parentBreadcrumb,
  setBreadcrumbs,
  dataSourceEnabled,
  dataSourceManagement,
  savedObjectsMDSClient,
  notifications,
}: NoteTableProps) {
  const [isModalVisible, setIsModalVisible] = useState(false); // Modal Toggle
  const [modalLayout, setModalLayout] = useState(<EuiOverlayMask />); // Modal Layout
  const [selectedNotebooks, setSelectedNotebooks] = useState<NotebookType[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const location = useLocation();
  const history = useHistory();

  useEffect(() => {
    setNavBreadCrumbs(
      [parentBreadcrumb],
      [
        {
          text: 'Notebooks',
          href: '#/',
        },
      ],
      notebooks.length
    );
    fetchNotebooks();
  }, [setBreadcrumbs, parentBreadcrumb, fetchNotebooks, notebooks.length]);

  useEffect(() => {
    const url = window.location.hash.split('/');
    if (url[url.length - 1] === 'create') {
      createNote();
    }
  }, [location]);

  const closeModal = () => {
    setIsModalVisible(false);
  };
  const showModal = () => {
    setIsModalVisible(true);
  };

  const onCreate = async (newNoteName: string) => {
    createNotebook(newNoteName);
    closeModal();
  };

  const onDelete = async () => {
    const toastMessage = `Notebook${
      selectedNotebooks.length > 1 ? 's' : ' "' + selectedNotebooks[0].path + '"'
    } successfully deleted!`;
    await deleteNotebook(
      selectedNotebooks.map((note) => note.id),
      toastMessage
    );
    closeModal();
  };

  const createNote = () => {
    setModalLayout(
      getCustomModal(
        onCreate,
        () => {
          closeModal();
          history.goBack();
        },
        'Name',
        'Create notebook',
        'Cancel',
        'Create',
        undefined,
        CREATE_NOTE_MESSAGE
      )
    );
    showModal();
  };

  const deleteNote = () => {
    const notebookString = `notebook${selectedNotebooks.length > 1 ? 's' : ''}`;
    setModalLayout(
      <DeleteNotebookModal
        onConfirm={onDelete}
        onCancel={closeModal}
        title={`Delete ${selectedNotebooks.length} ${notebookString}`}
        message={`Are you sure you want to delete the selected ${selectedNotebooks.length} ${notebookString}?`}
      />
    );
    showModal();
  };

  const addSampleNotebooksModal = async () => {
    let selectedDataSourceId: string | undefined;
    let selectedDataSourceLabel: string | undefined;
    const handleSelectedDataSourceChange = (id?: string, label?: string) => {
      selectedDataSourceId = id;
      selectedDataSourceLabel = label;
    };
    setModalLayout(
      getSampleNotebooksModal(
        closeModal,
        async () => {
          closeModal();
          await addSampleNotebooks(selectedDataSourceId, selectedDataSourceLabel);
        },
        dataSourceEnabled,
        dataSourceManagement,
        savedObjectsMDSClient,
        notifications,
        handleSelectedDataSourceChange
      )
    );
    showModal();
  };

  const tableColumns = [
    {
      field: 'path',
      name: 'Name',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiLink href={`#/${record.id}`}>{truncate(value, { length: 100 })}</EuiLink>
      ),
    },
    {
      field: 'dateModified',
      name: 'Last updated',
      sortable: true,
      render: (value) => moment(value).format(UI_DATE_FORMAT),
    },
    {
      field: 'dateCreated',
      name: 'Created',
      sortable: true,
      render: (value) => moment(value).format(UI_DATE_FORMAT),
    },
  ] as Array<
    EuiTableFieldDataColumnType<{
      path: string;
      id: string;
      dateCreated: string;
      dateModified: string;
    }>
  >;

  return (
    <>
      <EuiPage>
        <EuiPageBody component="div">
          {!newNavigation && (
            <EuiPageHeader>
              <EuiPageHeaderSection>
                <EuiTitle size="l">
                  <h3>Notebooks</h3>
                </EuiTitle>
              </EuiPageHeaderSection>
            </EuiPageHeader>
          )}
          <EuiPageContent id="notebookArea" paddingSize="m">
            {newNavigation ? (
              <HeaderControlledComponentsWrapper
                description={{
                  text:
                    'Use Notebooks to interactively and collaboratively develop rich reports backed by live data. Common use cases for notebooks include creating postmortem reports, designing run books, building live infrastructure reports, or even documentation.',
                  url: NOTEBOOKS_DOCUMENTATION_URL,
                  urlTitle: 'Learn more',
                }}
                components={[
                  <EuiFlexGroup gutterSize="s" key="controls">
                    <EuiFlexItem grow={false}>
                      <EuiSmallButton
                        data-test-subj="notebookEmptyTableAddSamplesBtn"
                        fullWidth={false}
                        onClick={() => addSampleNotebooksModal()}
                      >
                        Add sample notebooks
                      </EuiSmallButton>
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <EuiSmallButton
                        fill
                        href="#/create"
                        data-test-subj="createNotebookPrimaryBtn"
                        iconType="plus"
                        iconSide="left"
                      >
                        Create notebook
                      </EuiSmallButton>
                    </EuiFlexItem>
                  </EuiFlexGroup>,
                ]}
              />
            ) : (
              <EuiPageContentHeader>
                <EuiPageContentHeaderSection>
                  <EuiTitle size="s" data-test-subj="notebookTableTitle">
                    <h3>
                      Notebooks<span className="panel-header-count"> ({notebooks.length})</span>
                    </h3>
                  </EuiTitle>
                  <EuiSpacer size="s" />
                  <EuiText size="s" color="subdued" data-test-subj="notebookTableDescription">
                    Use Notebooks to interactively and collaboratively develop rich reports backed
                    by live data. Common use cases for notebooks include creating postmortem
                    reports, designing run books, building live infrastructure reports, or even
                    documentation.{' '}
                    <EuiLink external={true} href={NOTEBOOKS_DOCUMENTATION_URL} target="blank">
                      Learn more
                    </EuiLink>
                  </EuiText>
                </EuiPageContentHeaderSection>
                <EuiPageContentHeaderSection>
                  <EuiFlexGroup gutterSize="s">
                    <EuiFlexItem grow={false}>
                      <EuiSmallButton
                        data-test-subj="notebookEmptyTableAddSamplesBtn"
                        fullWidth={false}
                        onClick={() => addSampleNotebooksModal()}
                      >
                        Add sample notebooks
                      </EuiSmallButton>
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <EuiSmallButton
                        fill
                        href="#/create"
                        data-test-subj="createNotebookPrimaryBtn"
                        iconType="plus"
                        iconSide="left"
                      >
                        Create notebook
                      </EuiSmallButton>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiPageContentHeaderSection>
              </EuiPageContentHeader>
            )}
            {notebooks.length > 0 ? (
              <>
                <EuiFlexGroup gutterSize="s" alignItems="center">
                  <EuiFlexItem grow={false}>
                    {selectedNotebooks.length > 0 && (
                      <EuiSmallButton
                        color="danger"
                        iconType="trash"
                        onClick={deleteNote}
                        data-test-subj="deleteSelectedNotebooks"
                      >
                        Delete {selectedNotebooks.length} notebook
                        {selectedNotebooks.length > 1 ? 's' : ''}
                      </EuiSmallButton>
                    )}
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiCompressedFieldSearch
                      fullWidth
                      placeholder="Search notebook name"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </EuiFlexItem>
                </EuiFlexGroup>
                <EuiSpacer size="m" />
                <EuiInMemoryTable
                  loading={loading}
                  items={
                    searchQuery
                      ? notebooks.filter((notebook) =>
                          notebook.path.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                      : notebooks
                  }
                  itemId="id"
                  columns={tableColumns}
                  tableLayout="auto"
                  pagination={{
                    initialPageSize: 10,
                    pageSizeOptions: [8, 10, 13],
                  }}
                  sorting={{
                    sort: {
                      field: 'dateModified',
                      direction: 'desc',
                    },
                  }}
                  allowNeutralSort={false}
                  isSelectable={true}
                  selection={{
                    onSelectionChange: (items) => setSelectedNotebooks(items),
                  }}
                />
              </>
            ) : (
              <>
                <EuiSpacer size="xxl" />
                <EuiText textAlign="center" data-test-subj="notebookEmptyTableText">
                  <h2>No notebooks</h2>
                  <EuiSpacer size="m" />
                  <EuiText color="subdued" size="s">
                    Use notebooks to create post-mortem reports, build live infrastructure
                    <br />
                    reports, or foster explorative collaborations with data.
                  </EuiText>
                </EuiText>
                <EuiSpacer size="m" />
                <EuiFlexGroup justifyContent="center">
                  <EuiFlexItem grow={false}>
                    <EuiSmallButton
                      href="#/create"
                      data-test-subj="notebookEmptyTableCreateBtn"
                      fullWidth={false}
                      iconType="plus"
                      iconSide="left"
                    >
                      Create notebook
                    </EuiSmallButton>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiSmallButton
                      data-test-subj="notebookEmptyTableAddSamplesBtn"
                      fullWidth={false}
                      onClick={() => addSampleNotebooksModal()}
                    >
                      Add sample notebooks
                    </EuiSmallButton>
                  </EuiFlexItem>
                </EuiFlexGroup>
                <EuiSpacer size="xxl" />
              </>
            )}
          </EuiPageContent>
        </EuiPageBody>
      </EuiPage>
      {isModalVisible && modalLayout}
    </>
  );
}
