export const templates = {
  httpRouter: {
    rule: "Host(`example.com`)",
    entryPoints: ["websecure"],
    service: "my-service",
    tls: {
      certResolver: "letsencrypt"
    }
  },
  httpService: {
    loadBalancer: {
      servers: [{ url: "http://127.0.0.1:8080" }],
      passHostHeader: true
    }
  },
  httpMiddleware: {
    headers: {
      frameDeny: true,
      browserXssFilter: true,
      contentTypeNosniff: true
    }
  },
  httpServersTransport: {
    insecureSkipVerify: false
  },
  tcpRouter: {
    rule: "HostSNI(`example.com`)",
    entryPoints: ["websecure"],
    service: "my-tcp-service",
    tls: {}
  },
  tcpService: {
    loadBalancer: {
      servers: [{ address: "127.0.0.1:9000" }]
    }
  },
  tcpMiddleware: {
    ipAllowList: {
      sourceRange: ["10.0.0.0/8"]
    }
  },
  tcpServersTransport: {
    tls: {}
  },
  udpRouter: {
    entryPoints: ["dns"],
    service: "my-udp-service"
  },
  udpService: {
    loadBalancer: {
      servers: [{ address: "127.0.0.1:53" }]
    }
  },
  tlsCertificate: {
    certFile: "/certs/local.crt",
    keyFile: "/certs/local.key"
  },
  tlsOption: {
    minVersion: "VersionTLS12"
  },
  tlsStore: {
    defaultCertificate: {
      certFile: "/certs/local.crt",
      keyFile: "/certs/local.key"
    }
  }
} as const;
