CREATE EXTERNAL TABLE {table_name} (
  record STRING
) USING csv
LOCATION '{s3_bucket_location}'
OPTIONS (
  sep='\0x1E'
)
