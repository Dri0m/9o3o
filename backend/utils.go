package main

import (
	"errors"
	"io"
	"os"
	"time"

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
