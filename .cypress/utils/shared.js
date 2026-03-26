/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared utility functions for observability Cypress tests
 */

/**
 * Generates a randomized workspace name
 * @param {string} prefix - Optional prefix for the workspace name
 * @returns {string} Randomized workspace name
 */
export const getRandomizedWorkspaceName = (prefix = 'test-ws') => {
  return `${prefix}-${Math.random().toString(36).substring(7)}`;
};

/**
 * Generates a randomized dataset ID
 * @param {string} prefix - Optional prefix for the dataset ID
 * @returns {string} Randomized dataset ID
 */
export const getRandomizedDatasetId = (prefix = 'dataset') => {
  return `${prefix}-${Math.random().toString(36).substring(7)}`;
};

/**
 * Formats a date for use in Cypress date picker
 * @param {Date} date - Date object to format
 * @returns {string} Formatted date string (e.g., "Mar 25, 2026 @ 10:30:45.123")
 */
export const formatDateForPicker = (date) => {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} @ ${String(
    date.getHours()
  ).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(
    date.getSeconds()
  ).padStart(2, '0')}.${String(date.getMilliseconds()).padStart(3, '0')}`;
};
