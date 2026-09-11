// Historical baseline reproduction only. Corrected behavior is tested under gateway/.
package main

import (
 "context"
 "encoding/json"
 "fmt"
 "net/http"
 "net/http/httptest"
 "strings"
 "testing"
 "time"
)

// These probes assert the observed defects, not desired production behavior.
func TestReviewPolicyErrorsAllow(t *testing.T) {
 for _, status := range []int{400, 401, 403, 429, 500} {
  t.Run(fmt.Sprint(status), func(t *testing.T) {
   server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request) {
    var p PolicyRequest
    json.NewDecoder(r.Body).Decode(&p)
    if p.AgentID != "" { t.Errorf("expected observed blank agent ID") }
    w.WriteHeader(status)
    fmt.Fprint(w, `{ "error": "review rejection" }`)
   }))
   defer server.Close()
   cfg:=&Config{ZentinelleURL:server.URL,PolicyTimeout:time.Second,FailOpen:true}
   result:=CheckPolicy(context.Background(),cfg,"invalid-review-key","openai","review-model")
   if !result.Allowed { t.Fatal("observed fail-open behavior changed") }
   t.Logf("policy HTTP %d => allowed=%v; output_filter_required=%v",status,result.Allowed,result.OutputFilterRequired)
  })
 }
}

func TestReviewInvalidKeyReachesProvider(t *testing.T) {
 t.Setenv("LOG_INTERACTIONS","false")
 policyServer:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request) {w.WriteHeader(401)}))
 defer policyServer.Close()
 reached:=false
 providerServer:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request) {
  reached=true
  if r.Header.Get("Authorization")!="Bearer review-provider-key" {t.Error("provider credential not injected")}
  fmt.Fprint(w,`{"choices":[]}`)
 }))
 defer providerServer.Close()
 old:=providers["openai"]
 defer func(){providers["openai"]=old}()
 replacement:=old
 replacement.BaseURL=providerServer.URL
 providers["openai"]=replacement
 cfg:=&Config{ZentinelleURL:policyServer.URL,PolicyTimeout:time.Second,FailOpen:true,MaxResponseBytes:4096,ProviderAPIKeys:map[string]string{"openai":"review-provider-key"}}
 req:=httptest.NewRequest("POST","/v1/chat/completions",strings.NewReader(`{"model":"review-model"}`))
 req.Header.Set("X-Zentinelle-Key","invalid-review-key")
 response:=httptest.NewRecorder()
 NewGateway(cfg).ServeHTTP(response,req)
 if !reached || response.Code!=200 {t.Fatalf("observed bypass changed: reached=%v status=%d",reached,response.Code)}
 t.Log("Invalid agent key reached local provider stub using gateway's credential")
}
