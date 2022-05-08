package main

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/felixge/httpsnoop"
	"github.com/sirupsen/logrus"
)


func initLogger() *logrus.Logger {
	//mw := io.MultiWriter(os.Stdout, &lumberjack.Logger{
	//	Filename:   "log.log",
	//	MaxSize:    100000, // megabytes
	//	MaxAge:     0,      //days
	//	MaxBackups: 0,
	//	Compress:   true,
	//})
	mw := io.MultiWriter(os.Stdout)
	l := logrus.New()
	l.SetFormatter(&logrus.TextFormatter{
		DisableColors:   true,
		FullTimestamp:   true,
		TimestampFormat: time.RFC3339Nano,
	})
	l.SetOutput(mw)
	l.SetLevel(logrus.TraceLevel)
	l.SetReportCaller(true)
	return l
}

func Exists(name string) (bool, error) {
	_, err := os.Stat(name)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return false, err
}

// https://presstige.io/p/Logging-HTTP-requests-in-Go-233de7fe59a747078b35b82a1b035d36

// HTTPReqInfo is HTTP request info
type HTTPReqInfo struct {
	// GET etc.
	method  string
	uri     string
	referer string
	ipaddr  string

	code int

	size int64

	duration  time.Duration
	userAgent string
}

// LogRequestHandler is logging handler
func LogRequestHandler(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ri := &HTTPReqInfo{
			method:    r.Method,
			uri:       r.URL.String(),
			referer:   r.Header.Get("Referer"),
			userAgent: r.Header.Get("User-Agent"),
		}

		ri.ipaddr = requestGetRemoteAddress(r)

		// this runs handler h and captures information about
		// HTTP request
		m := httpsnoop.CaptureMetrics(h, w, r)

		ri.code = m.Code
		ri.size = m.Written
		ri.duration = m.Duration
		l.WithFields(logrus.Fields{"method": ri.method, "ip": ri.ipaddr, "uri": ri.uri, "statusCode": ri.code, "size": ri.size, "duration_ns": fmt.Sprintf("%d", ri.duration.Nanoseconds()), "userAgent": ri.userAgent}).Debug("request captured")
	})
}

// Request.RemoteAddress contains port, which we want to remove i.e.:
// "[::1]:58292" => "[::1]"
func ipAddrFromRemoteAddr(s string) string {
	idx := strings.LastIndex(s, ":")
	if idx == -1 {
		return s
	}
	return s[:idx]
}

// requestGetRemoteAddress returns ip address of the client making the request,
// taking into account http proxies
func requestGetRemoteAddress(r *http.Request) string {
	hdr := r.Header
	hdrRealIP := hdr.Get("X-Real-Ip")
	hdrForwardedFor := hdr.Get("X-Forwarded-For")
	if hdrRealIP == "" && hdrForwardedFor == "" {
		return ipAddrFromRemoteAddr(r.RemoteAddr)
	}
	if hdrForwardedFor != "" {
		// X-Forwarded-For is potentially a list of addresses separated with ","
		parts := strings.Split(hdrForwardedFor, ",")
		for i, p := range parts {
			parts[i] = strings.TrimSpace(p)
		}
		// TODO: should return first non-local address
		return parts[0]
	}
	return hdrRealIP
}
