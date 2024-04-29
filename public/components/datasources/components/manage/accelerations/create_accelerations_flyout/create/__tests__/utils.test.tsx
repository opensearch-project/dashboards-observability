/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ACCELERATION_INDEX_NAME_REGEX,
  ACCELERATION_S3_URL_REGEX,
} from '../../../../../../../../../common/constants/data_sources';
import {
  coveringIndexDataMock,
  materializedViewEmptyDataMock,
  materializedViewEmptyTumbleDataMock,
  materializedViewStaleDataMock,
  materializedViewValidDataMock,
  skippingIndexDataMock,
} from '../../../../../../../../../test/accelerations';
import {
  pluralizeTime,
  validateCheckpointLocation,
  validateCoveringIndexData,
  validateDataSource,
  validateDataTable,
  validateDatabase,
  validateIndexName,
  validateMaterializedViewData,
  validatePrimaryShardCount,
  validateRefreshInterval,
  validateReplicaCount,
  validateSkippingIndexData,
} from '../utils';

describe('pluralizeTime', () => {
  it('should return "s" for a time window greater than 1', () => {
    expect(pluralizeTime(2)).toBe('s');
    expect(pluralizeTime(10)).toBe('s');
    expect(pluralizeTime(100)).toBe('s');
  });

  it('should return an empty string for a time window of 1/0', () => {
    expect(pluralizeTime(1)).toBe('');
    expect(pluralizeTime(0)).toBe(''); // form throws validation error, doesn't allow user to proceed
  });
});

describe('validateDataSource', () => {
  it('should return an array with an error message when the dataSource is empty', () => {
    expect(validateDataSource('')).toEqual(['Select a valid data source']);
    expect(validateDataSource('   ')).toEqual(['Select a valid data source']);
  });

  it('should return an empty array when the dataSource is not empty', () => {
    expect(validateDataSource('Some_valid_data_source')).toEqual([]);
    expect(validateDataSource('   Some_valid_data_source   ')).toEqual([]);
  });
});

describe('validateDatabase', () => {
  it('should return an array with an error message when the database is empty', () => {
    expect(validateDatabase('')).toEqual(['Select a valid database']);
    expect(validateDatabase('   ')).toEqual(['Select a valid database']);
  });

  it('should return an empty array when the database is not empty', () => {
    expect(validateDatabase('Some_valid_database')).toEqual([]);
    expect(validateDatabase('   Some_valid_database   ')).toEqual([]);
  });
});

describe('validateDataTable', () => {
  it('should return an array with an error message when the dataTable is empty', () => {
    expect(validateDataTable('')).toEqual(['Select a valid table']);
    expect(validateDataTable('   ')).toEqual(['Select a valid table']);
  });

  it('should return an empty array when the dataTable is not empty', () => {
    expect(validateDataTable('Some_valid_table')).toEqual([]);
    expect(validateDataTable('   Some_valid_table   ')).toEqual([]);
  });
});

describe('validatePrimaryShardCount', () => {
  it('should return an array with an error message when primaryShardCount is less than 1', () => {
    expect(validatePrimaryShardCount(0)).toEqual(['Primary shards count should be greater than 0']);
    expect(validatePrimaryShardCount(-1)).toEqual([
      'Primary shards count should be greater than 0',
    ]); // form throws validation error, doesn't allow user to proceed
  });

  it('should return an empty array when primaryShardCount is greater than or equal to 1', () => {
    expect(validatePrimaryShardCount(1)).toEqual([]);
    expect(validatePrimaryShardCount(5)).toEqual([]);
    expect(validatePrimaryShardCount(100)).toEqual([]);
  });
});

describe('validateReplicaCount', () => {
  it('should return an array with an error message when replicaCount is less than 1', () => {
    expect(validateReplicaCount(-1)).toEqual(['Replica count should be equal or greater than 0']); // form throws validation error, doesn't allow user to proceed
  });

  it('should return an empty array when replicaCount is greater than or equal to 1', () => {
    expect(validateReplicaCount(0)).toEqual([]);
    expect(validateReplicaCount(1)).toEqual([]);
    expect(validateReplicaCount(5)).toEqual([]);
    expect(validateReplicaCount(100)).toEqual([]);
  });
});

describe('validateRefreshInterval', () => {
  it('should return an array with an error message when refreshType is "interval" and refreshWindow is less than 1', () => {
    expect(validateRefreshInterval('autoInterval', 0, 'hour')).toEqual([
      'refresh window should be greater than 0',
    ]);
    expect(validateRefreshInterval('autoInterval', -1, 'day')).toEqual([
      'refresh window should be greater than 0',
    ]);
    expect(validateRefreshInterval('autoInterval', -10, 'week')).toEqual([
      'refresh window should be greater than 0',
    ]);
    expect(validateRefreshInterval('autoInterval', 14, 'minute')).toEqual([
      'refresh window should be greater than 15 minutes',
    ]);
    expect(validateRefreshInterval('autoInterval', 10, 'minute')).toEqual([
      'refresh window should be greater than 15 minutes',
    ]);
    expect(validateRefreshInterval('autoInterval', 0, 'minute')).toEqual([
      'refresh window should be greater than 15 minutes',
    ]);
  });

  it('should return an empty array when refreshType is not "interval" or when refreshWindow is greater than or equal to 1', () => {
    expect(validateRefreshInterval('auto', 0, 'minute')).toEqual([]);
    expect(validateRefreshInterval('auto', 1, 'minute')).toEqual([]);
    expect(validateRefreshInterval('autoInterval', 15, 'minute')).toEqual([]);
    expect(validateRefreshInterval('autoInterval', 20, 'minute')).toEqual([]);
    expect(validateRefreshInterval('manual', 0, 'minute')).toEqual([]);
    expect(validateRefreshInterval('manualIncrement', 0, 'minute')).toEqual([]);
    expect(validateRefreshInterval('autoInterval', 1, 'hour')).toEqual([]);
    expect(validateRefreshInterval('autoInterval', 2, 'day')).toEqual([]);
    expect(validateRefreshInterval('autoInterval', 3, 'week')).toEqual([]);
  });
});

describe('validateIndexName', () => {
  it('should return an array with an error message when the index name is invalid', () => {
    expect(validateIndexName('Iinvalid')).toEqual(['Enter a valid index name']);
    expect(validateIndexName('-invalid')).toEqual(['Enter a valid index name']);
    expect(validateIndexName('InVal1d')).toEqual(['Enter a valid index name']);
    expect(validateIndexName('invalid_with spaces')).toEqual(['Enter a valid index name']);
    expect(validateIndexName('another-valid-name')).toEqual(['Enter a valid index name']);
  });

  it('should return an empty array when the index name is valid', () => {
    expect(validateIndexName('valid')).toEqual([]);
    expect(validateIndexName('valid_name')).toEqual([]);
    expect(validateIndexName('valid_name_index')).toEqual([]);
  });

  it('should use the ACCELERATION_INDEX_NAME_REGEX pattern to validate the index name', () => {
    expect(ACCELERATION_INDEX_NAME_REGEX.test('valid_name')).toBe(true);
    expect(ACCELERATION_INDEX_NAME_REGEX.test('_valid_name')).toBe(true);
    expect(ACCELERATION_INDEX_NAME_REGEX.test('23valid_name')).toBe(true);
    expect(ACCELERATION_INDEX_NAME_REGEX.test('___1__')).toBe(true);
    expect(ACCELERATION_INDEX_NAME_REGEX.test('23')).toBe(true);
    expect(ACCELERATION_INDEX_NAME_REGEX.test('invalid name')).toBe(false);
    expect(ACCELERATION_INDEX_NAME_REGEX.test('-invalid')).toBe(false);
    expect(ACCELERATION_INDEX_NAME_REGEX.test('_invalid')).toBe(true);
    expect(ACCELERATION_INDEX_NAME_REGEX.test('invalid.')).toBe(false);
    expect(ACCELERATION_INDEX_NAME_REGEX.test('invalid<')).toBe(false);
    expect(ACCELERATION_INDEX_NAME_REGEX.test('invalid*')).toBe(false);
  });
});

describe('validateCheckpointLocation', () => {
  it('should return an array with an error message when using auto refresh without a checkpoint location', () => {
    const materializedError = validateCheckpointLocation('auto', undefined);
    expect(materializedError).toEqual(['Checkpoint location is mandatory for auto refresh']);
  });

  it('should return an array with an error message when using auto refresh with empty a checkpoint location', () => {
    const materializedError = validateCheckpointLocation('auto', '');
    expect(materializedError).toEqual(['Checkpoint location is mandatory for auto refresh']);
  });

  it('should return an array with an error message when the checkpoint location is not a valid S3 URL', () => {
    const invalidCheckpoint = validateCheckpointLocation('auto', 'not_a_valid_s3_url');
    expect(invalidCheckpoint).toEqual(['Enter a valid checkpoint location']);
  });

  it('should return an empty array when the checkpoint location is a valid S3 URL', () => {
    const validCheckpoint = validateCheckpointLocation(
      'interval',
      's3://valid-s3-bucket/path/to/checkpoint'
    );
    expect(validCheckpoint).toEqual([]);
  });

  it('should return an empty array when the checkpoint location is a valid S3A URL', () => {
    const validCheckpoint = validateCheckpointLocation(
      'auto',
      's3a://valid-s3-bucket/path/to/checkpoint'
    );
    expect(validCheckpoint).toEqual([]);
  });

  it('should return an empty array when the checkpoint location is a valid S3A URL with just bucket in checkpoint', () => {
    const validCheckpoint = validateCheckpointLocation('auto', 's3a://valid-s3-bucket');
    expect(validCheckpoint).toEqual([]);
  });

  it('should return an empty array when using manual refresh with no checkpoint location', () => {
    const validMaterializedCheckpoint = validateCheckpointLocation('manual', '');
    expect(validMaterializedCheckpoint).toEqual([]);
  });

  it('should use the ACCELERATION_S3_URL_REGEX pattern to validate the checkpoint location', () => {
    expect(ACCELERATION_S3_URL_REGEX.test('s3://valid-s3-bucket/path/to/checkpoint')).toBe(true);
    expect(ACCELERATION_S3_URL_REGEX.test('s3a://valid-s3-bucket/path/to/checkpoint')).toBe(true);
    expect(ACCELERATION_S3_URL_REGEX.test('https://amazon.com')).toBe(false);
    expect(ACCELERATION_S3_URL_REGEX.test('http://www.amazon.com')).toBe(false);
  });
});

describe('validateSkippingIndexData', () => {
  it('should return an array with an error message when accelerationIndexType is "skipping" and no skipping index data is provided', () => {
    const error = validateSkippingIndexData('skipping', []);
    expect(error).toEqual(['Add fields to the skipping index definition']);
  });

  it('should return an empty array when accelerationIndexType is not "skipping"', () => {
    const noError = validateSkippingIndexData('covering', []);
    expect(noError).toEqual([]);
  });

  it('should return an empty array when accelerationIndexType is "skipping" and skipping index data is provided', () => {
    const noError = validateSkippingIndexData('skipping', skippingIndexDataMock);
    expect(noError).toEqual([]);
  });
});

describe('validateCoveringIndexData', () => {
  it('should return an array with an error message when accelerationIndexType is "covering" and no covering index data is provided', () => {
    const error = validateCoveringIndexData('covering', []);
    expect(error).toEqual(['Add fields to covering index definition']);
  });

  it('should return an empty array when accelerationIndexType is not "covering"', () => {
    const noError = validateCoveringIndexData('skipping', []);
    expect(noError).toEqual([]);
  });

  it('should return an empty array when accelerationIndexType is "covering" and covering index data is provided', () => {
    const noError = validateCoveringIndexData('covering', coveringIndexDataMock);
    expect(noError).toEqual([]);
  });
});

describe('validateMaterializedViewData', () => {
  it('should return an array with an error message when accelerationIndexType is "materialized" and no materialized view data is provided', () => {
    const error = validateMaterializedViewData('materialized', materializedViewEmptyDataMock);
    expect(error).toEqual(['Add columns to materialized view definition']);
  });

  it('should return an array with an error message when accelerationIndexType is "materialized" and groupByTumbleValue is incomplete', () => {
    const error = validateMaterializedViewData('materialized', materializedViewEmptyTumbleDataMock);
    expect(error).toEqual(['Add a time field to tumble function in materialized view definition']);
  });

  it('should return an empty array when accelerationIndexType is not "materialized"', () => {
    const noError = validateMaterializedViewData('covering', materializedViewStaleDataMock);
    expect(noError).toEqual([]);
  });

  it('should return an empty array when accelerationIndexType is "materialized" and materialized view data is complete', () => {
    const noError = validateMaterializedViewData('materialized', materializedViewValidDataMock);
    expect(noError).toEqual([]);
  });
});
