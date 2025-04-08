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
import {
  ChromeBreadcrumb,
  CoreStart,
  MountPoint,
  SavedObjectsStart,
} from '../../../../../../src/core/public';
import { DashboardStart } from '../../../../../../src/plugins/dashboard/public';
import { DataSourceManagementPluginSetup } from '../../../../../../src/plugins/data_source_management/public';
import {
  NOTEBOOKS_API_PREFIX,
  NOTEBOOKS_DOCUMENTATION_URL,
} from '../../../../common/constants/notebooks';
import PPLService from '../../../services/requests/ppl';
import { isValidUUID } from './helpers/notebooks_parser';
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
  dataSourceEnabled: boolean;
  dataSourceManagement: DataSourceManagementPluginSetup;
  setActionMenu: (menuMount: MountPoint | undefined) => void;
  savedObjectsMDSClient: SavedObjectsStart;
};

interface MainState {
  data: NotebookType[];
  openedNotebook: NotebookType | undefined;
  toasts: Toast[];
  loading: boolean;
  defaultMDSId: string;
  defaultMDSLabel: string;
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
      defaultMDSId: '',
      defaultMDSLabel: '',
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
  fetchNotebooks = () => {
    // Notebooks plugin only supports savedNotebooks stored in .kibana
    // The support for notebooks in .opensearch-observability is removed in OSD 3.0.0 version
    // Related Issue: https://github.com/opensearch-project/dashboards-observability/issues/2350
    return this.props.http
      .get(`${NOTEBOOKS_API_PREFIX}/savedNotebook`)
      .then((savedNotebooksResponse) => {
        this.setState({ data: savedNotebooksResponse.data });
      })
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

    return this.props.http
      .post(`${NOTEBOOKS_API_PREFIX}/note/savedNotebook`, {
        body: JSON.stringify(newNoteObject),
      })
      .then(async (res) => {
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

    return this.props.http
      .put(`${NOTEBOOKS_API_PREFIX}/note/savedNotebook/rename`, {
        body: JSON.stringify(renameNoteObject),
      })
      .then((res) => {
        this.setState((prevState) => {
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

    return this.props.http
      .post(`${NOTEBOOKS_API_PREFIX}/note/savedNotebook/clone`, {
        body: JSON.stringify(cloneNoteObject),
      })
      .then((res) => {
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
      const isValid = isValidUUID(id);
      const route = isValid
        ? `${NOTEBOOKS_API_PREFIX}/note/savedNotebook/${id}`
        : `${NOTEBOOKS_API_PREFIX}/note/${id}`;
      return this.props.http.delete(route).then((res) => {
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

    Promise.allSettled(promises)
      .then(() => {
        const message =
          toastMessage || `Notebook${notebookList.length > 1 ? 's' : ''} successfully deleted!`;
        this.setToast(message);
      })
      .catch((err) => {
        console.error('Error in deleting multiple notebooks', err);
      });
  };
  migrateNotebook = async (migrateNoteName: string, migrateNoteID: string): Promise<string> => {
    if (migrateNoteName.length >= 50 || migrateNoteName.length === 0) {
      this.setToast('Invalid notebook name', 'danger');
      return Promise.reject();
    }
    const migrateNoteObject = {
      name: migrateNoteName,
      noteId: migrateNoteID,
    };
    return this.props.http
      .post(`${NOTEBOOKS_API_PREFIX}/note/migrate`, {
        body: JSON.stringify(migrateNoteObject),
      })
      .then((res) => {
        this.setState((prevState) => ({
          data: [
            ...prevState.data,
            {
              path: migrateNoteName,
              id: res.id,
              dateCreated: res.attributes.dateCreated,
              dateModified: res.attributes.dateModified,
            },
          ],
        }));
        this.setToast(`Notebook "${migrateNoteName}" successfully created!`);
        return res.id;
      })
      .catch((err) => {
        this.setToast(
          'Error migrating notebook, please make sure you have the correct permission.',
          'danger'
        );
        console.error(err.body.message);
      });
  };
  addSampleNotebooks = async (dataSourceMDSId?: string, dataSourceMDSLabel?: string) => {
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
        .then((resp) => {
          if (resp.total === 0) {
            return true;
          }
          const hasDataSourceMDSId = resp.saved_objects.some((obj) =>
            obj.references.some((ref) => ref.type === 'data-source' && ref.id === dataSourceMDSId)
          );

          // Return true if dataSourceMDSId is not found in any references
          return !hasDataSourceMDSId;
        });
      const logs = await this.props.http
        .get('../api/saved_objects/_find', {
          query: {
            type: 'index-pattern',
            search_fields: 'title',
            search: 'opensearch_dashboards_sample_data_logs',
          },
        })
        .then((resp) => {
          if (resp.total === 0) {
            return true;
          }
          const hasDataSourceMDSId = resp.saved_objects.some((obj) =>
            obj.references.some((ref) => ref.type === 'data-source' && ref.id === dataSourceMDSId)
          );

          // Return true if dataSourceMDSId is not found in any references
          return !hasDataSourceMDSId;
        });
      if (flights) {
        this.setToast('Adding sample data for flights. This can take some time.');
        await this.props.http.post('../api/sample_data/flights', {
          query: { data_source_id: dataSourceMDSId },
        });
      }
      if (logs) {
        this.setToast('Adding sample data for logs. This can take some time.');
        await this.props.http.post('../api/sample_data/logs', {
          query: { data_source_id: dataSourceMDSId },
        });
      }
      const visIds: string[] = [];
      await this.props.http
        .get('../api/saved_objects/_find', {
          query: {
            type: 'visualization',
            search_fields: 'title',
            search:
              `[Logs] Response Codes Over Time + Annotations` +
              (dataSourceMDSLabel ? `_${dataSourceMDSLabel}` : ''),
          },
        })
        .then((resp) => {
          if (this.props.dataSourceEnabled) {
            const searchTitle = `[Logs] Response Codes Over Time + Annotations_${dataSourceMDSLabel}`;
            const savedObjects = resp.saved_objects;

            const foundObject = savedObjects.find((obj) => obj.attributes.title === searchTitle);
            if (foundObject) {
              visIds.push(foundObject.id);
            }
          } else {
            visIds.push(resp.saved_objects[0].id);
          }
        });
      await this.props.http
        .get('../api/saved_objects/_find', {
          query: {
            type: 'visualization',
            search_fields: 'title',
            search:
              `[Logs] Unique Visitors vs. Average Bytes` +
              (dataSourceMDSLabel ? `_${dataSourceMDSLabel}` : ''),
          },
        })
        .then((resp) => {
          if (this.props.dataSourceEnabled) {
            const searchTitle = `[Logs] Unique Visitors vs. Average Bytes_${dataSourceMDSLabel}`;
            const savedObjects = resp.saved_objects;

            const foundObject = savedObjects.find((obj) => obj.attributes.title === searchTitle);
            if (foundObject) {
              visIds.push(foundObject.id);
            }
          } else {
            visIds.push(resp.saved_objects[0].id);
          }
        });
      await this.props.http
        .get('../api/saved_objects/_find', {
          query: {
            type: 'visualization',
            search_fields: 'title',
            search:
              `[Flights] Flight Count and Average Ticket Price` +
              (dataSourceMDSLabel ? `_${dataSourceMDSLabel}` : ''),
          },
        })
        .then((resp) => {
          if (this.props.dataSourceEnabled) {
            const searchTitle = `[Flights] Flight Count and Average Ticket Price_${dataSourceMDSLabel}`;
            const savedObjects = resp.saved_objects;

            const foundObject = savedObjects.find((obj) => obj.attributes.title === searchTitle);
            if (foundObject) {
              visIds.push(foundObject.id);
            }
          } else {
            visIds.push(resp.saved_objects[0].id);
          }
        });
      await this.props.http
        .post(`${NOTEBOOKS_API_PREFIX}/note/savedNotebook/addSampleNotebooks`, {
          body: JSON.stringify({ visIds }),
        })
        .then((res) => {
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
              render={(_props) => (
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
                  dataSourceManagement={this.props.dataSourceManagement}
                  notifications={this.props.notifications}
                  dataSourceEnabled={this.props.dataSourceEnabled}
                  savedObjectsMDSClient={this.props.savedObjectsMDSClient}
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
                  migrateNotebook={this.migrateNotebook}
                  dataSourceManagement={this.props.dataSourceManagement}
                  setActionMenu={this.props.setActionMenu}
                  notifications={this.props.notifications}
                  dataSourceEnabled={this.props.dataSourceEnabled}
                  savedObjectsMDSClient={this.props.savedObjectsMDSClient}
                />
              )}
            />
          </Switch>
        </>
      </HashRouter>
    );
  }
}
