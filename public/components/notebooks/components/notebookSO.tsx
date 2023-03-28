/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiButtonGroup,
  EuiButtonGroupOption,
  EuiCard,
  EuiContextMenu,
  EuiContextMenuPanelDescriptor,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiOverlayMask,
  EuiPage,
  EuiPageBody,
  EuiPanel,
  EuiPopover,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import CSS from 'csstype';
import moment from 'moment';
import queryString from 'query-string';
import React, { Component, useEffect, useState } from 'react';
import { RouteComponentProps } from 'react-router-dom';
import PPLService from '../../../services/requests/ppl';
import { ChromeBreadcrumb, CoreStart } from '../../../../../../src/core/public';
import { DashboardStart } from '../../../../../../src/plugins/dashboard/public';
import {
  CREATE_NOTE_MESSAGE,
  NOTEBOOKS_API_PREFIX,
  NOTEBOOKS_SELECTED_BACKEND,
} from '../../../../common/constants/notebooks';
import { UI_DATE_FORMAT } from '../../../../common/constants/shared';
import { ParaType } from '../../../../common/types/notebooks';
import { GenerateReportLoadingModal } from './helpers/custom_modals/reporting_loading_modal';
import { defaultParagraphParser } from './helpers/default_parser';
import { DeleteNotebookModal, getCustomModal, getDeleteModal } from './helpers/modal_containers';
import {
  contextMenuCreateReportDefinition,
  contextMenuViewReports,
  generateInContextReport,
} from './helpers/reporting_context_menu_helper';
import { zeppelinParagraphParser } from './helpers/zeppelin_parser';
import { Paragraphs } from './paragraph_components/paragraphs';
const panelStyles: CSS.Properties = {
  float: 'left',
  width: '100%',
  maxWidth: '1130px',
  marginTop: '20px',
};

const pageStyles: CSS.Properties = {
  float: 'left',
  width: '100%',
  maxWidth: '1500px',
};

/*
 * "Notebook" component is used to display an open notebook
 *
 * Props taken in as params are:
 * DashboardContainerByValueRenderer - Dashboard container renderer for visualization
 * http object - for making API requests
 * setBreadcrumbs - sets breadcrumbs on top
 */
interface NotebookProps {
  pplService: PPLService;
  openedNoteId: string;
  DashboardContainerByValueRenderer: DashboardStart['DashboardContainerByValueRenderer'];
  http: CoreStart['http'];
  parentBreadcrumb: ChromeBreadcrumb;
  setBreadcrumbs: (newBreadcrumbs: ChromeBreadcrumb[]) => void;
  renameNotebook: (newNoteName: string, noteId: string) => void;
  cloneNotebook: (newNoteName: string, noteId: string) => Promise<string>;
  deleteNotebook: (noteList: string[], toastMessage?: string) => void;
  setToast: (title: string, color?: string, text?: string) => void;
  location: RouteComponentProps['location'];
  history: RouteComponentProps['history'];
}

interface NotebookState {
  selectedViewId: string;
  path: string;
  dateCreated: string;
  dateModified: string;
  paragraphs: any; // notebook paragraphs fetched from API
  parsedPara: ParaType[]; // paragraphs parsed to a common format
  vizPrefix: string; // prefix for visualizations in Zeppelin Adaptor
  isAddParaPopoverOpen: boolean;
  isParaActionsPopoverOpen: boolean;
  isNoteActionsPopoverOpen: boolean;
  isReportingPluginInstalled: boolean;
  isReportingActionsPopoverOpen: boolean;
  isReportingLoadingModalOpen: boolean;
  isModalVisible: boolean;
  modalLayout: React.ReactNode;
  showQueryParagraphError: boolean;
  queryParagraphErrorMessage: string;
}
export const NotebookSO = (props: NotebookProps) => {
  // constructor(props: Readonly<NotebookProps>) {
  //   super(props);
  //   this.state = {
  //     selectedViewId: 'view_both',
  //     path: '',
  //     dateCreated: '',
  //     dateModified: '',
  //     paragraphs: [],
  //     parsedPara: [],
  //     vizPrefix: '',
  //     isAddParaPopoverOpen: false,
  //     isParaActionsPopoverOpen: false,
  //     isNoteActionsPopoverOpen: false,
  //     isReportingPluginInstalled: false,
  //     isReportingActionsPopoverOpen: false,
  //     isReportingLoadingModalOpen: false,
  //     isModalVisible: false,
  //     modalLayout: <EuiOverlayMask></EuiOverlayMask>,
  //     showQueryParagraphError: false,
  //     queryParagraphErrorMessage: '',
  //   };
  // }
  const [selectedViewId, setSelectedViewId] = useState('view_both');
  const [path, setpath] = useState('');
  const [dateCreated, setDateCreated] = useState('');
  const [dateModified, setDateModified] = useState('');
  const [paragraphs, setParagraphs] = useState<ParaType[]>([]);
  const [parsedPara, setParsedPara] = useState([]);
  const [vizPrefix, setVizPrefix] = useState('');
  const [isAddParaPopoverOpen, setIsAddParaPopoverOpen] = useState(false);
  const [isParaActionsPopoverOpen, setIsParaActionsPopoverOpen] = useState(false);
  const [isNoteActionsPopoverOpen, setIsNoteActionsPopoverOpen] = useState(false);
  const [isReportingPluginInstalled, setIsReportingPluginInstalled] = useState(false);
  const [isReportingActionsPopoverOpen, setIsReportingActionsPopoverOpen] = useState(false);
  const [isReportingLoadingModalOpen, setIsReportingLoadingModalOpen] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalLayout, setModalLayout] = useState(<EuiOverlayMask />);
  const [showQueryParagraphError, setShowQueryParagraphError] = useState(false);
  const [queryParagraphErrorMessage, setQueryParagraphErrorMessage] = useState('');

  const parseAllParagraphs = () => {
    const parsedPara = parseParagraphs(paragraphs);
    setParagraphs(parsedPara);
  };

  // parse paragraphs based on backend
  const parseParagraphs = (paragraphs: any[]): ParaType[] => {
    try {
      let parsedPara;
      // @ts-ignore
      if (NOTEBOOKS_SELECTED_BACKEND === 'ZEPPELIN') {
        parsedPara = zeppelinParagraphParser(paragraphs);
        setvizPrefix('%sh #vizobject:');
      } else {
        parsedPara = defaultParagraphParser(paragraphs);
      }
      parsedPara.forEach((para: ParaType) => {
        para.isInputExpanded = selectedViewId === 'input_only';
        para.paraRef = React.createRef();
        para.paraDivRef = React.createRef<HTMLDivElement>();
      });
      return parsedPara;
    } catch (err) {
      props.setToast(
        'Error parsing paragraphs, please make sure you have the correct permission.',
        'danger'
      );
      console.error(err);
      setParsedPara([]);
      return [];
    }
  };

  // Assigns Loading, Running & inQueue for paragraphs in current notebook
  const showParagraphRunning = (param: number | string) => {
    const para = [...parsedPara];
    para.forEach((p: ParaType, index: number) => {
      if (param === 'queue') {
        p.inQueue = true;
        p.isOutputHidden = true;
      } else if (param === 'loading') {
        p.isRunning = true;
        p.isOutputHidden = true;
      } else if (param === index) {
        p.isRunning = true;
        p.isOutputHidden = true;
      }
    });
    setParsedPara(para);
  };

  // Sets a paragraph to selected and deselects all others
  const paragraphSelector = (index: number) => {
    const paras = parsedPara.map((p: ParaType, idx: number) => ({
      ...p,
      isSelected: index === idx,
    }));
    setParsedPara(paras);
  };

  // Function for delete a Notebook button
  const deleteParagraphButton = (para: ParaType, index: number) => {
    if (index !== -1) {
      return props.http
        .delete(`${NOTEBOOKS_API_PREFIX}/paragraph`, {
          query: {
            noteId: props.openedNoteId,
            paragraphId: para.uniqueId,
          },
        })
        .then((res) => {
          const paras = [...paragraphs];
          paras.splice(index, 1);
          const parsedParas = [...parsedPara];
          parsedParas.splice(index, 1);
          setParagraphs(paras);
          setParsedPara(parsedParas);
        })
        .catch((err) => {
          props.setToast(
            'Error deleting paragraph, please make sure you have the correct permission.',
            'danger'
          );
          console.error(err.body.message);
        });
    }
  };

  const showDeleteParaModal = (para: ParaType, index: number) => {
    this.setState({
      modalLayout: getDeleteModal(
        () => this.setState({ isModalVisible: false }),
        () => {
          this.deleteParagraphButton(para, index);
          setIsModalVisible(false);
        },
        'Delete paragraph',
        'Are you sure you want to delete the paragraph? The action cannot be undone.'
      ),
    });
    setIsModalVisible(true);
  };

  const showDeleteAllParaModal = () => {
    this.setState({
      modalLayout: getDeleteModal(
        () => this.setState({ isModalVisible: false }),
        async () => {
          setIsModalVisible(false);
          await this.props.http
            .delete(`${NOTEBOOKS_API_PREFIX}/paragraph`, {
              query: {
                noteId: this.props.openedNoteId,
              },
            })
            .then((res) => {
              setParagraphs(res.paragraphs);
              this.parseAllParagraphs();
              this.props.setToast('Paragraphs successfully deleted!');
            })
            .catch((err) => {
              this.props.setToast(
                'Error deleting paragraph, please make sure you have the correct permission.',
                'danger'
              );
              console.error(err.body.message);
            });
        },
        'Delete all paragraphs',
        'Are you sure you want to delete all paragraphs? The action cannot be undone.'
      ),
    });
    setIsModalVisible(true);
  };

  const showClearOutputsModal = () => {
    this.setState({
      modalLayout: getDeleteModal(
        () => this.setState({ isModalVisible: false }),
        () => {
          this.clearParagraphButton();
          setIsModalVisible(false);
        },
        'Clear all outputs',
        'Are you sure you want to clear all outputs? The action cannot be undone.',
        'Clear'
      ),
    });
    setIsModalVisible(true);
  };

  const showRenameModal = () => {
    this.setState({
      modalLayout: getCustomModal(
        (newName: string) => {
          this.props.renameNotebook(newName, this.props.openedNoteId);
          setIsModalVisible(false);
          this.loadNotebook();
        },
        () => this.setState({ isModalVisible: false }),
        'Name',
        'Rename notebook',
        'Cancel',
        'Rename',
        path,
        CREATE_NOTE_MESSAGE
      ),
    });
    setIsModalVisible(true);
  };

  const showCloneModal = () => {
    this.setState({
      modalLayout: getCustomModal(
        (newName: string) => {
          this.props.cloneNotebook(newName, this.props.openedNoteId).then((id: string) => {
            window.location.assign(`#/notebooks/${id}`);
            setTimeout(() => {
              this.loadNotebook();
            }, 300);
          });
          setIsModalVisible(false);
        },
        () => this.setState({ isModalVisible: false }),
        'Name',
        'Duplicate notebook',
        'Cancel',
        'Duplicate',
        path + ' (copy)',
        CREATE_NOTE_MESSAGE
      ),
    });
    setIsModalVisible(true);
  };

  const showDeleteNotebookModal = () => {
    this.setState({
      modalLayout: (
        <DeleteNotebookModal
          onConfirm={async () => {
            const toastMessage = `Notebook "${path}" successfully deleted!`;
            await this.props.deleteNotebook([this.props.openedNoteId], toastMessage);
            this.setState({ isModalVisible: false }, () =>
              setTimeout(() => {
                this.props.history.push('.');
              }, 1000)
            );
          }}
          onCancel={() => this.setState({ isModalVisible: false })}
          title={`Delete notebook "${path}"`}
          message="Delete notebook will remove all contents in the paragraphs."
        />
      ),
    });
    setIsModalVisible(true);
  };

  // Function for delete Visualization from notebook
  const deleteVizualization = (uniqueId: string) => {
    this.props.http
      .delete(`${NOTEBOOKS_API_PREFIX}/paragraph/` + this.props.openedNoteId + '/' + uniqueId)
      .then((res) => {
        setParagraphs(res.paragraphs);
        this.parseAllParagraphs();
      })
      .catch((err) => {
        this.props.setToast(
          'Error deleting visualization, please make sure you have the correct permission.',
          'danger'
        );
        console.error(err.body.message);
      });
  };

  // Backend call to add a paragraph, switch to "view both" if in output only view
  const addPara = (index: number, newParaContent: string, inpType: string) => {
    const addParaObj = {
      noteId: this.props.openedNoteId,
      paragraphIndex: index,
      paragraphInput: newParaContent,
      inputType: inpType,
    };

    return this.props.http
      .post(`${NOTEBOOKS_API_PREFIX}/paragraph/`, {
        body: JSON.stringify(addParaObj),
      })
      .then((res) => {
        const paragraphs = [...paragraphs];
        paragraphs.splice(index, 0, res);
        const newPara = this.parseParagraphs([res])[0];
        newPara.isInputExpanded = true;
        const parsedPara = [...parsedPara];
        parsedPara.splice(index, 0, newPara);

        this.setState({ paragraphs, parsedPara });
        this.paragraphSelector(index);
        if (this.state.selectedViewId === 'output_only') setSelectedViewId('view_both');
      })
      .catch((err) => {
        this.props.setToast(
          'Error adding paragraph, please make sure you have the correct permission.',
          'danger'
        );
        console.error(err.body.message);
      });
  };

  // Function to clone a paragraph
  const cloneParaButton = (para: ParaType, index: number) => {
    let inputType = 'CODE';
    if (para.typeOut[0] === 'VISUALIZATION') {
      inputType = 'VISUALIZATION';
    }
    if (para.typeOut[0] === 'OBSERVABILITY_VISUALIZATION') {
      inputType = 'OBSERVABILITY_VISUALIZATION';
    }
    if (index !== -1) {
      return this.addPara(index, para.inp, inputType);
    }
  };

  // Function to move a paragraph
  const movePara = (index: number, targetIndex: number) => {
    const paragraphs = [...paragraphs];
    paragraphs.splice(targetIndex, 0, paragraphs.splice(index, 1)[0]);
    const parsedPara = [...parsedPara];
    parsedPara.splice(targetIndex, 0, parsedPara.splice(index, 1)[0]);

    const moveParaObj = {
      noteId: this.props.openedNoteId,
      paragraphs,
    };

    return this.props.http
      .post(`${NOTEBOOKS_API_PREFIX}/set_paragraphs/`, {
        body: JSON.stringify(moveParaObj),
      })
      .then((res) => this.setState({ paragraphs, parsedPara }))
      .then((res) => this.scrollToPara(targetIndex))
      .catch((err) => {
        this.props.setToast(
          'Error moving paragraphs, please make sure you have the correct permission.',
          'danger'
        );
        console.error(err.body.message);
      });
  };

  const scrollToPara = (index: number) => {
    setTimeout(() => {
      window.scrollTo({
        left: 0,
        top: this.state.parsedPara[index].paraDivRef.current?.offsetTop,
        behavior: 'smooth',
      });
    }, 0);
  };

  // Function for clearing outputs button
  const clearParagraphButton = () => {
    this.showParagraphRunning('loading');
    const clearParaObj = {
      noteId: this.props.openedNoteId,
    };
    this.props.http
      .put(`${NOTEBOOKS_API_PREFIX}/paragraph/clearall/`, {
        body: JSON.stringify(clearParaObj),
      })
      .then((res) => {
        setParagraphs(res.paragraphs);
        this.parseAllParagraphs();
      })
      .catch((err) => {
        this.props.setToast(
          'Error clearing paragraphs, please make sure you have the correct permission.',
          'danger'
        );
        console.error(err.body.message);
      });
  };

  // Backend call to update and run contents of paragraph
  const updateRunParagraph = (
    para: ParaType,
    index: number,
    vizObjectInput?: string,
    paraType?: string
  ) => {
    this.showParagraphRunning(index);
    if (vizObjectInput) {
      para.inp = vizPrefix + vizObjectInput; // "%sh check"
    }

    const paraUpdateObject = {
      noteId: this.props.openedNoteId,
      paragraphId: para.uniqueId,
      paragraphInput: para.inp,
      paragraphType: paraType || '',
    };

    return this.props.http
      .post(`${NOTEBOOKS_API_PREFIX}/paragraph/update/run/`, {
        body: JSON.stringify(paraUpdateObject),
      })
      .then(async (res) => {
        if (res.output[0]?.outputType === 'QUERY') {
          await this.loadQueryResultsFromInput(res);
          const checkErrorJSON = JSON.parse(res.output[0].result);
          if (this.checkQueryOutputError(checkErrorJSON)) {
            return;
          }
        }
        const paragraphs = this.state.paragraphs;
        paragraphs[index] = res;
        const parsedPara = [...parsedPara];
        parsedPara[index] = this.parseParagraphs([res])[0];
        this.setState({ paragraphs, parsedPara });
      })
      .catch((err) => {
        if (err.body.statusCode === 413)
          this.props.setToast(`Error running paragraph: ${err.body.message}`, 'danger');
        else
          this.props.setToast(
            'Error running paragraph, please make sure you have the correct permission.',
            'danger'
          );
        console.error(err.body.message);
      });
  };

  const checkQueryOutputError = (checkErrorJSON: JSON) => {
    // if query output has error output
    if (checkErrorJSON.hasOwnProperty('error')) {
      this.setState({
        showQueryParagraphError: true,
        queryParagraphErrorMessage: checkErrorJSON.error.reason,
      });
      return true;
    }
    // query ran successfully, reset error variables if currently set to true
    else if (showQueryParagraphError) {
      this.setState({
        showQueryParagraphError: false,
        queryParagraphErrorMessage: '',
      });
      return false;
    }
  };

  const runForAllParagraphs = (reducer: (para: ParaType, index: number) => Promise<any>) => {
    return this.state.parsedPara
      .map((para: ParaType, index: number) => () => reducer(para, index))
      .reduce((chain, func) => chain.then(func), Promise.resolve());
  };

  // Handles text editor value and syncs with paragraph input
  const textValueEditor = (evt: React.ChangeEvent<HTMLTextAreaElement>, index: number) => {
    if (!(evt.key === 'Enter' && evt.shiftKey)) {
      const parsedPara = this.state.parsedPara;
      parsedPara[index].inp = evt.target.value;
      this.setState({ parsedPara });
    }
  };

  // Handles run paragraph shortcut "Shift+Enter"
  const handleKeyPress = (evt: React.KeyboardEvent<Element>, para: ParaType, index: number) => {
    if (evt.key === 'Enter' && evt.shiftKey) {
      this.updateRunParagraph(para, index);
    }
  };

  // update view mode, scrolls to paragraph and expands input if scrollToIndex is given
  const updateView = (selectedViewId: string, scrollToIndex?: number) => {
    this.configureViewParameter(selectedViewId);
    const parsedPara = [...parsedPara];
    this.state.parsedPara.map((para: ParaType, index: number) => {
      parsedPara[index].isInputExpanded = selectedViewId === 'input_only';
    });

    if (scrollToIndex !== undefined) {
      parsedPara[scrollToIndex].isInputExpanded = true;
      this.scrollToPara(scrollToIndex);
    }
    this.setState({ parsedPara, selectedViewId });
    this.paragraphSelector(scrollToIndex !== undefined ? scrollToIndex : -1);
  };

  const loadNotebook = () => {
    this.showParagraphRunning('queue');
    this.props.http
      .get(`${NOTEBOOKS_API_PREFIX}/note/` + this.props.openedNoteId)
      .then(async (res) => {
        this.setBreadcrumbs(res.path);
        let index = 0;
        for (index = 0; index < res.paragraphs.length; ++index) {
          // if the paragraph is a query, load the query output
          if (res.paragraphs[index].output[0]?.outputType === 'QUERY') {
            await this.loadQueryResultsFromInput(res.paragraphs[index]);
          }
        }
        this.setState(res, this.parseAllParagraphs);
      })
      .catch((err) => {
        this.props.setToast(
          'Error fetching notebooks, please make sure you have the correct permission.',
          'danger'
        );
        console.error(err?.body?.message || err);
      });
  };

  const loadQueryResultsFromInput = async (paragraph: any) => {
    const queryType =
      paragraph.input.inputText.substring(0, 4) === '%sql' ? 'sqlquery' : 'pplquery';
    await this.props.http
      .post(`/api/sql/${queryType}`, {
        body: JSON.stringify(paragraph.output[0].result),
      })
      .then((response) => {
        paragraph.output[0].result = response.data.resp;
        return paragraph;
      })
      .catch((err) => {
        this.props.setToast('Error getting query output', 'danger');
        console.error(err);
      });
  };

  const setPara = (para: ParaType, index: number) => {
    const parsedPara = [...parsedPara];
    parsedPara.splice(index, 1, para);
    this.setState({ parsedPara });
  };

  const setBreadcrumbs = (path: string) => {
    this.props.setBreadcrumbs([
      this.props.parentBreadcrumb,
      {
        text: 'Notebooks',
        href: '#/notebooks',
      },
      {
        text: path,
        href: `#/notebooks/${this.props.openedNoteId}`,
      },
    ]);
  };

  const checkIfReportingPluginIsInstalled = () => {
    fetch('../api/status', {
      headers: {
        'Content-Type': 'application/json',
        'osd-xsrf': 'true',
        'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7,zh-TW;q=0.6',
        pragma: 'no-cache',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
      },
      method: 'GET',
      referrerPolicy: 'strict-origin-when-cross-origin',
      mode: 'cors',
      credentials: 'include',
    })
      .then(function (response) {
        return response.json();
      })
      .then((data) => {
        for (let i = 0; i < data.status.statuses.length; ++i) {
          if (data.status.statuses[i].id.includes('plugin:reportsDashboards')) {
            setIsReportingPluginInstalled(true);
          }
        }
      })
      .catch((error) => {
        console.log('error is', error);
      });
  };

  const configureViewParameter = (id: string) => {
    history.replace({
      ...location,
      search: `view=${id}`,
    });
  };

  useEffect(() => {
    setBreadcrumbs('');
    loadNotebook();
    checkIfReportingPluginIsInstalled();
    const searchParams = queryString.parse(location.search);
    const view = searchParams.view;
    if (!view) {
      configureViewParameter('view_both');
    }
    if (view === 'output_only') {
      setSelectedViewId('output_only');
    } else if (view === 'input_only') {
      setSelectedViewId('input_only');
    }
  }, []); // equivalent componentDidMount
  // const componentDidMount = () => {
  //   this.setBreadcrumbs('');
  //   this.loadNotebook();
  //   this.checkIfReportingPluginIsInstalled();
  //   const searchParams = queryString.parse(this.props.location.search);
  //   const view = searchParams.view;
  //   if (!view) {
  //     this.configureViewParameter('view_both');
  //   }
  //   if (view === 'output_only') {
  //     setSelectedViewId('output_only');
  //   } else if (view === 'input_only') {
  //     setSelectedViewId('input_only');
  //   }
  // };

  const createdText = (
    <div>
      <p>
        Created <br /> {moment(dateCreated).format(UI_DATE_FORMAT)}
      </p>
    </div>
  );
  const viewOptions: EuiButtonGroupOption[] = [
    {
      id: 'view_both',
      label: 'View both',
    },
    {
      id: 'input_only',
      label: 'Input only',
    },
    {
      id: 'output_only',
      label: 'Output only',
    },
  ];
  const addParaPanels: EuiContextMenuPanelDescriptor[] = [
    {
      id: 0,
      title: 'Type',
      items: [
        {
          name: 'Code block',
          onClick: () => {
            setIsAddParaPopoverOpen(false);
            addPara(paragraphs.length, '', 'CODE');
          },
        },
        {
          name: 'Visualization',
          onClick: () => {
            setIsAddParaPopoverOpen(false);
            addPara(paragraphs.length, '', 'VISUALIZATION');
          },
        },
      ],
    },
  ];
  const paraActionsPanels: EuiContextMenuPanelDescriptor[] = [
    {
      id: 0,
      title: 'Actions',
      items: [
        {
          name: 'Add paragraph to top',
          panel: 1,
        },
        {
          name: 'Add paragraph to bottom',
          panel: 2,
        },
        {
          name: 'Run all paragraphs',
          disabled: parsedPara.length === 0,
          onClick: () => {
            setIsParaActionsPopoverOpen(false);
            this.runForAllParagraphs((para: ParaType, index: number) => {
              return para.paraRef.current?.runParagraph();
            });
            if (selectedViewId === 'input_only') {
              this.updateView('view_both');
            }
          },
        },
        {
          name: 'Clear all outputs',
          disabled: this.state.parsedPara.length === 0,
          onClick: () => {
            setIsParaActionsPopoverOpen(false);
            this.showClearOutputsModal();
          },
        },
        {
          name: 'Delete all paragraphs',
          disabled: this.state.parsedPara.length === 0,
          onClick: () => {
            setIsParaActionsPopoverOpen(false);
            this.showDeleteAllParaModal();
          },
        },
      ],
    },
    {
      id: 1,
      title: 'Add to top',
      items: [
        {
          name: 'Code block',
          onClick: () => {
            setIsParaActionsPopoverOpen(false);
            this.addPara(0, '', 'CODE');
          },
        },
        {
          name: 'Visualization',
          onClick: () => {
            setIsParaActionsPopoverOpen(false);
            this.addPara(0, '', 'VISUALIZATION');
          },
        },
      ],
    },
    {
      id: 2,
      title: 'Add to bottom',
      items: [
        {
          name: 'Code block',
          onClick: () => {
            setIsParaActionsPopoverOpen(false);
            this.addPara(this.state.paragraphs.length, '', 'CODE');
          },
        },
        {
          name: 'Visualization',
          onClick: () => {
            setIsParaActionsPopoverOpen(false);
            this.addPara(this.state.paragraphs.length, '', 'VISUALIZATION');
          },
        },
      ],
    },
  ];
  const noteActionsPanels: EuiContextMenuPanelDescriptor[] = [
    {
      id: 0,
      title: 'Notebook actions',
      items: [
        {
          name: 'Rename notebook',
          onClick: () => {
            setIsNoteActionsPopoverOpen(false);
            this.showRenameModal();
          },
        },
        {
          name: 'Duplicate notebook',
          onClick: () => {
            setIsNoteActionsPopoverOpen(false);
            this.showCloneModal();
          },
        },
        {
          name: 'Delete notebook',
          onClick: () => {
            setIsNoteActionsPopoverOpen(false);
            this.showDeleteNotebookModal();
          },
        },
      ],
    },
  ];

  const reportingActionPanels: EuiContextMenuPanelDescriptor[] = [
    {
      id: 0,
      title: 'Reporting',
      items: [
        {
          name: 'Create report definition',
          icon: <EuiIcon type="calendar" />,
          onClick: () => {
            setIsReportingActionsPopoverOpen(false);
            contextMenuCreateReportDefinition(window.location.href);
          },
        },
        {
          name: 'View reports',
          icon: <EuiIcon type="document" />,
          onClick: () => {
            setIsReportingActionsPopoverOpen(false);
            contextMenuViewReports();
          },
        },
      ],
    },
  ];

  const showReportingContextMenu = setIsReportingPluginInstalled ? (
    <div>
      <EuiPopover
        panelPaddingSize="none"
        withTitle
        button={
          <EuiButton
            id="reportingActionsButton"
            iconType="arrowDown"
            iconSide="right"
            onClick={() => setIsReportingActionsPopoverOpen(true)}
          >
            Reporting actions
          </EuiButton>
        }
        isOpen={isReportingActionsPopoverOpen}
        closePopover={() => setIsReportingActionsPopoverOpen(false)}
      >
        <EuiContextMenu initialPanelId={0} panels={reportingActionPanels} />
      </EuiPopover>
    </div>
  ) : null;

  const showLoadingModal = isReportingLoadingModalOpen ? (
    <GenerateReportLoadingModal setShowLoading={setIsReportingLoadingModalOpen} />
  ) : null;

  return (
    <div style={pageStyles}>
      <EuiPage>
        <EuiPageBody component="div">
          <EuiFlexGroup gutterSize="s" justifyContent="flexEnd">
            <EuiFlexItem />
            {this.state.parsedPara.length > 0 && (
              <EuiFlexItem grow={false}>
                <EuiButtonGroup
                  buttonSize="m"
                  options={viewOptions}
                  idSelected={this.state.selectedViewId}
                  onChange={(id) => {
                    this.updateView(id);
                  }}
                />
              </EuiFlexItem>
            )}
            <EuiFlexItem grow={false} />
            <EuiFlexItem grow={false} />
            <EuiFlexItem grow={false}>
              <EuiPopover
                panelPaddingSize="none"
                withTitle
                button={
                  <EuiButton
                    data-test-subj="notebook-paragraph-actions-button"
                    iconType="arrowDown"
                    iconSide="right"
                    onClick={() => this.setState({ isParaActionsPopoverOpen: true })}
                  >
                    Paragraph actions
                  </EuiButton>
                }
                isOpen={this.state.isParaActionsPopoverOpen}
                closePopover={() => this.setState({ isParaActionsPopoverOpen: false })}
              >
                <EuiContextMenu initialPanelId={0} panels={paraActionsPanels} />
              </EuiPopover>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>{showReportingContextMenu}</EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiPopover
                panelPaddingSize="none"
                withTitle
                button={
                  <EuiButton
                    data-test-subj="notebook-notebook-actions-button"
                    iconType="arrowDown"
                    iconSide="right"
                    onClick={() => this.setState({ isNoteActionsPopoverOpen: true })}
                  >
                    Notebook actions
                  </EuiButton>
                }
                isOpen={this.state.isNoteActionsPopoverOpen}
                closePopover={() => this.setState({ isNoteActionsPopoverOpen: false })}
              >
                <EuiContextMenu initialPanelId={0} panels={noteActionsPanels} />
              </EuiPopover>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="s" />
          <EuiTitle size="l">
            <h1>{this.state.path}</h1>
          </EuiTitle>
          <EuiSpacer size="m" />
          <EuiFlexGroup alignItems={'flexStart'} gutterSize={'l'}>
            <EuiFlexItem grow={false}>
              <EuiText>{createdText}</EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
          {this.state.parsedPara.length > 0 ? (
            <>
              {parsedPara.map((para: ParaType, index: number) => (
                <div
                  ref={this.state.parsedPara[index].paraDivRef}
                  key={`para_div_${para.uniqueId}`}
                  style={panelStyles}
                >
                  <Paragraphs
                    ref={parsedPara[index].paraRef}
                    pplService={this.props.pplService}
                    para={para}
                    setPara={(para: ParaType) => this.setPara(para, index)}
                    dateModified={paragraphs[index]?.dateModified}
                    index={index}
                    paraCount={parsedPara.length}
                    paragraphSelector={this.paragraphSelector}
                    textValueEditor={this.textValueEditor}
                    handleKeyPress={this.handleKeyPress}
                    addPara={this.addPara}
                    DashboardContainerByValueRenderer={this.props.DashboardContainerByValueRenderer}
                    deleteVizualization={this.deleteVizualization}
                    http={this.props.http}
                    selectedViewId={selectedViewId}
                    setSelectedViewId={this.updateView}
                    deletePara={this.showDeleteParaModal}
                    runPara={this.updateRunParagraph}
                    clonePara={this.cloneParaButton}
                    movePara={this.movePara}
                    showQueryParagraphError={showQueryParagraphError}
                    queryParagraphErrorMessage={queryParagraphErrorMessage}
                  />
                </div>
              ))}
              {selectedViewId !== 'output_only' && (
                <>
                  <EuiSpacer />
                  <EuiPopover
                    panelPaddingSize="none"
                    withTitle
                    button={
                      <EuiButton
                        iconType="arrowDown"
                        iconSide="right"
                        onClick={() => this.setState({ isAddParaPopoverOpen: true })}
                      >
                        Add paragraph
                      </EuiButton>
                    }
                    isOpen={isAddParaPopoverOpen}
                    closePopover={() => this.setState({ isAddParaPopoverOpen: false })}
                  >
                    <EuiContextMenu initialPanelId={0} panels={addParaPanels} />
                  </EuiPopover>
                </>
              )}
            </>
          ) : (
            // show default paragraph if no paragraphs in this notebook
            <div style={panelStyles}>
              <EuiPanel>
                <EuiSpacer size="xxl" />
                <EuiText textAlign="center">
                  <h2>No paragraphs</h2>
                  <EuiText>
                    Add a paragraph to compose your document or story. Notebooks now support two
                    types of input:
                  </EuiText>
                </EuiText>
                <EuiSpacer size="xl" />
                <EuiFlexGroup justifyContent="spaceEvenly">
                  <EuiFlexItem grow={2} />
                  <EuiFlexItem grow={3}>
                    <EuiCard
                      icon={<EuiIcon size="xxl" type="editorCodeBlock" />}
                      title="Code block"
                      description="Write contents directly using markdown, SQL or PPL."
                      footer={
                        <EuiButton
                          onClick={() => this.addPara(0, '', 'CODE')}
                          style={{ marginBottom: 17 }}
                        >
                          Add code block
                        </EuiButton>
                      }
                    />
                  </EuiFlexItem>
                  <EuiFlexItem grow={3}>
                    <EuiCard
                      icon={<EuiIcon size="xxl" type="visArea" />}
                      title="Visualization"
                      description="Import OpenSearch Dashboards or Observability visualizations to the notes."
                      footer={
                        <EuiButton
                          onClick={() => this.addPara(0, '', 'VISUALIZATION')}
                          style={{ marginBottom: 17 }}
                        >
                          Add visualization
                        </EuiButton>
                      }
                    />
                  </EuiFlexItem>
                  <EuiFlexItem grow={2} />
                </EuiFlexGroup>
                <EuiSpacer size="xxl" />
              </EuiPanel>
            </div>
          )}
          {showLoadingModal}
        </EuiPageBody>
      </EuiPage>
      {isModalVisible && modalLayout}
    </div>
  );
};
