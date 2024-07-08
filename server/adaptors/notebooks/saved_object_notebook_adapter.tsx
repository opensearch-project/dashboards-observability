/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectsFindResult } from '../../../../../src/core/server/saved_objects/service/saved_objects_client';
import { SavedObjectsClientContract } from '../../../../../src/core/server/types';
import { NOTEBOOK_SAVED_OBJECT, NotebooksSavedObjectAttributes } from '../../../common/types/observability_saved_object_attributes';
import { DefaultNotebooks } from '../../../server/common/helpers/notebooks/default_notebook_schema';
import { getSampleNotebooks } from '../../../server/common/helpers/notebooks/sample_notebooks';

export function fetchNotebooks(
  savedObjectNotebooks: Array<SavedObjectsFindResult<NotebooksSavedObjectAttributes>>
) {
  const notebooks: any[] = [];
//   console.log(savedObjectNotebooks)
  savedObjectNotebooks.map(
    (savedObject) => {
        console.log(savedObject)
      if (savedObject.type === 'observability-notebook' && savedObject.attributes.savedNotebook) {
        notebooks.push({
          dateCreated: savedObject.attributes.savedNotebook.dateCreated,
          dateModified: savedObject.attributes.savedNotebook.dateModified,
          path: savedObject.attributes.savedNotebook.path,
          id: savedObject.id,
        });
      }
    }
  );

  return notebooks;
}

export function createNotebook(notebookName: { name: string }) {
  const noteObject = {
    dateCreated: new Date().toISOString(),
    name: notebookName.name,
    dateModified: new Date().toISOString(),
    backend: 'Default',
    paragraphs: [],
    path: notebookName.name,
  };

  return {
    savedNotebook: noteObject,
  };
}

export function cloneNotebook(fetchedNotebook: DefaultNotebooks, name: string) {
  const noteObject = {
    dateCreated: new Date().toISOString(),
    name: name,
    dateModified: new Date().toISOString(),
    backend: fetchedNotebook.backend,
    paragraphs: fetchedNotebook.paragraphs,
    path: name,
  };

  return {
    savedNotebook: noteObject,
  };
}

export function renameNotebook(noteBookObj: { name: string; noteId: string }) {
  const noteObject = {
    name: noteBookObj.name,
    dateModified: new Date().toISOString(),
    path: noteBookObj.name,
  };

  return {
    savedNotebook: noteObject,
  };
}

export async function addSampleNotes(opensearchNotebooksClient: SavedObjectsClientContract, visIds: string[]) {
    let notebooks = getSampleNotebooks(visIds);
    const sampleNotebooks: any[] = [];
    
    for (const item of notebooks) {
      let createdNotebooks = await opensearchNotebooksClient.create(NOTEBOOK_SAVED_OBJECT, item);
      console.log(createdNotebooks.attributes.savedNotebook.name);
      sampleNotebooks.push({
        dateCreated: createdNotebooks.attributes.savedNotebook.dateCreated,
        dateModified: createdNotebooks.attributes.savedNotebook.dateModified,
        name: createdNotebooks.attributes.savedNotebook.name,
        id: createdNotebooks.id,
      });
    }
    
    console.log(sampleNotebooks);
    return { status: 'OK', message: '', body: sampleNotebooks };
  }