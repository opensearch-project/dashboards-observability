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
  EuiPanel,
  EuiText,
} from '@elastic/eui';
import { ResponseError } from '@opensearch-project/opensearch/lib/errors';
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RAW_QUERY } from '../../../../../common/constants/explorer';
import { QUERY_ASSIST_API } from '../../../../../common/constants/query_assist';
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

export const QueryAssistInput: React.FC<Props> = (props) => {
  // @ts-ignore
  const queryRedux = useSelector(selectQueries)[props.tabId];
  // @ts-ignore
  const explorerData = useSelector(selectQueryResult)[props.tabId];
  // @ts-ignore
  const summaryData = useSelector(selectQueryAssistantSummarization)[props.tabId];

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
      await request();
    } catch (error) {
      coreRefs.toasts?.addError(formatError(error as ResponseError), {
        title: 'Failed to generate results',
      });
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
    } catch (error) {
      coreRefs.toasts?.addError(formatError(error as ResponseError), {
        title: 'Failed to summarize results',
      });
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
      setGeneratingOrRunning(true);
      await request();
      await props.handleTimePickerChange([QUERY_ASSIST_START_TIME, 'now']);
      await props.handleTimeRangePickerRefresh(undefined, true);
    } catch (error) {
      if (coreRefs.summarizeEnabled) {
        generateSummary({ isError: true, response: JSON.stringify((error as ResponseError).body) });
      } else {
        coreRefs.toasts?.addError(formatError(error as ResponseError), {
          title: 'Failed to generate results',
        });
      }
    } finally {
      setGeneratingOrRunning(false);
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
                      {HARDCODED_SUGGESTIONS[props.selectedIndex[0]?.label]?.map((question) => (
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
                    isDisabled={
                      generating || generatingOrRunning || props.nlqInput.trim().length === 0
                    }
                    iconSide="right"
                    fill={false}
                    data-test-subj="query-assist-generate-button"
                  >
                    Generate query
                  </EuiButton>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton
                    isLoading={generatingOrRunning}
                    onClick={runAndSummarize}
                    isDisabled={
                      generating || generatingOrRunning || props.nlqInput.trim().length === 0
                    }
                    iconType="returnKey"
                    iconSide="right"
                    type="submit"
                    fill={barSelected}
                    data-test-subj="query-assist-generate-and-run-button"
                  >
                    Generate and run
                  </EuiButton>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiForm>
      </EuiPanel>
    </>
  );
};
