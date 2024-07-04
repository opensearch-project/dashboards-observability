import { v4 as uuid } from 'uuid';
import { SavedObjectsClientContract } from '../../../../../src/core/server/types';
import { NOTEBOOK_SAVED_OBJECT } from '../../../common/types/observability_saved_object_attributes';
import {
  DefaultOutput,
  DefaultParagraph
} from '../../common/helpers/notebooks/default_notebook_schema';

export function createNotebook(paragraphInput: string, inputType: string){
  try {
      let paragraphType = 'MARKDOWN';
      if (inputType === 'VISUALIZATION') {
        paragraphType = 'VISUALIZATION';
      }
      if (inputType === 'OBSERVABILITY_VISUALIZATION') {
        paragraphType = 'OBSERVABILITY_VISUALIZATION';
      }
      if (paragraphInput.substring(0, 3) === '%sql' || paragraphInput.substring(0, 3) === '%ppl') {
        paragraphType = 'QUERY';
      }
      const inputObject = {
        inputType: paragraphType,
        inputText: paragraphInput,
      };
      const outputObjects: DefaultOutput[] = [
        {
          outputType: paragraphType,
          result: '',
          execution_time: '0s',
        },
      ];
      const newParagraph = {
        id: 'paragraph_' + uuid(),
        dateCreated: new Date().toISOString(),
        dateModified: new Date().toISOString(),
        input: inputObject,
        output: outputObjects,
      };

      return newParagraph;
    } catch (error) {
      throw new Error('Create Paragraph Error:' + error);
    }
    
}

export async function fetchNotebook(noteId: string, opensearchNotebooksClient: SavedObjectsClientContract) {
  const notebook = await opensearchNotebooksClient.get(NOTEBOOK_SAVED_OBJECT, noteId)
  return notebook
}

export async function createParagraphs(params: { noteId: string; paragraphIndex: number; paragraphInput: string; inputType: string }, opensearchNotebooksClient: SavedObjectsClientContract) {

  
  const notebookinfo = await fetchNotebook(params.noteId, opensearchNotebooksClient)
  console.log(notebookinfo)
  const paragraphs = notebookinfo.attributes.savedNotebook.paragraphs
  const newParagraph = createNotebook(params.paragraphInput, params.inputType)
  paragraphs.splice(params.paragraphIndex, 0, newParagraph);
  const updateNotebook = {
    paragraphs,
    dateModified: new Date().toISOString(),
  };
  const updatedNotebooks = await opensearchNotebooksClient.update(NOTEBOOK_SAVED_OBJECT, params.noteId, updateNotebook)
  console.log(updatedNotebooks)
  const notebook = await fetchNotebook(params.noteId, opensearchNotebooksClient)
  console.log(notebook)
  return newParagraph
}

export async function clearParagraphs(params: { noteId: string }, opensearchNotebooksClient: SavedObjectsClientContract){
  const notebookinfo = await fetchNotebook(params.noteId, opensearchNotebooksClient)
  const updatedparagraphs: DefaultParagraph[] = [];
  notebookinfo.attributes.savedNotebook.paragraphs.map(
    (paragraph: DefaultParagraph, index: number) => {
      const updatedParagraph = { ...paragraph };
      updatedParagraph.output = [];
      updatedparagraphs.push(updatedParagraph);
    }
  );
  const updateNotebook = {
    paragraphs: updatedparagraphs,
    dateModified: new Date().toISOString(),
  };
  await opensearchNotebooksClient.update(NOTEBOOK_SAVED_OBJECT, params.noteId, updateNotebook)
  return { paragraphs: updatedparagraphs };
}

export async function deleteParagraphs(params: { noteId: string , paragraphId: string | undefined }, opensearchNotebooksClient: SavedObjectsClientContract){
  const notebookinfo = await fetchNotebook(params.noteId, opensearchNotebooksClient)
  const updatedparagraphs: DefaultParagraph[] = [];
  if (params.paragraphId !== undefined) {
    notebookinfo.attributes.savedNotebook.paragraphs.map(
      (paragraph: DefaultParagraph, index: number) => {
        if (paragraph.id !== params.paragraphId) {
          updatedparagraphs.push(paragraph);
        }
      }
    );
  }

  const updateNotebook = {
    paragraphs: updatedparagraphs,
    dateModified: new Date().toISOString(),
  };
  await opensearchNotebooksClient.update(NOTEBOOK_SAVED_OBJECT, params.noteId, updateNotebook)
  return { paragraphs: updatedparagraphs };
}