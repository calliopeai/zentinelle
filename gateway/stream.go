package main

import (
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
	total := int64(0)
	chunk := make([]byte, 4096)

	for {
		n, err := upstreamResp.Body.Read(chunk)
		if n > 0 {
			total += int64(n)
			if total > maxBytes {
				return buf, &responseTooLargeError{limit: maxBytes}
			}

			// Write to client
			if _, writeErr := w.Write(chunk[:n]); writeErr != nil {
				return buf, writeErr
			}

			// Buffer for usage extraction
			buf = append(buf, chunk[:n]...)

			// Flush immediately for SSE
			if canFlush {
				flusher.Flush()
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return buf, err
		}
	}

	return buf, nil
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
		return nil, &responseTooLargeError{limit: maxBytes}
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
