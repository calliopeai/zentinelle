package main

import (
	"net"
	"net/http"
	"time"
)

// The gateway makes two kinds of outbound call, and they want different
// clients.
//
// Calls to Zentinelle (the policy check on every request, and the usage report
// after it) go to one host, are small, and happen once or more per proxied
// request. They must reuse connections: a TCP handshake, plus a TLS handshake
// when Zentinelle is not on the loopback, is 5-20ms added to the hot path of
// every LLM call, and at 100 requests a second that is 100 handshakes a second
// against the control plane.
//
// Calls to the providers are long-lived, sometimes stream for minutes, and fan
// out across a handful of hosts. They want no client timeout at all, and they
// want more than the two idle connections per host that Go's default transport
// keeps.
//
// Neither of these was true before. `CheckPolicy` used `http.DefaultClient`,
// whose transport keeps two idle connections per host and none of them for
// this shape of traffic; `ReportUsage` built a brand new `http.Client`, and so
// a brand new transport, on every single call, which cannot reuse a connection
// even in principle; and the provider client was constructed without a
// transport, taking the same default two.

// dialer is shared by both transports below. The timeouts are the ones
// http.DefaultTransport uses, restated because a transport built from a struct
// literal inherits nothing from it.
var dialer = &net.Dialer{
	Timeout:   30 * time.Second,
	KeepAlive: 30 * time.Second,
}

// controlPlaneTransport pools connections to Zentinelle. One host, so
// MaxIdleConnsPerHost is what matters and MaxIdleConns only bounds it.
var controlPlaneTransport = &http.Transport{
	DialContext:           dialer.DialContext,
	ForceAttemptHTTP2:     true,
	MaxIdleConns:          100,
	MaxIdleConnsPerHost:   100,
	IdleConnTimeout:       90 * time.Second,
	TLSHandshakeTimeout:   10 * time.Second,
	ExpectContinueTimeout: 1 * time.Second,
}

// policyClient makes the policy check on the request path.
//
// No client timeout: CheckPolicy derives a context from cfg.PolicyTimeout and
// the request's own context, so the deadline is already the right one and a
// second one here would only ever cut a call short of it.
var policyClient = &http.Client{Transport: controlPlaneTransport}

// usageClient reports usage after the response has been returned. It carries a
// timeout because it runs detached from any request context, so nothing else
// would ever stop it.
var usageClient = &http.Client{
	Transport: controlPlaneTransport,
	Timeout:   5 * time.Second,
}

// providerTransport carries the proxied traffic. Idle connections are pooled
// per provider host; a deployment talks to a small number of them, so the
// per-host figure is the one that matters and the total is generous.
var providerTransport = &http.Transport{
	DialContext:           dialer.DialContext,
	ForceAttemptHTTP2:     true,
	MaxIdleConns:          200,
	MaxIdleConnsPerHost:   50,
	IdleConnTimeout:       90 * time.Second,
	TLSHandshakeTimeout:   10 * time.Second,
	ExpectContinueTimeout: 1 * time.Second,
	// Deliberately no ResponseHeaderTimeout: a provider may think for a long
	// time before the first byte of a completion, and cutting that off is
	// indistinguishable to the caller from the model refusing to answer.
}
