/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getPlatformDisplayName,
  getPlatformTypeFromEnvironment,
  toPrometheusLabel,
  PLATFORM_TYPE_MAP,
  isDependencyType,
  isDependencyPlaceholder,
  getNodeTypeLabel,
  normalizeNodeType,
} from '../platform_utils';

describe('platform_utils', () => {
  describe('getPlatformDisplayName', () => {
    it('should return display name for known platform types', () => {
      expect(getPlatformDisplayName('AWS::Lambda')).toBe('Lambda');
      expect(getPlatformDisplayName('AWS::EKS')).toBe('EKS');
      expect(getPlatformDisplayName('AWS::ECS')).toBe('ECS');
      expect(getPlatformDisplayName('AWS::EC2')).toBe('EC2');
      expect(getPlatformDisplayName('Generic')).toBe('Generic');
    });

    it('should return Generic for unknown platform types', () => {
      expect(getPlatformDisplayName('AWS::Unknown')).toBe('Generic');
      expect(getPlatformDisplayName('SomeOtherPlatform')).toBe('Generic');
    });

    it('should return Generic for empty or invalid input', () => {
      expect(getPlatformDisplayName('')).toBe('Generic');
    });

    it('should match PLATFORM_TYPE_MAP values', () => {
      Object.entries(PLATFORM_TYPE_MAP).forEach(([key, value]) => {
        expect(getPlatformDisplayName(key)).toBe(value);
      });
    });
  });

  describe('getPlatformTypeFromEnvironment', () => {
    it('should return AWS::EKS for eks environments', () => {
      expect(getPlatformTypeFromEnvironment('eks:cluster/namespace')).toBe('AWS::EKS');
      expect(getPlatformTypeFromEnvironment('eks:demo/default')).toBe('AWS::EKS');
      expect(getPlatformTypeFromEnvironment('EKS:cluster')).toBe('AWS::EKS');
    });

    it('should return AWS::EC2 for ec2 environments', () => {
      expect(getPlatformTypeFromEnvironment('ec2:instance-id')).toBe('AWS::EC2');
      expect(getPlatformTypeFromEnvironment('EC2:i-123456')).toBe('AWS::EC2');
    });

    it('should return AWS::ECS for ecs environments', () => {
      expect(getPlatformTypeFromEnvironment('ecs:cluster/service')).toBe('AWS::ECS');
      expect(getPlatformTypeFromEnvironment('ECS:task')).toBe('AWS::ECS');
    });

    it('should return AWS::Lambda for lambda environments', () => {
      expect(getPlatformTypeFromEnvironment('lambda:function-name')).toBe('AWS::Lambda');
      expect(getPlatformTypeFromEnvironment('LAMBDA:my-func')).toBe('AWS::Lambda');
    });

    it('should return Generic for unknown environments', () => {
      expect(getPlatformTypeFromEnvironment('generic:default')).toBe('Generic');
      expect(getPlatformTypeFromEnvironment('unknown:something')).toBe('Generic');
      expect(getPlatformTypeFromEnvironment('custom')).toBe('Generic');
    });

    it('should return Generic for null or undefined input', () => {
      expect(getPlatformTypeFromEnvironment(null as any)).toBe('Generic');
      expect(getPlatformTypeFromEnvironment(undefined as any)).toBe('Generic');
    });

    it('should return Generic for empty string', () => {
      expect(getPlatformTypeFromEnvironment('')).toBe('Generic');
    });

    it('should return Generic for non-string input', () => {
      expect(getPlatformTypeFromEnvironment(123 as any)).toBe('Generic');
      expect(getPlatformTypeFromEnvironment({} as any)).toBe('Generic');
    });

    it('should handle environment strings without colon separator', () => {
      expect(getPlatformTypeFromEnvironment('eks')).toBe('AWS::EKS');
      expect(getPlatformTypeFromEnvironment('ec2')).toBe('AWS::EC2');
      expect(getPlatformTypeFromEnvironment('other')).toBe('Generic');
    });
  });

  describe('toPrometheusLabel', () => {
    it('should convert dots to underscores', () => {
      expect(toPrometheusLabel('telemetry.sdk.language')).toBe('telemetry_sdk_language');
      expect(toPrometheusLabel('service.name')).toBe('service_name');
      expect(toPrometheusLabel('resource.attributes.host')).toBe('resource_attributes_host');
    });

    it('should handle single segment paths', () => {
      expect(toPrometheusLabel('language')).toBe('language');
    });

    it('should handle empty string', () => {
      expect(toPrometheusLabel('')).toBe('');
    });

    it('should handle paths with no dots', () => {
      expect(toPrometheusLabel('nodots')).toBe('nodots');
    });

    it('should handle paths with multiple consecutive dots', () => {
      expect(toPrometheusLabel('a..b')).toBe('a__b');
    });
  });

  describe('node types', () => {
    it('treats a missing type as a service', () => {
      expect(normalizeNodeType(undefined)).toBe('service');
      expect(normalizeNodeType('')).toBe('service');
      expect(normalizeNodeType('Service')).toBe('service');
      expect(isDependencyType(undefined)).toBe(false);
      expect(getNodeTypeLabel(undefined)).toBe('Service');
    });

    it('treats every other type, including unknown future ones, as a dependency', () => {
      ['database', 'Messaging', 'external', 'cache'].forEach((t) =>
        expect(isDependencyType(t)).toBe(true)
      );
      expect(getNodeTypeLabel('Database')).toBe('Database');
      // Unknown types get a generic dependency label, not "Service".
      expect(getNodeTypeLabel('cache')).toBe('Other dependency');
    });

    it('recognizes dependency placeholders only on dependency nodes', () => {
      expect(isDependencyPlaceholder('UnknownRemoteService', 'external')).toBe(true);
      expect(isDependencyPlaceholder('unknown', 'database')).toBe(true);
      expect(isDependencyPlaceholder('unknown', 'service')).toBe(false);
      expect(isDependencyPlaceholder('redis:valkey-cart', 'database')).toBe(false);
    });
  });
});
