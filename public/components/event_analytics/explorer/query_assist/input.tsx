/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiSmallButton,
  EuiComboBoxOptionOption,
  EuiCompressedFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiInputPopover,
  EuiListGroup,
  EuiListGroupItem,
  EuiSpacer,
  EuiSplitButton,
  EuiText,
} from '@elastic/eui';
import { ResponseError } from '@opensearch-project/opensearch/lib/errors';
import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RAW_QUERY } from '../../../../../common/constants/explorer';
import { ERROR_DETAILS, QUERY_ASSIST_API } from '../../../../../common/constants/query_assist';
import {
  QUERY_ASSIST_END_TIME,
  QUERY_ASSIST_START_TIME,
} from '../../../../../common/constants/shared';
import { getOSDHttp } from '../../../../../common/utils';
import { coreRefs } from '../../../../framework/core_refs';
import chatLogo from '../../../datasources/icons/query-assistant-logo.svg';
import {
  changeSummary,
  resetSummary,
  selectQueryAssistantSummarization,
  setLoading,
  setResponseForSummaryStatus,
} from '../../redux/slices/query_assistant_summarization_slice';
import { reset, selectQueryResult } from '../../redux/slices/query_result_slice';
import { changeQuery, selectQueries } from '../../redux/slices/query_slice';
import {
  EmptyIndexCallOut,
  EmptyQueryCallOut,
  PPLGeneratedCallOut,
  ProhibitedQueryCallOut,
} from './callouts';

class ProhibitedQueryError extends Error {
  constructor(message?: string) {
    super(message);
  }
}

const formatError = (error: ResponseError | Error): Error => {
  if ('body' in error) {
    if (error.body.statusCode === 429)
      return {
        ...error.body,
        message: 'Request is throttled. Try again later or contact your administrator',
      } as Error;
    if (
      error.body.statusCode === 400 &&
      error.body.message.includes(ERROR_DETAILS.GUARDRAILS_TRIGGERED)
    )
      return new ProhibitedQueryError(error.body.message);
    return error.body as Error;
  }
  return error;
};

interface SummarizationContext {
  question: string;
  query?: string;
  response: string;
  index: string;
  isError: boolean;
}

interface Props {
  handleQueryChange: (query: string) => void;
  handleTimeRangePickerRefresh: (availability?: boolean, setSummaryStatus?: boolean) => void;
  handleTimePickerChange: (timeRange: string[]) => Promise<void>;
  tabId: string;
  setNeedsUpdate: any;
  selectedIndex: Array<EuiComboBoxOptionOption<string | number | string[] | undefined>>;
  nlqInput: string;
  setNlqInput: React.Dispatch<React.SetStateAction<string>>;
  lastFocusedInput: 'query_area' | 'nlq_input';
  setLastFocusedInput: React.Dispatch<React.SetStateAction<'query_area' | 'nlq_input'>>;
  callOut: React.ReactNode | null;
  setCallOut: React.Dispatch<React.SetStateAction<React.ReactNode | null>>;
  runChanges: () => void;
}

const HARDCODED_SUGGESTIONS: Record<string, string[]> = {
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

export const QueryAssistInput: React.FC<React.PropsWithChildren<Props>> = (props) => {
  // @ts-ignore
  const queryRedux = useSelector(selectQueries)[props.tabId];
  // @ts-ignore
  const explorerData = useSelector(selectQueryResult)[props.tabId];
  // @ts-ignore
  const summaryData = useSelector(selectQueryAssistantSummarization)[props.tabId];
  const [generatingPPL, setGeneratingPPL] = useState(false);
  const loading = summaryData.loading || generatingPPL;
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedIndex = props.selectedIndex[0]?.label || '';

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  useEffect(() => {
    if (
      props.nlqInput.trim().length === 0 ||
      (summaryData.responseForSummaryStatus !== 'success' &&
        summaryData.responseForSummaryStatus !== 'failure')
    )
      return;
    void (async () => {
      await dispatch(
        changeSummary({
          tabId: props.tabId,
          data: {
            summaryLoading: false,
          },
        })
      );
      if (explorerData.total > 0 || summaryData.responseForSummaryStatus === 'failure')
        generateSummary();
    })();
  }, [summaryData.responseForSummaryStatus]);

  const dispatch = useDispatch();

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  // below is only used for url redirection
  const [autoRun, setAutoRun] = useState(false);
  const dismissCallOut = () => props.setCallOut(null);

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
    const generatedPPL = await getOSDHttp().post(QUERY_ASSIST_API.GENERATE_PPL, {
      body: JSON.stringify({
        question: props.nlqInput,
        index: selectedIndex,
      }),
    });
    await props.handleQueryChange(generatedPPL);
    await dispatch(
      changeQuery({
        tabId: props.tabId,
        query: {
          [RAW_QUERY]: generatedPPL,
        },
      })
    );
    props.setCallOut(<PPLGeneratedCallOut onDismiss={dismissCallOut} />);
    return generatedPPL;
  };

  // used by generate query button
  const generatePPL = async () => {
    dispatch(reset({ tabId: props.tabId }));
    dispatch(resetSummary({ tabId: props.tabId }));
    if (!selectedIndex) {
      props.setCallOut(<EmptyIndexCallOut onDismiss={dismissCallOut} />);
      return;
    }
    if (props.nlqInput.trim().length === 0) {
      props.setCallOut(<EmptyQueryCallOut onDismiss={dismissCallOut} />);
      return;
    }
    try {
      setGeneratingPPL(true);
      dismissCallOut();
      await request();
    } catch (err) {
      const error = formatError(err);
      if (error instanceof ProhibitedQueryError) {
        props.setCallOut(<ProhibitedQueryCallOut onDismiss={dismissCallOut} />);
        return;
      }
      coreRefs.toasts?.addError(error, { title: 'Failed to generate results' });
    } finally {
      setGeneratingPPL(false);
    }
  };
  const generateSummary = async (context?: Partial<SummarizationContext>) => {
    if (!coreRefs.summarizeEnabled) return;
    try {
      const isError = summaryData.responseForSummaryStatus === 'failure';
      const summarizationContext: SummarizationContext = {
        question: props.nlqInput,
        index: selectedIndex,
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
      }>(QUERY_ASSIST_API.SUMMARIZE, {
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
    } catch (err) {
      const error = formatError(err);
      if (error instanceof ProhibitedQueryError) {
        props.setCallOut(<ProhibitedQueryCallOut onDismiss={dismissCallOut} />);
        return;
      }
      coreRefs.toasts?.addError(error, { title: 'Failed to summarize results' });
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
    if (!selectedIndex) {
      props.setCallOut(<EmptyIndexCallOut onDismiss={dismissCallOut} />);
      return;
    }
    if (props.nlqInput.trim().length === 0) {
      props.setCallOut(<EmptyQueryCallOut onDismiss={dismissCallOut} />);
      return;
    }
    try {
      dispatch(setLoading({ tabId: props.tabId, loading: true }));
      dismissCallOut();
      setGeneratingPPL(true);
      await request();
      setGeneratingPPL(false);
      await props.handleTimePickerChange([QUERY_ASSIST_START_TIME, QUERY_ASSIST_END_TIME]);
      await props.handleTimeRangePickerRefresh(undefined, true);
    } catch (err) {
      const error = formatError(err);
      if (error instanceof ProhibitedQueryError) {
        props.setCallOut(<ProhibitedQueryCallOut onDismiss={dismissCallOut} />);
        return;
      }
      if (coreRefs.summarizeEnabled) {
        generateSummary({ isError: true, response: JSON.stringify(error) });
      } else {
        coreRefs.toasts?.addError(error, { title: 'Failed to generate results' });
      }
    } finally {
      setGeneratingPPL(false);
      dispatch(setLoading({ tabId: props.tabId, loading: false }));
    }
  };

  return (
    <>
      <EuiFlexGroup gutterSize="none" alignItems="center" justifyContent="center">
        <EuiFlexItem grow={false}>
          <EuiIcon
            className="euiFieldText"
            style={{ padding: 8 }}
            size="original"
            type={chatLogo}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiInputPopover
            input={
              <EuiCompressedFieldText
                inputRef={inputRef}
                placeholder="Ask me a question"
                disabled={loading}
                value={props.nlqInput}
                onChange={(e) => {
                  props.setNlqInput(e.target.value);
                  dismissCallOut();
                }}
                onKeyDown={(e) => {
                  // listen to enter key manually. the cursor jumps to CodeEditor with EuiForm's onSubmit
                  if (e.key === 'Enter') runAndSummarize();
                }}
                fullWidth
                onFocus={() => {
                  props.setNeedsUpdate(false);
                  props.setLastFocusedInput('nlq_input');
                  if (props.nlqInput.length === 0) setIsPopoverOpen(true);
                }}
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
              {HARDCODED_SUGGESTIONS[selectedIndex]?.map((question, i) => (
                <EuiListGroupItem
                  key={i}
                  onClick={() => {
                    props.setNlqInput(question);
                    inputRef.current?.focus();
                    setIsPopoverOpen(false);
                  }}
                  label={question}
                />
              ))}
            </EuiListGroup>
          </EuiInputPopover>
        </EuiFlexItem>
      </EuiFlexGroup>
      {props.callOut}
      <EuiSpacer size="s" />
      {props.children}
      <EuiSpacer size="m" />
      {props.lastFocusedInput === 'query_area' ? (
        <EuiSmallButton
          fill
          isLoading={loading}
          onClick={props.runChanges}
          iconType="play"
          style={{ height: 44 }}
        >
          Run
        </EuiSmallButton>
      ) : (
        <EuiSplitButton
          disabled={loading}
          isLoading={loading}
          // @ts-ignore incorrect type in Oui 1.5, 'disabled' is a valid color
          color={loading ? 'disabled' : 'success'}
          data-test-subj="query-assist-generate-and-run-button"
          options={[
            {
              display: (
                <EuiText data-test-subj="query-assist-generate-button">Generate query</EuiText>
              ),
              onClick: generatePPL,
            },
          ]}
          onClick={runAndSummarize}
        >
          {loading ? 'Running...' : 'Generate and run'}
        </EuiSplitButton>
      )}
    </>
  );
};
