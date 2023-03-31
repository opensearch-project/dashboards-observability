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
import React, { useCallback, useEffect, useState } from 'react';
import { RouteComponentProps, useLocation } from 'react-router-dom';
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

export interface LoadingStatus {
  inQueue: boolean;
  isRunning: boolean;
  isOutputHidden: boolean;
}
export function Notebook(props: NotebookProps) {
  const [selectedViewId, setselectedViewId] = useState('view_both');
  const [path, setpath] = useState('');
  const [dateCreated, setdateCreated] = useState('');
  const [dateModified, setdateModified] = useState('');
  const [paragraphs, _setparagraphs] = useState<ParaType[]>([]);
  const setparagraphs = (caller, value: ParaType[]) => {
    console.log('setparagraphs', value);
    _setparagraphs(value);
  };
  const [parsedPara, setparsedPara] = useState<ParaType[]>([]);

  const [paragraphsLoadingStatus, setParagraphsLoadingStatus] = useState<LoadingStatus[]>([]);

  const [vizPrefix, setvizPrefix] = useState('');
  const [isAddParaPopoverOpen, setisAddParaPopoverOpen] = useState(false);
  const [isParaActionsPopoverOpen, setisParaActionsPopoverOpen] = useState(false);
  const [isNoteActionsPopoverOpen, setisNoteActionsPopoverOpen] = useState(false);
  const [isReportingPluginInstalled, setisReportingPluginInstalled] = useState(false);
  const [isReportingActionsPopoverOpen, setisReportingActionsPopoverOpen] = useState(false);
  const [isReportingLoadingModalOpen, setisReportingLoadingModalOpen] = useState(false);
  const [isModalVisible, setisModalVisible] = useState(false);
  const [modalLayout, setmodalLayout] = useState(<EuiOverlayMask />);
  const [showQueryParagraphError, setshowQueryParagraphError] = useState(false);
  const [queryParagraphErrorMessage, setqueryParagraphErrorMessage] = useState('');
  const [loadingStatus, setLoadingStatus] = useState<string | number>('queue');

  const toggleReportingLoadingModal = (show: boolean) => {
    setisReportingLoadingModalOpen(show);
  };

  const parseParagraphs = useCallback(
    (paras: any[]): ParaType[] => {
      try {
        let parsedParas;
        // @ts-ignore
        if (NOTEBOOKS_SELECTED_BACKEND === 'ZEPPELIN') {
          parsedParas = zeppelinParagraphParser(paras);
        } else {
          parsedParas = defaultParagraphParser(paras);
        }

        return parsedParas.map((p: ParaType) => ({
          ...p,
          ...paragraphStatus('queue', p),

          isInputExpanded: selectedViewId === 'input_only',
          paraRef: React.createRef(),
          paraDivRef: React.createRef<HTMLDivElement>(),
        }));
      } catch (err) {
        props.setToast(
          'Error parsing paragraphs, please make sure you have the correct permission.',
          'danger'
        );
        return [];
      }
    },
    [props, selectedViewId]
  );

  useEffect(() => {
    setparsedPara(parseParagraphs(paragraphs));
  }, [paragraphs]);

  // const parseAllParagraphs = () => {
  //   const parsedParas = parseParagraphs(paragraphs);
  //   setparsedPara('parseAllParagraphs', parsedParas);
  // };

  // parse paragraphs based on backend
  const paragraphStatus = (newLoadingStatus: string, para: ParaType): ParaType => {
    if (newLoadingStatus === 'queue')
      return { ...para, inQueue: true, isRunning: false, isOutputHidden: false };
    else if (newLoadingStatus === 'loading')
      return { ...para, inQueue: false, isRunning: true, isOutputHidden: false };
    else return para;
  };

  // Assigns Loading, Running & inQueue for paragraphs in current notebook
  const showParagraphRunning = useCallback(
    (param: number | string) => {
      console.log('showParagraphRunning');
      setParagraphsLoadingStatus(parsedPara.map(setParagraphStatus));
    },
    [paragraphsLoadingStatus, paragraphs]
  );

  // Sets a paragraph to selected and deselects all others
  const paragraphSelector = (index: number) => {
    if (!parsedPara[index].isSelected) {
      setparsedPara(
        parsedPara.map((para: ParaType, idx: number) => ({ ...para, isSelected: idx === index }))
      );
    }
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
          setparagraphs('deleteParagraphButton', paragraphs.splice(index, 1));
          setparsedPara(parsedPara.splice(index, 1));
        })
        .catch((err) => {
          props.setToast(
            'Error deleting paragraph, please make sure you have the correct permission.',
            'danger'
          );
        });
    }
  };

  const showDeleteParaModal = (para: ParaType, index: number) => {
    setmodalLayout(
      getDeleteModal(
        () => setisModalVisible(false),
        () => {
          deleteParagraphButton(para, index);
          setisModalVisible(false);
        },
        'Delete paragraph',
        'Are you sure you want to delete the paragraph? The action cannot be undone.'
      )
    );
    setisModalVisible(true);
  };

  const showDeleteAllParaModal = () => {
    setmodalLayout(
      getDeleteModal(
        () => setisModalVisible(false),
        async () => {
          setisModalVisible(false);
          await props.http
            .delete(`${NOTEBOOKS_API_PREFIX}/paragraph`, {
              query: {
                noteId: props.openedNoteId,
              },
            })
            .then((res) => {
              setparagraphs('deleteAllParagraphs', res.paragraphs);
              // parseAllParagraphs();
              props.setToast('Paragraphs successfully deleted!');
            })
            .catch((err) => {
              props.setToast(
                'Error deleting paragraph, please make sure you have the correct permission.',
                'danger'
              );
            });
        },
        'Delete all paragraphs',
        'Are you sure you want to delete all paragraphs? The action cannot be undone.'
      )
    );
    setisModalVisible(true);
  };

  const showClearOutputsModal = () => {
    setmodalLayout(
      getDeleteModal(
        () => setisModalVisible(false),
        () => {
          clearParagraphButton();
          setisModalVisible(false);
        },
        'Clear all outputs',
        'Are you sure you want to clear all outputs? The action cannot be undone.',
        'Clear'
      )
    );
    setisModalVisible(true);
  };

  const showRenameModal = () => {
    setmodalLayout(
      getCustomModal(
        (newName: string) => {
          props.renameNotebook(newName, props.openedNoteId);
          setisModalVisible(false);
        },
        () => setisModalVisible(false),
        'Name',
        'Rename notebook',
        'Cancel',
        'Rename',
        path,
        CREATE_NOTE_MESSAGE
      )
    );
    setisModalVisible(true);
  };

  const showCloneModal = () => {
    setmodalLayout(
      getCustomModal(
        (newName: string) => {
          props.cloneNotebook(newName, props.openedNoteId).then((id: string) => {
            window.location.assign(`#/notebooks/${id}`);
            setTimeout(() => {
              loadNotebook();
            }, 300);
          });
          setisModalVisible(false);
        },
        () => setisModalVisible(false),
        'Name',
        'Duplicate notebook',
        'Cancel',
        'Duplicate',
        path + ' (copy)',
        CREATE_NOTE_MESSAGE
      )
    );
    setisModalVisible(true);
  };

  const showDeleteNotebookModal = () => {
    setmodalLayout(
      <DeleteNotebookModal
        onConfirm={async () => {
          const toastMessage = `Notebook "${path}" successfully deleted!`;
          await props.deleteNotebook([props.openedNoteId], toastMessage);
          setisModalVisible(false);
          setTimeout(() => {
            props.history.push('.');
          }, 1000);
        }}
        onCancel={() => setisModalVisible(false)}
        title={`Delete notebook "${path}"`}
        message="Delete notebook will remove all contents in the paragraphs."
      />
    );
    setisModalVisible(true);
  };

  // Function for delete Visualization from notebook
  const deleteVizualization = (uniqueId: string) => {
    props.http
      .delete(`${NOTEBOOKS_API_PREFIX}/paragraph/` + props.openedNoteId + '/' + uniqueId)
      .then((res) => {
        setparagraphs('deleteVizualisation', res.paragraphs);
        // parseAllParagraphs();
      })
      .catch((err) => {
        props.setToast(
          'Error deleting visualization, please make sure you have the correct permission.',
          'danger'
        );
      });
  };

  // Backend call to add a paragraph, switch to "view both" if in output only view
  const addPara = (index: number, newParaContent: string, inpType: string) => {
    const addParaObj = {
      noteId: props.openedNoteId,
      paragraphIndex: index,
      paragraphInput: newParaContent,
      inputType: inpType,
    };

    return props.http
      .post(`${NOTEBOOKS_API_PREFIX}/paragraph/`, {
        body: JSON.stringify(addParaObj),
      })
      .then((res) => {
        setparagraphs('addParagraph', paragraphs.splice(index, 0, res));
        const newPara = parseParagraphs([res])[0];
        newPara.isInputExpanded = true;
        setparsedPara(parsedPara.splice(index, 0, newPara));
        paragraphSelector(index);
        if (selectedViewId === 'output_only') setselectedViewId('view_both');
      })
      .catch((err) => {
        props.setToast(
          'Error adding paragraph, please make sure you have the correct permission.',
          'danger'
        );
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
      return addPara(index, para.inp, inputType);
    }
  };

  // Function to move a paragraph
  const movePara = (index: number, targetIndex: number) => {
    const paras = [...paragraphs];
    paras.splice(targetIndex, 0, paragraphs.splice(index, 1)[0]);
    const parsedParas = [...parsedPara];
    parsedParas.splice(targetIndex, 0, parsedParas.splice(index, 1)[0]);

    const moveParaObj = () => ({
      noteId: props.openedNoteId,
      paragraphs,
    });

    return props.http
      .post(`${NOTEBOOKS_API_PREFIX}/set_paragraphs/`, {
        body: JSON.stringify(moveParaObj),
      })
      .then((res) => {
        setparagraphs('movePara', paras);
        setparsedPara(parsedParas);
      })
      .then((res) => scrollToPara(targetIndex))
      .catch((err) => {
        props.setToast(
          'Error moving paragraphs, please make sure you have the correct permission.',
          'danger'
        );
      });
  };

  const scrollToPara = (index: number) => {
    setTimeout(() => {
      window.scrollTo({
        left: 0,
        top: parsedPara[index].paraDivRef.current?.offsetTop,
        behavior: 'smooth',
      });
    }, 0);
  };

  // Function for clearing outputs button
  const clearParagraphButton = () => {
    setLoadingStatus('loading');
    const clearParaObj = {
      noteId: props.openedNoteId,
    };
    props.http
      .put(`${NOTEBOOKS_API_PREFIX}/paragraph/clearall/`, {
        body: JSON.stringify(clearParaObj),
      })
      .then((res) => {
        console.log('clearAllParagraphs', { res });
        setparagraphs('clearParagraphs', res.paragraphs);
        // parseAllParagraphs();
      })
      .catch((err) => {
        props.setToast(
          'Error clearing paragraphs, please make sure you have the correct permission.',
          'danger'
        );
      });
  };

  // Backend call to update and run contents of paragraph
  const updateRunParagraph = (
    para: ParaType,
    index: number,
    textInput: string,
    vizObjectInput?: string,
    paraType?: string
  ) => {
    const inp = vizObjectInput ? vizPrefix + vizObjectInput : textInput;
    para = { ...para, inp, isRunning: true, isOutputHidden: true };
    setPara(para, index);
    // setLoadingStatus(index);

    const paraUpdateObject = {
      noteId: props.openedNoteId,
      paragraphId: para.uniqueId,
      paragraphInput: inp,
      paragraphType: paraType || '',
    };

    return props.http
      .post(`${NOTEBOOKS_API_PREFIX}/paragraph/update/run/`, {
        body: JSON.stringify(paraUpdateObject),
      })
      .then(async (res) => {
        if (res.output[0]?.outputType === 'QUERY') {
          await loadQueryResultsFromInput(res);
          const checkErrorJSON = JSON.parse(res.output[0].result);
          if (checkQueryOutputError(checkErrorJSON)) {
            return;
          }
        }
        const paras: ParaType[] = [...paragraphs];
        paras[index] = res;
        const parsedParas: ParaType[] = [...parsedPara];
        parsedParas[index] = parseParagraphs([res])[0];
        setparagraphs('updateRunParagraphs', paras);
        setparsedPara(parsedParas);
      })
      .catch((err) => {
        if (err.body?.statusCode === 413)
          props.setToast(`Error running paragraph: ${err.body.message}`, 'danger');
        else
          props.setToast(
            'Error running paragraph, please make sure you have the correct permission.',
            'danger'
          );
      });
  };

  const checkQueryOutputError = (checkErrorJSON: { error: { reason: string } }) => {
    // if query output has error output
    if (checkErrorJSON.hasOwnProperty('error')) {
      setshowQueryParagraphError(true);
      setqueryParagraphErrorMessage(checkErrorJSON.error.reason);
      return true;
    }
    // query ran successfully, reset error variables if currently set to true
    else if (showQueryParagraphError) {
      setshowQueryParagraphError(false);
      setqueryParagraphErrorMessage('');
      return false;
    }
  };

  const runForAllParagraphs = (reducer: (para: ParaType, index: number) => Promise<any>) => {
    return parsedPara
      .map((para: ParaType, index: number) => () => reducer(para, index))
      .reduce((chain, func) => chain.then(func), Promise.resolve());
  };

  // Handles text editor value and syncs with paragraph input
  const textValueEditor = (evt: React.ChangeEvent<HTMLTextAreaElement>, index: number) => {
    if (!(evt.key === 'Enter' && evt.shiftKey)) {
      console.log('textValueEditor', {
        evt,
        index,
        para: parsedPara[index],
        key: evt.target.value,
      });
      parsedPara[index].inp = evt.target.value;
      setparsedPara(parsedPara);
    }
  };

  // Handles run paragraph shortcut "Shift+Enter"
  const handleKeyPress = (evt: React.KeyboardEvent<Element>, para: ParaType, index: number) => {
    if (evt.key === 'Enter' && evt.shiftKey) {
      updateRunParagraph(para, index);
    }
  };

  // update view mode, scrolls to paragraph and expands input if scrollToIndex is given
  const updateView = (newViewId: string) => {
    configureViewParameter(newViewId);
    if (newViewId === 'input_only') {
      setparsedPara(parsedPara.map((p) => ({ ...p, isInputExpanded: true })));
    }
  };

  const loadNotebook = useCallback(() => {
    props.http
      .get(`${NOTEBOOKS_API_PREFIX}/note/` + props.openedNoteId)
      .then(async (res) => {
        console.log('result notebook', res);
        setBreadcrumbs(res.path);
        let index = 0;
        for (index = 0; index < res.paragraphs.length; ++index) {
          // if the paragraph is a query, load the query output
          if (res.paragraphs[index].output[0]?.outputType === 'QUERY') {
            await loadQueryResultsFromInput(res.paragraphs[index]);
          }
        }
        setpath(res.path);
        setdateCreated(res.dateCreated);
        setdateModified(res.dateModified);
        setparagraphs('loadNotebook', res.paragraphs);
      })
      .catch((err) => {
        props.setToast(
          'Error fetching notebooks, please make sure you have the correct permission.',
          'danger'
        );
      });
  }, [props.http, props.openedNoteId, props.setToast, setparagraphs]);

  const loadQueryResultsFromInput = async (paragraph: any) => {
    const queryType =
      paragraph.input.inputText.substring(0, 4) === '%sql' ? 'sqlquery' : 'pplquery';
    await props.http
      .post(`/api/sql/${queryType}`, {
        body: JSON.stringify(paragraph.output[0].result),
      })
      .then((response) => {
        paragraph.output[0].result = response.data.resp;
        return paragraph;
      })
      .catch((err) => {
        props.setToast('Error getting query output', 'danger');
      });
  };

  const setPara = (para: ParaType, index: number) => {
    console.log('setPara', { para, index });
    const parsedParas = [...parsedPara];
    parsedParas.splice(index, 1, para);
    setparsedPara(parsedParas);
  };

  const setBreadcrumbs = useCallback(
    (newPath: string) => {
      props.setBreadcrumbs([
        props.parentBreadcrumb,
        {
          text: 'Notebooks',
          href: '#/notebooks',
        },
        {
          text: newPath,
          href: `#/notebooks/${props.openedNoteId}`,
        },
      ]);
    },
    [props]
  );

  const checkIfReportingPluginIsInstalled = useCallback(() => {
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
            setisReportingPluginInstalled(true);
          }
        }
      })
      .catch((error) => {
        props.setToast('Error checking Reporting Plugin Installation status.', 'danger');
      });
  }, [props, setisReportingPluginInstalled]);

  const configureViewParameter = (id: string) => {
    props.history.replace({
      ...props.location,
      search: `view=${id}`,
    });
  };

  useEffect(() => setBreadcrumbs(''), [setBreadcrumbs]);

  useEffect(() => checkIfReportingPluginIsInstalled(), [checkIfReportingPluginIsInstalled]);

  useEffect(() => {
    const searchParams = queryString.parse(props.location.search);
    const view = searchParams.view;
    if (!view) {
      configureViewParameter('view_both');
    }
    setselectedViewId(view);
  }, [props.location.search]);

  useEffect(() => {
    console.log('initial useEffect');
    loadNotebook();
  }, []);

  // render() {
  const CreatedText = () => (
    <div>
      <p>
        Created <br /> {moment(dateCreated).format(UI_DATE_FORMAT)}
      </p>
    </div>
  );
  const viewOptions = (): EuiButtonGroupOption[] => [
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

  const addParaPanels = (): EuiContextMenuPanelDescriptor[] => [
    {
      id: 0,
      title: 'Type',
      items: [
        {
          name: 'Code block',
          onClick: () => {
            setisAddParaPopoverOpen(false);
            addPara(paragraphs.length, '', 'CODE');
          },
        },
        {
          name: 'Visualization',
          onClick: () => {
            setisAddParaPopoverOpen(false);
            addPara(paragraphs.length, '', 'VISUALIZATION');
          },
        },
      ],
    },
  ];
  const paraActionsPanels = ({
    parsedCount,
  }: {
    parsedCount: number;
  }): EuiContextMenuPanelDescriptor[] => [
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
          disabled: parsedCount === 0,
          onClick: (evt) => {
            setisParaActionsPopoverOpen(false);
            runForAllParagraphs((para: ParaType, index: number) => {
              return para.paraRef.current?.runParagraph(evt);
            });
            if (selectedViewId === 'input_only') {
              updateView('view_both');
            }
          },
        },
        {
          name: 'Clear all outputs',
          disabled: parsedPara.length === 0,
          onClick: () => {
            setisParaActionsPopoverOpen(false);
            showClearOutputsModal();
          },
        },
        {
          name: 'Delete all paragraphs',
          disabled: parsedPara.length === 0,
          onClick: () => {
            setisParaActionsPopoverOpen(false);
            showDeleteAllParaModal();
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
            setisParaActionsPopoverOpen(false);
            addPara(0, '', 'CODE');
          },
        },
        {
          name: 'Visualization',
          onClick: () => {
            setisParaActionsPopoverOpen(false);
            addPara(0, '', 'VISUALIZATION');
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
            setisParaActionsPopoverOpen(false);
            addPara(paragraphs.length, '', 'CODE');
          },
        },
        {
          name: 'Visualization',
          onClick: () => {
            setisParaActionsPopoverOpen(false);
            addPara(paragraphs.length, '', 'VISUALIZATION');
          },
        },
      ],
    },
  ];

  const noteActionsPanels = (): EuiContextMenuPanelDescriptor[] => [
    {
      id: 0,
      title: 'Notebook actions',
      items: [
        {
          name: 'Rename notebook',
          onClick: () => {
            setisNoteActionsPopoverOpen(false);
            showRenameModal();
          },
        },
        {
          name: 'Duplicate notebook',
          onClick: () => {
            setisNoteActionsPopoverOpen(false);
            showCloneModal();
          },
        },
        {
          name: 'Delete notebook',
          onClick: () => {
            setisNoteActionsPopoverOpen(false);
            showDeleteNotebookModal();
          },
        },
      ],
    },
  ];

  const reportingActionPanels = (): EuiContextMenuPanelDescriptor[] => [
    {
      id: 0,
      title: 'Reporting',
      items: [
        {
          name: 'Download PDF',
          icon: <EuiIcon type="download" />,
          onClick: () => {
            setisReportingActionsPopoverOpen(false);
            generateInContextReport('pdf', props.toggleReportingLoadingModal);
          },
        },
        {
          name: 'Download PNG',
          icon: <EuiIcon type="download" />,
          onClick: () => {
            setisReportingActionsPopoverOpen(false);
            generateInContextReport('png', props.toggleReportingLoadingModal);
          },
        },
        {
          name: 'Create report definition',
          icon: <EuiIcon type="calendar" />,
          onClick: () => {
            setisReportingActionsPopoverOpen(false);
            contextMenuCreateReportDefinition(window.location.href);
          },
        },
        {
          name: 'View reports',
          icon: <EuiIcon type="document" />,
          onClick: () => {
            setisReportingActionsPopoverOpen(false);
            contextMenuViewReports();
          },
        },
      ],
    },
  ];

  const ReportingContextMenu = () =>
    isReportingPluginInstalled ? (
      <div>
        <EuiPopover
          panelPaddingSize="none"
          button={
            <EuiButton
              id="reportingActionsButton"
              iconType="arrowDown"
              iconSide="right"
              onClick={() => setisReportingActionsPopoverOpen(true)}
            >
              Reporting actions
            </EuiButton>
          }
          isOpen={isReportingActionsPopoverOpen}
          closePopover={() => setisReportingActionsPopoverOpen(false)}
        >
          <EuiContextMenu initialPanelId={0} panels={reportingActionPanels()} />
        </EuiPopover>
      </div>
    ) : null;

  const LoadedParagraphs = () => {
    if (parsedPara.length === 0) return <></>;

    return (
      <>
        {parsedPara.map((para: ParaType, index: number) => (
          <div
            ref={parsedPara[index].paraDivRef}
            key={`para_div_${para.uniqueId}`}
            style={panelStyles}
          >
            <Paragraphs
              ref={parsedPara[index].paraRef}
              pplService={props.pplService}
              para={para}
              loading={paragraphsLoadingStatus[index]}
              setPara={(pr: ParaType) => setPara(pr, index)}
              dateModified={paragraphs[index]?.dateModified}
              index={index}
              paraCount={parsedPara.length}
              paragraphSelector={paragraphSelector}
              textValueEditor={textValueEditor}
              handleKeyPress={handleKeyPress}
              addPara={addPara}
              DashboardContainerByValueRenderer={props.DashboardContainerByValueRenderer}
              deleteVizualization={deleteVizualization}
              http={props.http}
              selectedViewId={selectedViewId}
              setSelectedViewId={updateView}
              deletePara={showDeleteParaModal}
              runPara={updateRunParagraph}
              clonePara={cloneParaButton}
              movePara={movePara}
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
              button={
                <EuiButton
                  iconType="arrowDown"
                  iconSide="right"
                  onClick={() => setisAddParaPopoverOpen(true)}
                >
                  Add paragraph
                </EuiButton>
              }
              isOpen={isAddParaPopoverOpen}
              closePopover={() => setisAddParaPopoverOpen(false)}
            >
              <EuiContextMenu initialPanelId={0} panels={addParaPanels()} />
            </EuiPopover>
          </>
        )}
      </>
    );
  };

  const NoParagraphsNotice = () => {
    if (parsedPara.length > 0) return <></>;

    return (
      // show default paragraph if no paragraphs in this notebook
      <div style={panelStyles}>
        <EuiPanel>
          <EuiSpacer size="xxl" />
          <EuiText textAlign="center">
            <h2>No paragraphs</h2>
            <EuiText>
              Add a paragraph to compose your document or story. Notebooks now support two types of
              input:
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
                  <EuiButton onClick={() => addPara(0, '', 'CODE')} style={{ marginBottom: 17 }}>
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
                    onClick={() => addPara(0, '', 'VISUALIZATION')}
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
    );
  };

  const LoadingModal = () =>
    isReportingLoadingModalOpen ? (
      <GenerateReportLoadingModal setShowLoading={toggleReportingLoadingModal} />
    ) : null;

  const ViewButtonGroup = () => {
    if (parsedPara.length === 0) return <></>;

    return (
      <EuiFlexItem grow={false}>
        <EuiButtonGroup
          legend=""
          buttonSize="m"
          options={viewOptions()}
          idSelected={selectedViewId}
          onChange={(id) => {
            updateView(id);
          }}
        />
      </EuiFlexItem>
    );
  };

  return (
    <div style={pageStyles}>
      <EuiPage>
        <EuiPageBody component="div">
          <EuiFlexGroup gutterSize="s" justifyContent="flexEnd">
            <EuiFlexItem />
            <ViewButtonGroup />
            <EuiFlexItem grow={false} />
            <EuiFlexItem grow={false} />
            <EuiFlexItem grow={false}>
              <EuiPopover
                panelPaddingSize="none"
                button={
                  <EuiButton
                    data-test-subj="notebook-paragraph-actions-button"
                    iconType="arrowDown"
                    iconSide="right"
                    onClick={() => setisParaActionsPopoverOpen(true)}
                  >
                    Paragraph actions
                  </EuiButton>
                }
                isOpen={isParaActionsPopoverOpen}
                closePopover={() => setisParaActionsPopoverOpen(false)}
              >
                <EuiContextMenu
                  initialPanelId={0}
                  panels={paraActionsPanels({ parsedCount: parsedPara?.length || 0 })}
                />
              </EuiPopover>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <ReportingContextMenu />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiPopover
                panelPaddingSize="none"
                button={
                  <EuiButton
                    data-test-subj="notebook-notebook-actions-button"
                    iconType="arrowDown"
                    iconSide="right"
                    onClick={() => setisNoteActionsPopoverOpen(true)}
                  >
                    Notebook actions
                  </EuiButton>
                }
                isOpen={isNoteActionsPopoverOpen}
                closePopover={() => setisNoteActionsPopoverOpen(false)}
              >
                <EuiContextMenu initialPanelId={0} panels={noteActionsPanels()} />
              </EuiPopover>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="s" />
          <EuiTitle size="l">
            <h1>{path}</h1>
          </EuiTitle>
          <EuiSpacer size="m" />
          <EuiFlexGroup alignItems={'flexStart'} gutterSize={'l'}>
            <EuiFlexItem grow={false}>
              <EuiText>
                <CreatedText />
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>

          <LoadedParagraphs />

          <NoParagraphsNotice />

          <LoadingModal />
        </EuiPageBody>
      </EuiPage>
      {isModalVisible && modalLayout}
    </div>
  );
}
