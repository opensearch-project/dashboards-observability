/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonIcon,
  EuiCallOut,
  EuiComboBoxOptionOption,
  EuiFieldText,
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
import { QUERY_ASSIST_START_TIME } from '../../../../../common/constants/shared';
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

class ProhibitedQueryError extends Error {
  constructor(message?: string) {
    super(message);
  }
}

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
  const inputRef = useRef<HTMLInputElement>(null);

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

  const [barSelected, setBarSelected] = useState(false);

  const dispatch = useDispatch();

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingOrRunning, setGeneratingOrRunning] = useState(false);
  // below is only used for url redirection
  const [autoRun, setAutoRun] = useState(false);
  const [prohibitedQuery, setProhibitedQuery] = useState(false);
  const submitDisabled = generating || props.nlqInput.trim().length === 0;

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
        index: props.selectedIndex[0].label,
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
    return generatedPPL;
  };
  const formatError = (error: ResponseError | Error): Error => {
    if ('body' in error) {
      if (error.body.statusCode === 429)
        return {
          ...error.body,
          message: 'Request is throttled. Try again later or contact your administrator',
        } as Error;
      if (
        error.body.statusCode === 400 &&
        error.body.message === ERROR_DETAILS.GUARDRAILS_TRIGGERED
      )
        return new ProhibitedQueryError(error.body.message);
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
      setProhibitedQuery(false);
      await request();
    } catch (err) {
      const error = formatError(err);
      if (error instanceof ProhibitedQueryError) {
        setProhibitedQuery(true);
        return;
      }
      coreRefs.toasts?.addError(error, { title: 'Failed to generate results' });
    } finally {
      setGenerating(false);
    }
  };
  const generateSummary = async (context?: Partial<SummarizationContext>) => {
    if (!coreRefs.summarizeEnabled) return;
    try {
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
        setProhibitedQuery(true);
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
    if (!props.selectedIndex.length) return;
    try {
      setGenerating(true);
      setGeneratingOrRunning(true);
      setProhibitedQuery(false);
      await request();
      await props.handleTimePickerChange([QUERY_ASSIST_START_TIME, 'now']);
      await props.handleTimeRangePickerRefresh(undefined, true);
    } catch (err) {
      const error = formatError(err);
      if (error instanceof ProhibitedQueryError) {
        setProhibitedQuery(true);
        return;
      }
      if (coreRefs.summarizeEnabled) {
        generateSummary({ isError: true, response: JSON.stringify(error) });
      } else {
        coreRefs.toasts?.addError(error, { title: 'Failed to generate results' });
      }
    } finally {
      setGenerating(false);
      setGeneratingOrRunning(false);
    }
  };

  return (
    <>
      <EuiFlexGroup gutterSize="s">
        <EuiFlexItem>
          <EuiInputPopover
            input={
              <EuiFieldText
                inputRef={inputRef}
                placeholder={
                  props.selectedIndex[0]?.label
                    ? `Ask a natural language question about ${props.selectedIndex[0].label} to generate a query`
                    : 'Select a data source or index to ask a question.'
                }
                disabled={generating}
                value={props.nlqInput}
                onChange={(e) => props.setNlqInput(e.target.value)}
                onKeyDown={(e) => {
                  // listen to enter key manually. the cursor jumps to CodeEditor with EuiForm's onSubmit
                  if (e.key === 'Enter') runAndSummarize();
                }}
                prepend={<EuiIcon type={chatLogo} />}
                fullWidth
                onFocus={() => {
                  props.setNeedsUpdate(false);
                  setBarSelected(true);
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
              {HARDCODED_SUGGESTIONS[props.selectedIndex[0]?.label]?.map((question) => (
                <EuiListGroupItem
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
        <EuiFlexItem grow={false}>
          <EuiButtonIcon
            iconType="returnKey"
            display="fill"
            isDisabled={submitDisabled}
            onClick={runAndSummarize}
            size="m"
            aria-label="submit-question"
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      {prohibitedQuery ? (
        <EuiCallOut
          data-test-subj="query-assist-guard-callout"
          title="I am unable to respond to this query. Try another question."
          size="s"
          color="danger"
          iconType="alert"
        />
      ) : props.children ? (
        <EuiSpacer size="s" />
      ) : null}
      {props.children}
      <EuiSpacer size="m" />
      <EuiSplitButton
        disabled={submitDisabled}
        isLoading={generating}
        fill={barSelected}
        // @ts-ignore incorrect type in Oui 1.5, 'disabled' is a valid color
        color={submitDisabled ? 'disabled' : 'success'}
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
        {generating && !generatingOrRunning ? 'Generate query' : 'Generate and run'}
      </EuiSplitButton>
    </>
  );
};
