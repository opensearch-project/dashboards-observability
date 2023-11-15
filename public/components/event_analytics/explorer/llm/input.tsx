/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiBadge,
  EuiButton,
  EuiComboBox,
  EuiComboBoxOptionOption,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiIcon,
  EuiModal,
  EuiPanel,
  EuiText,
} from '@elastic/eui';
import { CatIndicesResponse } from '@opensearch-project/opensearch/api/types';
import React, { Reducer, useEffect, useReducer, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { IndexPatternAttributes } from '../../../../../../../src/plugins/data/common';
import { RAW_QUERY } from '../../../../../common/constants/explorer';
import { CONSOLE_PROXY, DSL_BASE, DSL_CAT } from '../../../../../common/constants/shared';
import { getOSDHttp } from '../../../../../common/utils';
import { coreRefs } from '../../../../framework/core_refs';
import chatLogo from '../../../datasources/icons/query-assistant-logo.svg';
import { changeQuery } from '../../redux/slices/query_slice';
import { FeedbackFormData, FeedbackModalContent } from './feedback_modal';
import { changeSummary } from '../../redux/slices/query_assistant_summarization_slice';

interface SummarizationContext {
  question: string;
  query?: string;
  response: string;
  index: string;
  isError: boolean;
}

interface Props {
  handleQueryChange: (query: string) => void;
  handleTimeRangePickerRefresh: () => void;
  tabId: string;
  setNeedsUpdate: any;
  selectedIndex: EuiComboBoxOptionOption<string | number | string[] | undefined>[];
}
export const LLMInput: React.FC<Props> = (props) => {
  const [barSelected, setBarSelected] = useState(false);

  const dispatch = useDispatch();
  const questionRef = useRef<HTMLInputElement>(null);

  const [generating, setGenerating] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackFormData, setFeedbackFormData] = useState<FeedbackFormData>({
    input: '',
    output: '',
    correct: undefined,
    expectedOutput: '',
    comment: '',
  });

  useEffect(() => {
    if (questionRef.current) {
      questionRef.current.value = 'Are there any errors in my logs?';
    }
  }, []);

  // hide if not in a tab
  if (props.tabId === '') return <>{props.children}</>;

  const request = async () => {
    if (!props.selectedIndex.length) return;
    let generatedPPL: string = '';
    let generatePPLError: string | undefined;
    try {
      setGenerating(true);
      generatedPPL = await getOSDHttp().post('/api/assistant/generate_ppl', {
        body: JSON.stringify({
          question: questionRef.current?.value,
          index: props.selectedIndex[0].label,
        }),
      });
      setFeedbackFormData({
        ...feedbackFormData,
        input: questionRef.current?.value || '',
        output: generatedPPL,
      });
      await props.handleQueryChange(generatedPPL);
      await dispatch(
        changeQuery({
          tabId: props.tabId,
          data: {
            [RAW_QUERY]: generatedPPL,
          },
        })
      );
      await props.handleTimeRangePickerRefresh();
    } catch (error) {
      setFeedbackFormData({
        ...feedbackFormData,
        input: questionRef.current?.value || '',
      });
      generatePPLError = String(error.body);
    } finally {
      setGenerating(false);
    }
    try {
      const summarizationContext: SummarizationContext = {
        question: questionRef.current?.value || 'unable to retrieve question',
        index: props.selectedIndex[0].label,
        isError: false,
        response: '',
      };
      await dispatch(
        changeSummary({
          tabId: props.tabId,
          data: {
            summaryLoading: true,
          },
        })
      );
      if (generatePPLError === undefined) {
        const queryResponse = await getOSDHttp()
          .post(CONSOLE_PROXY, {
            body: JSON.stringify({ query: generatedPPL }),
            query: { path: '_plugins/_ppl', method: 'POST' },
          })
          .then((resp) => {
            dispatch(
              changeSummary({
                tabId: props.tabId,
                data: {
                  isPPLError: false,
                },
              })
            );
            return resp;
          })
          .catch((error) => {
            dispatch(
              changeSummary({
                tabId: props.tabId,
                data: {
                  isPPLError: true,
                },
              })
            );
            summarizationContext.isError = true;
            return String(JSON.parse(error.body).error.details);
          });
        summarizationContext.response = JSON.stringify(queryResponse);
        summarizationContext.query = generatedPPL;
      } else {
        summarizationContext.isError = true;
        summarizationContext.response = generatePPLError;
      }
      const summarized = await getOSDHttp().post('/api/assistant/summarize', {
        body: JSON.stringify(summarizationContext),
      });
      await dispatch(
        changeSummary({
          tabId: props.tabId,
          data: {
            summary: summarized,
          },
        })
      );
    } catch (error) {
      coreRefs.toasts?.addError(error.body, { title: 'Failed to summarize results' });
    } finally {
      await dispatch(
        changeSummary({
          tabId: props.tabId,
          data: {
            summaryLoading: false,
          },
        })
      );
    }
  };

  return (
    <>
      <EuiPanel paddingSize="s">
        <EuiForm
          component="form"
          id="nlq-form"
          onSubmit={(e) => {
            e.preventDefault();
            request();
          }}
        >
          <EuiFlexGroup alignItems="center" gutterSize="s">
            <EuiFlexItem grow={false}>
              <EuiIcon type={chatLogo} size="l" />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge>New!</EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiFieldText
                placeholder="Ask a question"
                // prepend={['Question']}
                disabled={generating}
                fullWidth
                inputRef={questionRef}
                onFocus={() => {
                  setBarSelected(true);
                  props.setNeedsUpdate(false);
                }}
                onBlur={() => setBarSelected(false)}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                isLoading={generating}
                onClick={request}
                type="submit"
                iconType="returnKey"
                iconSide="right"
                fill={barSelected}
                style={{ width: 170 }}
              >
                Generate query
              </EuiButton>
            </EuiFlexItem>
            {/* <EuiFlexItem grow={false}>
                <EuiButton
                  onClick={() => setIsFeedbackOpen(true)}
                  iconType="faceHappy"
                  iconSide="right"
                >
                  Feedback
                </EuiButton>
              </EuiFlexItem> */}
          </EuiFlexGroup>
        </EuiForm>
        {isFeedbackOpen && (
          <EuiModal onClose={() => setIsFeedbackOpen(false)}>
            <FeedbackModalContent
              metadata={{ type: 'event_analytics', selectedIndex: props.selectedIndex[0].label }}
              formData={feedbackFormData}
              setFormData={setFeedbackFormData}
              onClose={() => setIsFeedbackOpen(false)}
              displayLabels={{
                correct: 'Did the results from the generated query answer your question?',
              }}
            />
          </EuiModal>
        )}
      </EuiPanel>
    </>
  );
};

interface State<T> {
  data?: T;
  loading: boolean;
  error?: Error;
}

type Action<T> =
  | { type: 'request' }
  | { type: 'success'; payload: State<T>['data'] }
  | { type: 'failure'; error: NonNullable<State<T>['error']> };

// TODO use instantiation expressions when typescript is upgraded to >= 4.7
export type GenericReducer<T = any> = Reducer<State<T>, Action<T>>;
export const genericReducer: GenericReducer = (state, action) => {
  switch (action.type) {
    case 'request':
      return { data: state.data, loading: true };
    case 'success':
      return { loading: false, data: action.payload };
    case 'failure':
      return { loading: false, error: action.error };
    default:
      return state;
  }
};

export const useCatIndices = () => {
  const reducer: GenericReducer<EuiComboBoxOptionOption[]> = genericReducer;
  const [state, dispatch] = useReducer(reducer, { loading: false });
  const [refresh, setRefresh] = useState({});

  useEffect(() => {
    const abortController = new AbortController();
    dispatch({ type: 'request' });
    getOSDHttp()
      .get(`${DSL_BASE}${DSL_CAT}`, { query: { format: 'json' }, signal: abortController.signal })
      .then((payload: CatIndicesResponse) =>
        dispatch({ type: 'success', payload: payload.map((meta) => ({ label: meta.index! })) })
      )
      .catch((error) => dispatch({ type: 'failure', error }));

    return () => abortController.abort();
  }, [refresh]);

  return { ...state, refresh: () => setRefresh({}) };
};

export const useGetIndexPatterns = () => {
  const reducer: GenericReducer<EuiComboBoxOptionOption[]> = genericReducer;
  const [state, dispatch] = useReducer(reducer, { loading: false });
  const [refresh, setRefresh] = useState({});

  useEffect(() => {
    let abort = false;
    dispatch({ type: 'request' });

    coreRefs
      .savedObjectsClient!.find<IndexPatternAttributes>({ type: 'index-pattern', perPage: 10000 })
      .then((payload) => {
        if (!abort)
          dispatch({
            type: 'success',
            payload: payload.savedObjects.map((meta) => ({ label: meta.attributes.title })),
          });
      })
      .catch((error) => {
        if (!abort) dispatch({ type: 'failure', error });
      });

    return () => {
      abort = true;
    };
  }, [refresh]);

  return { ...state, refresh: () => setRefresh({}) };
};

export const SubmitPPLButton: React.FC<{ pplQuery: string }> = (props) => {
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [submitFormData, setSubmitFormData] = useState<FeedbackFormData>({
    input: props.pplQuery,
    output: '',
    correct: true,
    expectedOutput: '',
    comment: '',
  });

  useEffect(() => {
    setSubmitFormData({
      input: props.pplQuery,
      output: '',
      correct: true,
      expectedOutput: '',
      comment: '',
    });
  }, [props.pplQuery]);

  return (
    <>
      <EuiButton iconType="faceHappy" iconSide="right" onClick={() => setIsSubmitOpen(true)}>
        Submit PPL Query
      </EuiButton>
      {isSubmitOpen && (
        <EuiModal onClose={() => setIsSubmitOpen(false)}>
          <FeedbackModalContent
            metadata={{ type: 'ppl_submit' }}
            formData={submitFormData}
            setFormData={setSubmitFormData}
            onClose={() => setIsSubmitOpen(false)}
            displayLabels={{
              formHeader: 'Submit PPL Query',
              input: 'Your PPL Query',
              inputPlaceholder: 'PPL Query',
              output: 'Please write a Natural Language Question for the above Query',
              outputPlaceholder: 'Natural Language Question',
            }}
          />
        </EuiModal>
      )}
    </>
  );
};
