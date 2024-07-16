/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectsClientContract } from '../../../../../src/core/server/types';
import { NOTEBOOK_SAVED_OBJECT } from '../../../common/types/observability_saved_object_attributes';
import { DefaultNotebooks } from '../../../server/common/helpers/notebooks/default_notebook_schema';
import { getSampleNotebooks } from '../../../server/common/helpers/notebooks/sample_notebooks';

export function fetchNotebooks(savedObjectNotebooks: []) {
  const notebooks = [];
  savedObjectNotebooks.map((savedObject) => {
    if (savedObject.type === 'observability-notebook' && savedObject.attributes.savedNotebook) {
      notebooks.push({
        dateCreated: savedObject.attributes.savedNotebook.dateCreated,
        dateModified: savedObject.attributes.savedNotebook.dateModified,
        path: savedObject.attributes.savedNotebook.name,
        id: savedObject.id,
      });
    }
  });

  return notebooks;
}

export function createNotebook(notebookName: { name: string }) {
  const noteObject = {
    dateCreated: new Date().toISOString(),
    name: notebookName.name,
    dateModified: new Date().toISOString(),
    backend: '.kibana_1.0',
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
    name,
    dateModified: new Date().toISOString(),
    backend: 'kibana_1.0',
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

export async function addSampleNotes(
  opensearchNotebooksClient: SavedObjectsClientContract,
  visIds: string[]
) {
  const notebooks = getSampleNotebooks(visIds);
  const sampleNotebooks = [];
  try {
    for (const item of notebooks) {
      const createdNotebooks = await opensearchNotebooksClient.create(NOTEBOOK_SAVED_OBJECT, item);
      sampleNotebooks.push({
        dateCreated: createdNotebooks.attributes.savedNotebook.dateCreated,
        dateModified: createdNotebooks.attributes.savedNotebook.dateModified,
        name: createdNotebooks.attributes.savedNotebook.name,
        id: createdNotebooks.id,
        path: createdNotebooks.attributes.savedNotebook.name,
      });
    }

    return { status: 'OK', message: '', body: sampleNotebooks };
  } catch (error) {
    console.log('error', error);
    throw new Error('Update Sample Notebook error' + error);
  }
}
