/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiSmallButton,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiCompressedFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
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
  EuiPopover,
  EuiSpacer,
  EuiTableFieldDataColumnType,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import _ from 'lodash';
import moment from 'moment';
import React, { ReactElement, useEffect, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { ChromeBreadcrumb } from '../../../../../../src/core/public';
import {
  CREATE_NOTE_MESSAGE,
  NOTEBOOKS_DOCUMENTATION_URL,
} from '../../../../common/constants/notebooks';
import { UI_DATE_FORMAT, pageStyles } from '../../../../common/constants/shared';
import {
  DeleteNotebookModal,
  getCustomModal,
  getSampleNotebooksModal,
} from './helpers/modal_containers';
import { NotebookType } from './main';
import { setNavBreadCrumbs } from '../../../../common/utils/set_nav_bread_crumbs';

interface NoteTableProps {
  loading: boolean;
  fetchNotebooks: () => void;
  addSampleNotebooks: () => void;
  notebooks: NotebookType[];
  createNotebook: (newNoteName: string) => void;
  renameNotebook: (newNoteName: string, noteId: string) => void;
  cloneNotebook: (newNoteName: string, noteId: string) => void;
  deleteNotebook: (noteList: string[], toastMessage?: string) => void;
  parentBreadcrumb: ChromeBreadcrumb;
  setBreadcrumbs: (newBreadcrumbs: ChromeBreadcrumb[]) => void;
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
}: NoteTableProps) {
  const [isModalVisible, setIsModalVisible] = useState(false); // Modal Toggle
  const [modalLayout, setModalLayout] = useState(<EuiOverlayMask />); // Modal Layout
  const [isActionsPopoverOpen, setIsActionsPopoverOpen] = useState(false);
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
      ]
    );
    fetchNotebooks();
  }, [setBreadcrumbs, parentBreadcrumb, fetchNotebooks]);

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
    setModalLayout(
      getSampleNotebooksModal(closeModal, async () => {
        closeModal();
        await addSampleNotebooks();
      })
    );
    showModal();
  };

  const popoverButton = (
    <EuiSmallButton
      data-test-subj="notebookTableActionBtn"
      iconType="arrowDown"
      iconSide="right"
      onClick={() => setIsActionsPopoverOpen(!isActionsPopoverOpen)}
    >
      Actions
    </EuiSmallButton>
  );

  const popoverItems: ReactElement[] = [
    <EuiContextMenuItem
      key="delete"
      disabled={notebooks.length === 0 || selectedNotebooks.length === 0}
      onClick={() => {
        setIsActionsPopoverOpen(false);
        deleteNote();
      }}
      data-test-subj="deleteNotebookBtn"
    >
      Delete
    </EuiContextMenuItem>,
    <EuiContextMenuItem
      key="addSample"
      onClick={() => {
        setIsActionsPopoverOpen(false);
        addSampleNotebooksModal();
      }}
      data-test-subj="add-samples-btn"
    >
      Add samples
    </EuiContextMenuItem>,
  ];

  const tableColumns = [
    {
      field: 'path',
      name: 'Name',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiLink href={`#/${record.id}`}>{_.truncate(value, { length: 100 })}</EuiLink>
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
    <div style={pageStyles}>
      <EuiPage>
        <EuiPageBody component="div">
          <EuiPageHeader>
            <EuiPageHeaderSection>
              <EuiTitle size="l">
                <h1>Notebooks</h1>
              </EuiTitle>
            </EuiPageHeaderSection>
          </EuiPageHeader>
          <EuiPageContent id="notebookArea">
            <EuiPageContentHeader>
              <EuiPageContentHeaderSection>
                <EuiTitle size="s" data-test-subj="notebookTableTitle">
                  <h3>
                    Notebooks<span className="panel-header-count"> ({notebooks.length})</span>
                  </h3>
                </EuiTitle>
                <EuiSpacer size="s" />
                <EuiText size="s" color="subdued" data-test-subj="notebookTableDescription">
                  Use Notebooks to interactively and collaboratively develop rich reports backed by
                  live data. Common use cases for notebooks includes creating postmortem reports,
                  designing run books, building live infrastructure reports, or even documentation.{' '}
                  <EuiLink external={true} href={NOTEBOOKS_DOCUMENTATION_URL} target="blank">
                    Learn more
                  </EuiLink>
                </EuiText>
              </EuiPageContentHeaderSection>
              <EuiPageContentHeaderSection>
                <EuiFlexGroup gutterSize="s">
                  <EuiFlexItem>
                    <EuiPopover
                      panelPaddingSize="none"
                      button={popoverButton}
                      isOpen={isActionsPopoverOpen}
                      closePopover={() => setIsActionsPopoverOpen(false)}
                    >
                      <EuiContextMenuPanel items={popoverItems} />
                    </EuiPopover>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiSmallButton fill href="#/create" data-test-subj="createNotebookPrimaryBtn">
                      Create notebook
                    </EuiSmallButton>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiPageContentHeaderSection>
            </EuiPageContentHeader>
            <EuiHorizontalRule margin="m" />
            {notebooks.length > 0 ? (
              <>
                <EuiCompressedFieldSearch
                  fullWidth
                  placeholder="Search notebook name"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <EuiHorizontalRule margin="m" />
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
                  <EuiText color="subdued">
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
                      Add samples
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
    </div>
  );
}
