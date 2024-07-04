/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiGlobalToastList, EuiLink } from '@elastic/eui';
import { Toast } from '@elastic/eui/src/components/toast/global_toast_list';
import React, { ReactChild } from 'react';
// eslint-disable-next-line @osd/eslint/module_migration
import { Route, Switch } from 'react-router';
import { HashRouter, RouteComponentProps } from 'react-router-dom';
import { ChromeBreadcrumb, CoreStart } from '../../../../../../src/core/public';
import { DashboardStart } from '../../../../../../src/plugins/dashboard/public';
import {
  NOTEBOOKS_API_PREFIX,
  NOTEBOOKS_DOCUMENTATION_URL
} from '../../../../common/constants/notebooks';
import PPLService from '../../../services/requests/ppl';
import { NoteTable } from './note_table';
import { Notebook } from './notebook';

/*
 * "Main" component renders the whole Notebooks as a single page application
 *
 * Props taken in as params are:
 * DashboardContainerByValueRenderer: Dashboard container renderer for visualization
 * http object: for making API requests
 *
 * Cell component of nteract used as a container for paragraphs in notebook UI.
 * https://components.nteract.io/#cell
 */

type MainProps = RouteComponentProps & {
  DashboardContainerByValueRenderer: DashboardStart['DashboardContainerByValueRenderer'];
  http: CoreStart['http'];
  pplService: PPLService;
  notifications: CoreStart['notifications'];
  parentBreadcrumb: ChromeBreadcrumb;
  setBreadcrumbs: (newBreadcrumbs: ChromeBreadcrumb[]) => void;
};

interface MainState {
  data: NotebookType[];
  openedNotebook: NotebookType | undefined;
  toasts: Toast[];
  loading: boolean;
}

export interface NotebookType {
  path: string;
  id: string;
  dateCreated: string;
  dateModified: string;
}

export class Main extends React.Component<MainProps, MainState> {
  constructor(props: Readonly<MainProps>) {
    super(props);
    this.state = {
      data: [],
      openedNotebook: undefined,
      toasts: [],
      loading: false,
    };
  }

  setToast = (title: string, color = 'success', text?: ReactChild) => {
    if (!text) text = '';
    this.setState((prevState) => ({
      toasts: [
        ...prevState.toasts,
        {
          id: new Date().toISOString(),
          title,
          text,
          color,
        } as Toast,
      ],
    }));
  };

  // Fetches path and id for all stored notebooks
  fetchNotebooks = async () => {

    // await OSDSavedNotebookClient.getInstance().getBulk({
    //   "type": "observability-notebook",
    // }).then(response => {
    //   // Extract savedNotebook and add objectId to each
    //   console.log(response)
    //   const savedNotebooks = response.observabilityObjectList.map(item => {
    //       return {
    //           ...item.savedNotebook,
    //           id: item.objectId
    //       };
    //   });
  
    //   // Set the extracted objects to the state
    //   this.setState({data: savedNotebooks });
    // });
    
    return this.props.http
      .get(`${NOTEBOOKS_API_PREFIX}/savedNotebooks`)
      .then((res) => {this.setState(res)
      console.log(this.state.data)}
    
    )
      .catch((err) => {
        console.error('Issue in fetching the notebooks', err.body.message);
      });
  };

  // Creates a new notebook
  createNotebook = async (newNoteName: string) => {
    if (newNoteName.length >= 50 || newNoteName.length === 0) {
      this.setToast('Invalid notebook name', 'danger');
      window.location.assign('#/');
      return;
    }
    const newNoteObject = {
      name: newNoteName,
    };
    // let noteObject : DefaultNotebooks = {
    //   dateCreated: new Date().toISOString(),
    //   name: newNoteObject.name,
    //   dateModified: new Date().toISOString(),
    //   backend: 'Default',
    //   paragraphs: [],
    // };
    // try{
    //   const savedObject = await OSDSavedNotebookClient.getInstance().create(noteObject);
    //   this.setToast(`Notebook "${newNoteName}" successfully created!`);
    //   console.log(savedObject)
    //   window.location.assign(`#/${savedObject.object.id}`);
    // }
    // catch (err){
    //     this.setToast(
    //       'Please ask your administrator to enable Notebooks for you.',
    //       'danger',
    //       <EuiLink href={NOTEBOOKS_DOCUMENTATION_URL} target="_blank">
    //         Documentation
    //       </EuiLink>
    //     );
    //     console.error(err);
    // }
    // this.createSavedNotebook(newNoteObject)
    return this.props.http
      .post(`${NOTEBOOKS_API_PREFIX}/note/savedNotebooks`, {
        body: JSON.stringify(newNoteObject),
      })
      .then(async (res) => {
        console.log(res, 'created here')
        this.setToast(`Notebook "${newNoteName}" successfully created!`);
        window.location.assign(`#/${res}`);
      })
      .catch((err) => {
        this.setToast(
          'Please ask your administrator to enable Notebooks for you.',
          'danger',
          <EuiLink href={NOTEBOOKS_DOCUMENTATION_URL} target="_blank">
            Documentation
          </EuiLink>
        );
        console.error(err);
      });
  };

  // Renames an existing notebook
  renameNotebook = async (editedNoteName: string, editedNoteID: string): Promise<any> => {
    if (editedNoteName.length >= 50 || editedNoteName.length === 0) {
      this.setToast('Invalid notebook name', 'danger');
      return;
    }
    const renameNoteObject = {
      name: editedNoteName,
      noteId: editedNoteID,
    };
    // console.log(renameNoteObject)
    // let noteObject  = {
    //   name: editedNoteName,
    //   dateModified: new Date().toISOString(),
    //   objectId: editedNoteID
    // };
    // await OSDSavedNotebookClient.getInstance().update(noteObject)
    // .then(async response => {
    //   this.setState((prevState) => {
    //     const newData = [...prevState.data];
    //     const renamedNotebook = newData.find((notebook) => notebook.id === editedNoteID);
    //     if (renamedNotebook) renamedNotebook.path = editedNoteName;
    //     return { data: newData };
    //   });
    //   this.setToast(`Notebook successfully renamed into "${editedNoteName}"`);
    //   return response;
    // })
    // .catch((err) => {
    //   this.setToast(
    //     'Error renaming notebook, please make sure you have the correct permission.',
    //     'danger'
    //   );
    //   console.error(err.body.message);
    // });
    return this.props.http
      .put(`${NOTEBOOKS_API_PREFIX}/note/savedNotebook/rename`, {
        body: JSON.stringify(renameNoteObject),
      })
      .then((res) => {
        this.setState((prevState) => {
          console.log(res,prevState)
          const newData = [...prevState.data];
          const renamedNotebook = newData.find((notebook) => notebook.id === editedNoteID);
          if (renamedNotebook) renamedNotebook.path = editedNoteName;
          return { data: newData };
        });
        this.setToast(`Notebook successfully renamed into "${editedNoteName}"`);
        return res;
      })
      .catch((err) => {
        this.setToast(
          'Error renaming notebook, please make sure you have the correct permission.',
          'danger'
        );
        console.error(err.body.message);
      });
  };

  // Clones an existing notebook, return new notebook's id
  cloneNotebook = async (clonedNoteName: string, clonedNoteID: string): Promise<string> => {
    if (clonedNoteName.length >= 50 || clonedNoteName.length === 0) {
      this.setToast('Invalid notebook name', 'danger');
      return Promise.reject();
    }
    const cloneNoteObject = {
      name: clonedNoteName,
      noteId: clonedNoteID,
    };
    // let savedNotebooks: DefaultNotebooks;
    // await OSDSavedNotebookClient.getInstance().get({
    //   "objectId": clonedNoteID,
    // }).then(async response => {
    //   console.log(response, 'from get')
    //   savedNotebooks = {
    //     dateCreated: response.observabilityObjectList[0].savedNotebook.dateCreated,
    //     name: response.observabilityObjectList[0].savedNotebook.name,
    //     dateModified: response.observabilityObjectList[0].savedNotebook.dateModified,
    //     paragraphs: response.observabilityObjectList[0].savedNotebook.paragraphs,
    //     backend: response.observabilityObjectList[0].savedNotebook.backend,
    //   }
    //   console.log(savedNotebooks,'clone')
    // })

    // let cloneNotebook: DefaultNotebooks = {
    //   ...savedNotebooks,
    //   dateCreated: new Date().toISOString(),
    //   dateModified: new Date().toISOString(),
    //   name: clonedNoteName

    // };
    //   console.log(cloneNotebook)
    //   await OSDSavedNotebookClient.getInstance().create(cloneNotebook)
    //   .then(async response => {
    //     console.log('from res',response)
    //     this.setState((prevState) => ({
    //       data: [
    //         ...prevState.data,
    //         {
    //           path: clonedNoteName,
    //           id: response.objectId,
    //           dateCreated: response.object.attributes.savedNotebook.dateCreated,
    //           dateModified: response.object.attributes.savedNotebook.dateModified,
    //         },
    //       ],
    //     }));
    //     this.setToast(`Notebook "${clonedNoteName}" successfully created!`);
    //     return response.object.id;
    //   })
    //   .catch((err) => {
    //     this.setToast(
    //       'Error cloning notebook, please make sure you have the correct permission.',
    //       'danger'
    //     );
    //     console.error(err.body.message);
    //   });

    return this.props.http
      .post(`${NOTEBOOKS_API_PREFIX}/note/savedNotebook/clone`, {
        body: JSON.stringify(cloneNoteObject),
      })
      .then((res) => {
        console.log(res,'from clone')
        this.setState((prevState) => ({
          data: [
            ...prevState.data,
            {
              path: clonedNoteName,
              id: res.id,
              dateCreated: res.attributes.dateCreated,
              dateModified: res.attributes.dateModified,
            },
          ],
        }));
        this.setToast(`Notebook "${clonedNoteName}" successfully created!`);
        return res.id;
      })
      .catch((err) => {
        this.setToast(
          'Error cloning notebook, please make sure you have the correct permission.',
          'danger'
        );
        console.error(err.body.message);
      });
  };

  // Deletes existing notebooks
  deleteNotebook = async (notebookList: string[], toastMessage?: string) => {
      const deleteNotebook = (id: string) => {
        return this.props.http
          .delete(`${NOTEBOOKS_API_PREFIX}/note/savedNotebook/${id}`)
          .then((res) => {
            this.setState((prevState) => ({
              data: prevState.data.filter((notebook) => notebook.id !== id),
            }));
            return res;
          });
      };
    
      const promises = notebookList.map((id) =>
        deleteNotebook(id).catch((err) => {
          this.setToast(
            'Error deleting notebook, please make sure you have the correct permission.',
            'danger'
          );
          console.error(err.body.message);
        })
      );
    
      Promise.all(promises)
        .then(() => {
          const message =
            toastMessage || `Notebook${notebookList.length > 1 ? 's' : ''} successfully deleted!`;
          this.setToast(message);
        })
        .catch((err) => {
          console.error('Error in deleting multiple notebooks', err);
        });
    // console.log(notebookList, toastMessage)
    // await OSDSavedNotebookClient.getInstance().deleteBulk({objectIdList: notebookList})
    // .then(async response => {
    //   this.setState((prevState) => ({
    //     data: prevState.data.filter((notebook) => !notebookList.includes(notebook.id)),
    //   }));
    //   const message =
    //     toastMessage || `Notebook${notebookList.length > 1 ? 's' : ''} successfully deleted!`;
    //   this.setToast(message);
    //   return response;
    // })
    // .catch((err) => {
    //   this.setToast(
    //     'Error deleting notebook, please make sure you have the correct permission.',
    //     'danger'
    //   );
    //   console.error(err.body.message);
    // })

    // return this.props.http
    //   .delete(`${NOTEBOOKS_API_PREFIX}/note/savedNotebook/${notebookList.join(',')}`)
    //   .then((res) => {
    //     this.setState((prevState) => ({
    //       data: prevState.data.filter((notebook) => !notebookList.includes(notebook.id)),
    //     }));
    //     const message =
    //       toastMessage || `Notebook${notebookList.length > 1 ? 's' : ''} successfully deleted!`;
    //     this.setToast(message);
    //     return res;
    //   })
    //   .catch((err) => {
    //     this.setToast(
    //       'Error deleting notebook, please make sure you have the correct permission.',
    //       'danger'
    //     );
    //     console.error(err.body.message);
    //   });
  };

  addSampleNotebooks = async () => {
    try {
      this.setState({ loading: true });
      const flights = await this.props.http
        .get('../api/saved_objects/_find', {
          query: {
            type: 'index-pattern',
            search_fields: 'title',
            search: 'opensearch_dashboards_sample_data_flights',
          },
        })
        .then((resp) => resp.total === 0);
      const logs = await this.props.http
        .get('../api/saved_objects/_find', {
          query: {
            type: 'index-pattern',
            search_fields: 'title',
            search: 'opensearch_dashboards_sample_data_logs',
          },
        })
        .then((resp) => resp.total === 0);
      if (flights || logs) this.setToast('Adding sample data. This can take some time.');
      await Promise.all([
        flights ? this.props.http.post('../api/sample_data/flights') : Promise.resolve(),
        logs ? this.props.http.post('../api/sample_data/logs') : Promise.resolve(),
      ]);
      const visIds: string[] = [];
      await this.props.http
        .get('../api/saved_objects/_find', {
          query: {
            type: 'visualization',
            search_fields: 'title',
            search: '[Logs] Response Codes Over Time + Annotations',
          },
        })
        .then((resp) => visIds.push(resp.saved_objects[0].id));
      await this.props.http
        .get('../api/saved_objects/_find', {
          query: {
            type: 'visualization',
            search_fields: 'title',
            search: '[Logs] Unique Visitors vs. Average Bytes',
          },
        })
        .then((resp) => visIds.push(resp.saved_objects[0].id));
      await this.props.http
        .get('../api/saved_objects/_find', {
          query: {
            type: 'visualization',
            search_fields: 'title',
            search: '[Flights] Flight Count and Average Ticket Price',
          },
        })
        .then((resp) => visIds.push(resp.saved_objects[0].id));

      await this.props.http
        .post(`${NOTEBOOKS_API_PREFIX}/note/savedNotebooks/addSampleNotebooks`, {
          body: JSON.stringify({ visIds }),
        })
        .then((res) => {
          console.log(res)
          const newData = res.body.map((notebook: any) => ({
            path: notebook.name,
            id: notebook.id,
            dateCreated: notebook.dateCreated,
            dateModified: notebook.dateModified,
          }));
          this.setState((prevState) => ({
            data: [...prevState.data, ...newData],
          }));
        });
      this.setToast(`Sample notebooks successfully added.`);
    } catch (err: any) {
      this.setToast('Error adding sample notebooks.', 'danger');
      console.error(err.body.message);
    } finally {
      this.setState({ loading: false });
    }
  };

  render() {
    return (
      <HashRouter>
        <>
          <EuiGlobalToastList
            toasts={this.state.toasts}
            dismissToast={(removedToast) => {
              this.setState({
                toasts: this.state.toasts.filter((toast) => toast.id !== removedToast.id),
              });
            }}
            toastLifeTimeMs={6000}
          />
          <Switch>
            <Route
              exact
              path={['/create', '/']}
              render={(props) => (
                <NoteTable
                  loading={this.state.loading}
                  fetchNotebooks={this.fetchNotebooks}
                  addSampleNotebooks={this.addSampleNotebooks}
                  notebooks={this.state.data}
                  createNotebook={this.createNotebook}
                  renameNotebook={this.renameNotebook}
                  cloneNotebook={this.cloneNotebook}
                  deleteNotebook={this.deleteNotebook}
                  parentBreadcrumb={this.props.parentBreadcrumb}
                  setBreadcrumbs={this.props.setBreadcrumbs}
                  setToast={this.setToast}
                />
              )}
            />
            <Route
              exact
              path="/:id"
              render={(props) => (
                <Notebook
                  pplService={this.props.pplService}
                  openedNoteId={props.match.params.id}
                  DashboardContainerByValueRenderer={this.props.DashboardContainerByValueRenderer}
                  http={this.props.http}
                  parentBreadcrumb={this.props.parentBreadcrumb}
                  setBreadcrumbs={this.props.setBreadcrumbs}
                  renameNotebook={this.renameNotebook}
                  cloneNotebook={this.cloneNotebook}
                  deleteNotebook={this.deleteNotebook}
                  setToast={this.setToast}
                  location={props.location}
                  history={props.history}
                />
              )}
            />
          </Switch>
        </>
      </HashRouter>
    );
  }
}
