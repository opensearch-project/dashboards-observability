/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Get the type of output and result in a default notebook paragraph
// Param: Default Backend Paragraph
const parseOutput = (paraObject: any) => {
  try {
    return {
      outputType: paraObject.output.map(({ outputType }) => outputType),
      outputData: paraObject.output.map(({ result }) => result),
    };
  } catch (error) {
    return {
      outputType: [],
      outputData: [],
    };
  }
};

// Get the coding language by type of paragraph
// Param: Default Backend Paragraph
const parseInputType = (paraObject: any) => {
  try {
    if (paraObject.input.inputType === 'MARKDOWN') {
      return 'md';
    } else {
      return '';
    }
  } catch (error) {
    throw new Error('Parsing Input Issue ' + error);
  }
};

// Get the visualization by type of paragraph
// Param: Default Backend Paragraph
const parseVisualization = (paraObject: any) => {
  try {
    if (paraObject.input.inputType.includes('VISUALIZATION')) {
      const vizContent = paraObject.input.inputText;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      let visStartTime = startDate.toISOString();
      let visEndTime = new Date().toISOString();
      let visSavedObjId = '';
      if (vizContent !== '') {
        const { panels, timeRange } = JSON.parse(vizContent);
        visStartTime = timeRange.from;
        visEndTime = timeRange.to;
        visSavedObjId = panels['1'].explicitInput.savedObjectId;
      }
      return {
        isViz: true,
        VizObject: vizContent,
        visStartTime,
        visEndTime,
        visSavedObjId,
      };
    } else {
      return {
        isViz: false,
        VizObject: '',
      };
    }
  } catch (error) {
    throw new Error('Parsing Input Issue ' + error);
  }
};

const parseBackendParagraph = (paraObject, index) => {
  const codeLanguage = parseInputType(paraObject);
  const vizParams = parseVisualization(paraObject);
  const message = parseOutput(paraObject);

  return {
    uniqueId: paraObject.id,
    isRunning: false,
    inQueue: false,
    isSelected: false,
    isInputHidden: false,
    isOutputHidden: false,
    showAddPara: false,
    isVizualisation: vizParams.isViz,
    vizObjectInput: vizParams.VizObject,
    id: index + 1,
    inp: paraObject.input.inputText || '',
    lang: 'text/x-' + codeLanguage,
    editorLanguage: codeLanguage,
    typeOut: message.outputType,
    out: message.outputData,
    isInputExpanded: false,
    isOutputStale: false,
    paraRef: undefined,
    paraDivRef: undefined,
    visStartTime: vizParams.visStartTime,
    visEndTime: vizParams.visEndTime,
    visSavedObjId: vizParams.visSavedObjId,
  };
};

// Placeholder for default parser
// Param: Default Backend Paragraph
export const defaultParagraphParser = (defaultBackendParagraphs: any) => {
  try {
    return defaultBackendParagraphs.map(parseBackendParagraph);
  } catch (error) {
    throw new Error('Parsing Paragraph Issue ' + error);
  }
};
