CREATE EXTERNAL TABLE IF NOT EXISTS {table_name} (
  cloud STRUCT<
    account_uid: STRING,
    region: STRING,
    zone: STRING,
    provider: STRING
  >,
  src_endpoint STRUCT<
    port: INT,
    svc_name: STRING,
    ip: STRING,
    intermediate_ips: ARRAY<STRING>,
    interface_uid: STRING,
    vpc_uid: STRING,
    instance_uid: STRING,
    subnet_uid: STRING
  >,
  dst_endpoint STRUCT<
    port: INT,
    svc_name: STRING,
    ip: STRING,
    intermediate_ips: ARRAY<STRING>,
    interface_uid: STRING,
    vpc_uid: STRING,
    instance_uid: STRING,
    subnet_uid: STRING
  >,
  connection_info STRUCT<
    protocol_num: INT,
    tcp_flags: INT,
    protocol_ver: STRING,
    boundary_id: INT,
    boundary: STRING,
    direction_id: INT,
    direction: STRING
  >,
  traffic STRUCT<
    packets: BIGINT,
    bytes: BIGINT
  >,
  time BIGINT,
  start_time BIGINT,
  end_time BIGINT,
  status_code STRING,
  severity_id INT,
  severity STRING,
  class_name STRING,
  class_uid INT,
  category_name STRING,
  category_uid INT,
  activity_name STRING,
  activity_id INT,
  disposition STRING,
  disposition_id INT,
  type_uid INT,
  type_name STRING,
  region STRING,
  accountid STRING,
  eventday STRING
)
USING parquet
LOCATION '{s3_bucket_location}'
