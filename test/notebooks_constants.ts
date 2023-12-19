/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
export const addCodeBlockResponse = {
  id: 'paragraph_044d9850-b0b2-4034-8590-6d845c65d1a7',
  dateCreated: '2023-12-18T06:27:34.320Z',
  dateModified: '2023-12-18T06:27:34.320Z',
  input: { inputType: 'MARKDOWN', inputText: '' },
  output: [{ outputType: 'MARKDOWN', result: '', execution_time: '0s' }],
};

export const runCodeBlockResponse = {
  output: [{ outputType: 'MARKDOWN', result: '\n\nhello', execution_time: '0.939 ms' }],
  input: { inputText: '%md \n\nhello', inputType: 'MARKDOWN' },
  dateCreated: '2023-12-18T22:13:39.627Z',
  dateModified: '2023-12-18T22:17:24.853Z',
  id: 'paragraph_7713f4d5-c3b2-406d-9f06-99a1fe0251f3',
};

export const codePlaceholderText =
  'Type %md, %sql or %ppl on the first line to define the input type. Code block starts here.';

export const codeBlockNotebook = {
  path: 'sample-notebook-1',
  dateCreated: '2023-12-14T18:49:43.375Z',
  dateModified: '2023-12-18T23:40:59.500Z',
  paragraphs: [
    {
      output: [{ result: 'hello', outputType: 'MARKDOWN', execution_time: '0.018 ms' }],
      input: { inputText: '%md\nhello', inputType: 'MARKDOWN' },
      dateCreated: '2023-12-18T23:38:50.848Z',
      dateModified: '2023-12-18T23:39:12.265Z',
      id: 'paragraph_de00ea2d-a8fb-45d1-8085-698f51c6b6be',
    },
  ],
};

export const clearOutputNotebook = {
  paragraphs: [
    {
      output: [],
      input: { inputText: '%md\nhello', inputType: 'MARKDOWN' },
      dateCreated: '2023-12-18T23:38:50.848Z',
      dateModified: '2023-12-18T23:39:12.265Z',
      id: 'paragraph_de00ea2d-a8fb-45d1-8085-698f51c6b6be',
    },
  ],
};

export const notebookPutResponse = {
  status: 'OK',
  message: { objectId: '69CpaYwBKIZhlDIhx-OK' },
};
