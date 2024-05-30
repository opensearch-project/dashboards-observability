CREATE EXTERNAL TABLE {table_name} (
  record STRING
)
USING csv
OPTIONS (
  sep='\0x1E',
  recursiveFileLookup='true'
)
LOCATION '{s3_bucket_location}'
