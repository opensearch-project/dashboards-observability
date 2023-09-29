CREATE SKIPPING INDEX ON ${TABLE}.default.ss4o_alb_logs (
            type PARTITION,
            time PARTITION,
            elb string,
            client_ip VALUE_SET,
            client_port VALUE_SET,
            target_ip VALUE_SET,
            target_port VALUE_SET,
            request_processing_time PARTITION,
            target_processing_time PARTITION,
            response_processing_time PARTITION,
            elb_status_code VALUE_SET,
            target_status_code VALUE_SET,
            received_bytes PARTITION,
            sent_bytes PARTITION,
            request_verb PARTITION,
            request_url PARTITION)
WITH (
  auto_refresh = true,
  refresh_interval = '1 day',
  checkpoint_location = 's3://test/'
)