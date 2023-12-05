/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiBadge,
  EuiButton,
  EuiComboBoxOptionOption,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiIcon,
  EuiInputPopover,
  EuiLink,
  EuiListGroup,
  EuiListGroupItem,
  EuiModal,
  EuiPanel,
  EuiText,
} from '@elastic/eui';
import { CatIndicesResponse } from '@opensearch-project/opensearch/api/types';
import { ResponseError } from '@opensearch-project/opensearch/lib/errors';
import React, { Reducer, useEffect, useReducer, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { IndexPatternAttributes } from '../../../../../../../src/plugins/data/common';
import { RAW_QUERY } from '../../../../../common/constants/explorer';
import { DSL_BASE, DSL_CAT } from '../../../../../common/constants/shared';
import { getOSDHttp } from '../../../../../common/utils';
import { coreRefs } from '../../../../framework/core_refs';
import chatLogo from '../../../datasources/icons/query-assistant-logo.svg';
import {
  changeSummary,
  resetSummary,
  selectQueryAssistantSummarization,
  setResponseForSummaryStatus,
} from '../../redux/slices/query_assistant_summarization_slice';
import { reset, selectQueryResult } from '../../redux/slices/query_result_slice';
import { changeQuery, selectQueries } from '../../redux/slices/query_slice';
import { FeedbackFormData, FeedbackModalContent } from './feedback_modal';

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
  selectedIndex: Array<EuiComboBoxOptionOption<string | number | string[] | undefined>>;
  nlqInput: string;
  setNlqInput: React.Dispatch<React.SetStateAction<string>>;
}
export const LLMInput: React.FC<Props> = (props) => {
  const queryRedux = useSelector(selectQueries)[props.tabId];
  const explorerData = useSelector(selectQueryResult)[props.tabId];
  const summaryData = useSelector(selectQueryAssistantSummarization)[props.tabId];

  useEffect(() => {
    if (
      summaryData.responseForSummaryStatus === 'success' ||
      summaryData.responseForSummaryStatus === 'failure'
    ) {
      void (async () => {
        await dispatch(
          changeSummary({
            tabId: props.tabId,
            data: {
              summaryLoading: false,
            },
          })
        );
        generateSummary();
      })();
    }
  }, [summaryData.responseForSummaryStatus]);

  // HARDCODED QUESTION SUGGESTIONS:
  const hardcodedSuggestions = {
    opensearch_dashboards_sample_data_ecommerce: [
      'How many unique customers placed orders this week?',
      'Count the number of orders grouped by manufacturer and category',
      'find customers with first names like Eddie',
    ],
    opensearch_dashboards_sample_data_logs: [
      'Are there any errors in my logs?',
      'How many requests were there grouped by response code last week?',
      "What's the average request size by week?",
    ],
    opensearch_dashboards_sample_data_flights: [
      'how many flights were there this week grouped by destination country?',
      'what were the longest flight delays this week?',
      'what carriers have the furthest flights?',
    ],
    'sso_logs-*.*': [
      'show me the most recent 10 logs',
      'how many requests were there grouped by status code',
      'how many request failures were there by week?',
    ],
  };

  const [barSelected, setBarSelected] = useState(false);

  const dispatch = useDispatch();

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingRun, setGeneratingRun] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  // below is only used for url redirection
  const [autoRun, setAutoRun] = useState(false);
  const [feedbackFormData, setFeedbackFormData] = useState<FeedbackFormData>({
    input: '',
    output: '',
    correct: undefined,
    expectedOutput: '',
    comment: '',
  });

  useEffect(() => {
    if (autoRun) {
      setAutoRun(false);
      runAndSummarize();
    } else if (queryRedux.ollyQueryAssistant.length > 0) {
      setAutoRun(true);
    }
  }, [queryRedux.ollyQueryAssistant]);

  // hide if not in a tab
  if (props.tabId === '') return <>{props.children}</>;

  // generic method for generating ppl from natural language
  const request = async () => {
    const generatedPPL = await getOSDHttp().post('/api/assistant/generate_ppl', {
      body: JSON.stringify({
        question: props.nlqInput,
        index: props.selectedIndex[0].label,
      }),
    });
    setFeedbackFormData({
      ...feedbackFormData,
      input: props.nlqInput,
      output: generatedPPL,
    });
    await props.handleQueryChange(generatedPPL);
    console.log('generatedPPL', generatedPPL);
    await dispatch(
      changeQuery({
        tabId: props.tabId,
        query: {
          [RAW_QUERY]: generatedPPL,
        },
      })
    );
    return generatedPPL;
  };
  const formatError = (error: ResponseError): Error => {
    if (error.body) {
      if (error.body.statusCode === 429)
        return {
          ...error.body,
          message: 'Request is throttled. Try again later or contact your administrator',
        } as Error;
      return error.body as Error;
    }
    return error;
  };
  // used by generate query button
  const generatePPL = async () => {
    dispatch(reset({ tabId: props.tabId }));
    dispatch(resetSummary({ tabId: props.tabId }));
    if (!props.selectedIndex.length) return;
    try {
      setGenerating(true);
      console.log('generated query is', await request());
    } catch (error) {
      setFeedbackFormData({
        ...feedbackFormData,
        input: props.nlqInput,
      });
      coreRefs.toasts?.addError(formatError(error), { title: 'Failed to generate results' });
    } finally {
      setGenerating(false);
    }
  };
  const generateSummary = async (context?: Partial<SummarizationContext>) => {
    try {
      if (explorerData.total > 0) {
        const isError = summaryData.responseForSummaryStatus === 'failure';
        const summarizationContext: SummarizationContext = {
          question: props.nlqInput,
          index: props.selectedIndex[0].label,
          isError,
          query: queryRedux.rawQuery,
          response: isError
            ? String(JSON.parse(explorerData.error.body.message).error.details)
            : JSON.stringify({
                datarows: explorerData.datarows,
                schema: explorerData.schema,
                size: explorerData.size,
                total: explorerData.total,
              }).slice(0, 7000),
          ...context,
        };
        await dispatch(
          changeSummary({
            tabId: props.tabId,
            data: {
              summaryLoading: true,
              isPPLError: isError,
            },
          })
        );
        const summary = await getOSDHttp().post<{
          summary: string;
          suggestedQuestions: string[];
        }>('/api/assistant/summarize', {
          body: JSON.stringify(summarizationContext),
        });
        await dispatch(
          changeSummary({
            tabId: props.tabId,
            data: {
              summary: summary.summary,
              suggestedQuestions: summary.suggestedQuestions,
            },
          })
        );
      }
    } catch (error) {
      coreRefs.toasts?.addError(formatError(error), { title: 'Failed to summarize results' });
    } finally {
      await dispatch(
        changeSummary({
          tabId: props.tabId,
          data: {
            summaryLoading: false,
          },
        })
      );
      dispatch(
        setResponseForSummaryStatus({
          tabId: props.tabId,
          responseForSummaryStatus: 'false',
        })
      );
    }
  };
  // used by generate and run button
  const runAndSummarize = async () => {
    dispatch(reset({ tabId: props.tabId }));
    dispatch(resetSummary({ tabId: props.tabId }));
    if (!props.selectedIndex.length) return;
    try {
      setGeneratingRun(true);
      await request();
      await props.handleTimeRangePickerRefresh(undefined, true);
    } catch (error) {
      setFeedbackFormData({
        ...feedbackFormData,
        input: props.nlqInput,
      });
      generateSummary({ isError: true, response: JSON.stringify(error.body) });
    } finally {
      setGeneratingRun(false);
    }
  };

  return (
    <>
      <EuiPanel paddingSize="m" color="subdued">
        <EuiForm
          component="form"
          id="nlq-form"
          onSubmit={(e) => {
            e.preventDefault();
            request();
          }}
        >
          <EuiFlexGroup direction="column" gutterSize="s">
            <EuiFlexItem grow={false}>
              <EuiFlexGroup alignItems="center" gutterSize="s">
                <EuiFlexItem grow={false}>
                  <EuiIcon type={chatLogo} size="l" />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText>Query Assistant</EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiBadge>New!</EuiBadge>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiInputPopover
                    input={
                      <EuiFieldText
                        placeholder="Ask a question"
                        // prepend={['Question']}
                        disabled={generating}
                        value={props.nlqInput}
                        onChange={(e) => props.setNlqInput(e.target.value)}
                        fullWidth
                        onFocus={() => {
                          setBarSelected(true);
                          props.setNeedsUpdate(false);
                          if (props.nlqInput.length === 0) setIsPopoverOpen(true);
                        }}
                        onBlur={() => setBarSelected(false)}
                      />
                    }
                    disableFocusTrap
                    fullWidth={true}
                    isOpen={isPopoverOpen}
                    closePopover={() => {
                      setIsPopoverOpen(false);
                    }}
                  >
                    <EuiListGroup flush={true} bordered={false} wrapText={true} maxWidth={false}>
                      {hardcodedSuggestions[props.selectedIndex[0]?.label]?.map((question) => (
                        <EuiListGroupItem
                          onClick={() => {
                            props.setNlqInput(question);
                            setIsPopoverOpen(false);
                          }}
                          label={question}
                        />
                      ))}
                    </EuiListGroup>
                  </EuiInputPopover>
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
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup alignItems="center" gutterSize="m">
                <EuiFlexItem>
                  <EuiText>
                    <small>
                      Share feedback via{' '}
                      <EuiLink href="https://forum.opensearch.org/t/feedback-opensearch-assistant/16741">
                        Forum
                      </EuiLink>{' '}
                      or{' '}
                      <EuiLink href="https://opensearch.slack.com/channels/assistant-feedback">
                        Slack
                      </EuiLink>
                    </small>
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton
                    isLoading={generating}
                    onClick={generatePPL}
                    isDisabled={generating || generatingRun}
                    iconSide="right"
                    fill={false}
                    style={{ width: 160 }}
                  >
                    Generate query
                  </EuiButton>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton
                    isLoading={generatingRun}
                    onClick={runAndSummarize}
                    isDisabled={generating || generatingRun}
                    iconType="returnKey"
                    iconSide="right"
                    type="submit"
                    fill={barSelected}
                    style={{ width: 175 }}
                  >
                    Generate and run
                  </EuiButton>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
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
