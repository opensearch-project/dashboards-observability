CREATE EXTERNAL TABLE IF NOT EXISTS {table_name} (
  /* General log info */
  firewall_name string,
  availability_zone string,
  event_timestamp string,
  /* General event info */
  event struct<
    timestamp:string,
    event_type:string,
    flow_id:bigint,
    src_ip:string,
    src_port:int,
    dest_ip:string,
    dest_port:int,
    pkt_src: string,
    proto:string,
    verdict: struct<
      action: string>,
    pcap_cnt:int,
    app_proto:string,
    tx_id:int,
    tls_inspected: boolean,
    icmp_type: int,
    icmp_code: int,
    vlan: array<int>,
    direction: string,
    packet:string,
    packet_info:struct<
      linktype:int>,
    /* TCP Events info */
    tcp: struct<
      tcp_flags: string,
      syn: boolean,
      fin: boolean,
      rst: boolean,
      psh: boolean,
      ack: boolean
    >,
    /* Alert events info */
    alert: struct<
      action:string,
      gid:int,
      signature_id:bigint,
      rev:int,
      signature:string,
      category:string,
      severity:int
    >,
    /* Anomaly events info */
    anomaly: struct<
      type:string,
      event:string,
      layer:string,
      code:string
    >,
    /* HTTP events info */
    http: struct<
      hostname:string,
      url:string,
      http_user_agent:string,
      http_content_type:string,
      http_refer:string,
      http_method:string,
      protocol:string,
      status:string,
      length:int,
      request_headers:array<
        struct<
          name:string,
          value:string
        >
      >,
      response_headers:array<
        struct<
          name:string,
          value:string
        >
      >
    >,
     /* DNS events info */
    dns: struct<
      version:int,
      type:string,
      id:int,
      flags:string,
      qr:boolean,
      rd:boolean,
      ra:boolean,
      rcode:string,
      rrname:string,
      rrtype:string,
      ttl:int,
      rdata:string,
      query: array<
        struct<
          type: string,
          id: int,
          rrname: string,
          rrtype: string,
          tx_id: int,
          opcode: int
        >
      >,
      answers:array<
        struct<
          rrname:string,
          rrtype:string,
          ttl:int,
          rdata:string
        >
      >
    >,
    /* FTP Events info */
    ftp: struct<
      command:string,
      command_data:string,
      reply:array<string>,
      completion_code:array<string>,
      dynamic_port:int,
      mode:string,
      reply_received:string
    >,
    ftp_data: struct<
      filename:string,
      command:string
    >,
    /* TLS Events info */
    tls: struct<
      subject:string,
      issuerdn:string,
      serial:string,
      fingerprint:string,
      sni:string,
      version:string,
      notbefore:timestamp,
      notafter:timestamp,
      certificate:string
    >,
    /* TFTP Events info */
    tftp: struct<
      packet:string,
      file:string,
      mode:string
    >,
    /* SMB Events info */
    smb: struct<
      id:int,
      dialect:string,
      command:string,
      status:string,
      status_code:string,
      session_id:bigint,
      tree_id:int,
      filename:string,
      disposition:string,
      access:string,
      created:int,
      accessed:int,
      modified:int,
      changed:int,
      size:int,
      fuid:string,
      ntlmssp: struct<
        domain:string,
        user:string,
        host:string
      >,
      request: struct<
        native_os:string,
        native_lm:string
      >,
      response: struct<
        native_os:string,
        native_lm:string
      >,
      dcerpc: struct<
        request:string,
        response:string,
        opnum:int,
        req: struct<
          frag_cnt:int,
          stub_data_size:int
        >,
        res: struct<
          frag_cnt:int,
          stub_data_size:int
        >,
        call_id:int
      >,
      kerberos: struct<
        realm:string,
        snames:array<string>
      >
    >,
    /* SSH Events info */
    ssh: struct<
      client: struct<
        proto_version:string,
        software_version:string,
        hassh: struct<
          hash:string,
          string:string
        >
      >,
      server: struct<
        proto_version:string,
        software_version:string,
        hassh: struct<
          hash:string,
          string:string
        >
      >
    >,
    /* Netflow Events info */
    netflow: struct<
      pkts:int,
      bytes:bigint,
      start:string,
      `end`:string,
      age:int,
      min_ttl:int,
      max_ttl:int,
      pkts_toserver:int,
      pkts_toclient:int,
      bytes_toserver:int,
      bytes_toclient:int,
      bypassed: struct<
        pkts_toserver:int,
        pkts_toclient:int,
        bytes_toserver:int,
        bytes_toclient:int
      >,      
      bypass:string,
      state:string,
      reason:string,
      alerted:boolean
    >,
    /* RDP Events info */
    rdp: array<
      struct<
        tx_id:int,
        event_type:string,
        cookie:string,
        client: struct<
          version:string,
          desktop_width:int,
          desktop_height:int,
          color_depth:int,
          keyboard_layout:string,
          build:string,
          client_name:string,
          keyboard_type:string,
          function_keys:int,
          product_id:int,
          capabilities:array<string>,
          id:string
        >,
        channels: array<string>,
        server_supports: array<string>,
        protocol:string,
        x509_serials: array<string>
      >
    >,
    /* RFB Events info */
    rfb: struct<
      server_protocol_version: struct<
        major:string,
        minor:string
      >,
      client_protocol_version: struct<
        major:string,
        minor:string
      >,
      authentication: struct<
        security_type:int,
        vnc: struct<
          challenge:string,
          response:string
        >,
        security_result:string
      >,
      screen_shared:boolean,
      framebuffer: struct<
        width:int,
        height:int,
        name:string,
        pixel_format: struct<
          bits_per_pixel:int,
          depth:int,
          big_endian:boolean,
          true_color:boolean,
          red_max:int,
          green_max:int,
          blue_max:int,
          red_shift:int,
          green_shift:int,
          blue_shift:int
        >
      >
    >,
    /* MQTT Events info */
    mqtt: struct<
      publish: struct<
        qos:int,
        retain:boolean,
        dup:boolean,
        truncated:boolean,
        skipped_length:int
      >,
      connect: struct<
        qos:int,
        retain:boolean,
        dup:boolean,
        protocol_string:string,
        protocol_version:int,
        flags: struct<
          username:boolean,
          password:boolean,
          will_retain:boolean,
          will:boolean,
          clean_session:boolean
        >,
        client_id:string,
        username:string,
        password:string,
        will: struct<
          topic:string,
          message:string,
          properties: struct<
            content_type:string,
            correlation_data:string,
            message_expiry_interval:int,
            payload_format_indicator:int,
            response_topic:string,
            topic_alias:int,
            userprop:string
          >
        >,
        properties: struct<
          maximum_packet_size:int,
          receive_maximum:int,
          session_expiry_interval:int,
          topic_alias_maximum:int,
          userprop1:string,
          userprop2:string
        >
      >,
      connack: struct<
        qos:int,
        retain:boolean,
        dup:boolean,
        session_present:boolean,
        return_code:int,
        properties: struct<
          topic_alias_maximum:int
        >
      >,
      puback: struct<
        qos:int,
        retain:boolean,
        dup:boolean,
        message_id:int,
        reason_code:int
      >,
      subscribe: struct<
        qos:int,
        retain:boolean,
        dup:boolean,
        message_id:int,
        topics: array<
          struct<
            topic:string,
            qos:int
          >
        >
      >,
      suback: struct<
        qos:int,
        retain:boolean,
        dup:boolean,
        message_id:int,
        qos_granted: array<int>
      >,
      unsubscribe: struct<
        qos:int,
        retain:boolean,
        dup:boolean,
        message_id:int,
        topics: array<string>
      >,
      unsuback: struct<
        qos:int,
        retain:boolean,
        dup:boolean,
        message_id:int
      >,
      auth: struct<
        qos:int,
        retain:boolean,
        dup:boolean,
        reason_code:int
      >,
      disconnect: struct<
        qos:int,
        retain:boolean,
        dup:boolean,
        reason_code:int,
        properties: struct<
          session_expiry_interval:int
        >
      >
    >,
    /* Another_MQTT Events info */
    another_mqtt: struct<
      publish: struct<
        qos:int,
        retain:boolean,
        dup:boolean,
        truncated:boolean,
        skipped_length:int
      >
    >,
    /* HTTP2 Events info */
    http2: struct<
      request: struct<
        settings: array<
          struct<
            settings_id:string,
            settings_value:int
          >
        >,
        headers: array<
          struct<
            name:string,
            value:string
          >
        >
      >,
      response: struct<
        headers: array<
          struct<
            name:string,
            value:string
          >
        >
      >
    >
  >
)
USING json
OPTIONS (
   PATH '{s3_bucket_location}',
   recursivefilelookup='true',
   multiline 'true'
)