CREATE MATERIALIZED VIEW {table_name}_mview AS
    SELECT
        version as `aws.vpc.version`,
        account_id as `aws.vpc.account-id`,
        interface_id as `aws.vpc.interface-id`,
        srcaddr as `aws.vpc.srcaddr`,
        dstaddr as `aws.vpc.dstaddr`,
        CAST(srcport AS LONG) as `aws.vpc.srcport`,
        CAST(dstport AS LONG) as `aws.vpc.dstport`,
        protocol as `aws.vpc.protocol`,
        CAST(packets AS LONG) as `aws.vpc.packets`,
        CAST(bytes AS LONG) as `aws.vpc.bytes`,
        FROM_UNIXTIME(start) as `aws.vpc.start`,
        FROM_UNIXTIME(end) as `aws.vpc.end`,
        action as `aws.vpc.action`,
        log_status as `aws.vpc.log-status`
FROM
    {table_name};