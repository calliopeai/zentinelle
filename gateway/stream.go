package main

import (
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// isStreamingRequest returns true if the request body indicates streaming is desired,
// or if the Accept header requests text/event-stream.
func isStreamingRequest(body []byte, acceptHeader string) bool {
	if strings.Contains(acceptHeader, "text/event-stream") {
		return true
	}
	// Quick check without full JSON parse: look for "stream":true or "stream": true
	// This avoids parsing the full body just to check one field.
	return containsStreamTrue(body)
}

// containsStreamTrue does a fast scan for "stream":true in JSON body bytes.
// This is intentionally simple — we only need to detect the common patterns
// emitted by OpenAI and Anthropic SDKs.
func containsStreamTrue(body []byte) bool {
	s := string(body)
	// Match both "stream":true and "stream": true (with optional whitespace)
	idx := strings.Index(s, `"stream"`)
	if idx < 0 {
		return false
	}
	rest := strings.TrimSpace(s[idx+len(`"stream"`):])
	if len(rest) == 0 {
		return false
	}
	if rest[0] != ':' {
		return false
	}
	rest = strings.TrimSpace(rest[1:])
	return strings.HasPrefix(rest, "true")
}

// isStreamingResponse returns true if the response content-type indicates SSE.
func isStreamingResponse(contentType string) bool {
	return strings.Contains(contentType, "text/event-stream")
}

// streamResponse forwards an upstream response to the client using chunked transfer
// with http.Flusher for real-time SSE delivery. Returns the total bytes written
// and the buffered response body for usage extraction.
func streamResponse(w http.ResponseWriter, upstreamResp *http.Response, maxBytes int64) ([]byte, error) {
	flusher, canFlush := w.(http.Flusher)

	// Copy upstream response headers
	for key, vals := range upstreamResp.Header {
		for _, val := range vals {
			w.Header().Add(key, val)
		}
	}
	w.WriteHeader(upstreamResp.StatusCode)

	var buf []byte
	var writeErr error
	total := int64(0)
	chunk := make([]byte, 4096)

	for {
		n, err := upstreamResp.Body.Read(chunk)
		if n > 0 {
			total += int64(n)
			if total > maxBytes {
				// What fits is kept for metering, not sent.
				buf = append(buf, chunk[:n-int(total-maxBytes)]...)
				return buf, &responseTooLargeError{limit: maxBytes}
			}

			// Buffer for usage extraction
			buf = append(buf, chunk[:n]...)

			// Write to client, while it is still there. Once a write fails
			// the rest is read and not sent: usage arrives in the last
			// events of a stream, and the provider bills the call whether
			// or not the caller stayed for it.
			if writeErr == nil {
				if _, writeErr = w.Write(chunk[:n]); writeErr == nil && canFlush {
					// Flush immediately for SSE
					flusher.Flush()
				}
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			if writeErr != nil {
				return buf, &clientWriteError{err: writeErr}
			}
			return buf, err
		}
	}

	if writeErr != nil {
		return buf, &clientWriteError{err: writeErr}
	}
	return buf, nil
}

// clientWriteError is a stream the caller stopped receiving.
type clientWriteError struct {
	err error
}

func (e *clientWriteError) Error() string {
	return "client write failed: " + e.err.Error()
}

// copyResponse copies a non-streaming upstream response to the client.
// Returns the response body for usage extraction.
func copyResponse(w http.ResponseWriter, upstreamResp *http.Response, maxBytes int64) ([]byte, error) {
	// Copy upstream response headers
	for key, vals := range upstreamResp.Header {
		for _, val := range vals {
			w.Header().Add(key, val)
		}
	}

	body, err := io.ReadAll(io.LimitReader(upstreamResp.Body, maxBytes+1))
	if err != nil {
		return nil, err
	}

	if int64(len(body)) > maxBytes {
		// The partial body goes back for metering only.
		return body, &responseTooLargeError{limit: maxBytes}
	}

	w.WriteHeader(upstreamResp.StatusCode)
	_, err = w.Write(body)
	return body, err
}

type responseTooLargeError struct {
	limit int64
}

func (e *responseTooLargeError) Error() string {
	return "response exceeded maximum size"
}

// bufferResponse reads the whole upstream response without writing anything to
// the client. It is used when an output filter has to see the response before
// the caller does; `deliverBuffered` writes it afterwards, if it is allowed.
//
// Nothing reaches the client until then, which is the point: a filter that
// only redacted what came after it had already leaked the part that came
// before, and on a streamed response that is most of it.
func bufferResponse(upstreamResp *http.Response, maxBytes int64) ([]byte, error) {
	// On failure the partial body still comes back, for metering only.
	body, err := io.ReadAll(io.LimitReader(upstreamResp.Body, maxBytes+1))
	if err != nil {
		return body, err
	}
	if int64(len(body)) > maxBytes {
		return body, &responseTooLargeError{limit: maxBytes}
	}
	return body, nil
}

// decodeBody returns a response body as plain bytes, for the gateway's own
// reading: usage extraction and the output filter. What the client receives
// is untouched.
//
// The gateway asks providers for identity encoding, so this is the fallback
// for one that compresses anyway. Reading gzip as text meters nothing and
// lets a filter pass compressed PII it cannot see, so an encoding this cannot
// decode is an error, and the output filter treats it as uninspectable.
// A truncated gzip stream returns what decoded before the error.
func decodeBody(contentEncoding string, body []byte, maxBytes int64) ([]byte, error) {
	switch strings.ToLower(strings.TrimSpace(contentEncoding)) {
	case "", "identity":
		return body, nil
	case "gzip", "x-gzip":
		zr, err := gzip.NewReader(bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		decoded, err := io.ReadAll(io.LimitReader(zr, maxBytes+1))
		if err == nil && int64(len(decoded)) > maxBytes {
			err = &responseTooLargeError{limit: maxBytes}
		}
		return decoded, err
	default:
		return nil, fmt.Errorf("unsupported content encoding %q", contentEncoding)
	}
}

// deliverBuffered writes a response that was held back for inspection.
func deliverBuffered(w http.ResponseWriter, upstreamResp *http.Response, body []byte) error {
	for key, vals := range upstreamResp.Header {
		for _, val := range vals {
			w.Header().Add(key, val)
		}
	}
	// The upstream length no longer describes what is being sent if anything
	// about the body changed, and it is not this function's to recompute.
	w.Header().Del("Content-Length")
	w.WriteHeader(upstreamResp.StatusCode)
	_, err := w.Write(body)
	return err
}

// sseText pulls the assistant's text out of a buffered SSE stream so a filter
// has prose to judge rather than a wire format. Anything that is not a data
// line, and the terminal [DONE], is not content.
func sseText(body []byte) string {
	var out strings.Builder
	for _, line := range strings.Split(string(body), "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" || payload == "[DONE]" {
			continue
		}
		out.WriteString(payload)
		out.WriteString("\n")
	}
	return out.String()
}
