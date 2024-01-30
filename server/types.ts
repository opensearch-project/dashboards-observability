/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ObservabilityPluginSetup {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ObservabilityPluginStart {}

/**
 * Introduce a compile dependency on dashboards-assistant
 * as observerability need some types from the plugin.
 * It will gives an type error when dashboards-assistant is not installed so add a ts-ignore to suppress the error.
 */
// @ts-ignore
export type { AssistantPluginSetup, MessageParser } from "../../dashboards-assistant/server";
