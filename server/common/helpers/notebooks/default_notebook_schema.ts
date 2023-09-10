/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Default Backend Notebook Schema

export interface DefaultInput {
  inputType: string;
  inputText: string;
}

export interface DefaultOutput {
  outputType: string;
  result: string;
  execution_time: string;
}
export interface DefaultParagraph {
  id: string;
  dateCreated: string;
  dateModified: string;
  input: DefaultInput;
  output: DefaultOutput[];
}
export interface DefaultNotebooks {
  name: string;
  dateCreated: string;
  dateModified: string;
  backend: string;
  paragraphs: DefaultParagraph[];
}
