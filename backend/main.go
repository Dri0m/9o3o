package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"math/rand"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/sirupsen/logrus"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

const dbName = "db.db"

type Rating struct {
	gorm.Model
	Name     string `gorm:"unique"`
	Comments []Comment
}

type Comment struct {
	gorm.Model
	Message  string
	GameID   uint
	RatingID uint
	Rating   Rating
}

type Game struct {
	gorm.Model    `json:"-"`
	UUID          string    `gorm:"unique" json:"uuid"`
	Title         string    `json:"title"`
	LaunchCommand string    `json:"launch_command"`
	Comments      []Comment `json:"-"`
}

var l *logrus.Logger
var db *gorm.DB

func main() {
	var err error
	db, err = gorm.Open(sqlite.Open(dbName), &gorm.Config{})
	if err != nil {
		panic("failed to connect database")
	}

	l = initLogger()

	// Migrate the schema
	db.AutoMigrate(&Rating{}, &Comment{}, &Game{})

	initDB(db)

	r := mux.NewRouter()
	r.HandleFunc("/random", randomHandler).Methods("GET")
	http.Handle("/", r)

	srv := &http.Server{
		Handler: r,
		Addr:    "127.0.0.1:8000",
		// Good practice: enforce timeouts for servers you create!
		WriteTimeout: 15 * time.Second,
		ReadTimeout:  15 * time.Second,
	}

	l.Fatal(srv.ListenAndServe())
}

func randomHandler(w http.ResponseWriter, r *http.Request) {
	var count int64
	if err := db.Model(&Game{}).Count(&count).Error; err != nil {
		l.Panic(err)
	}

	selected := rand.Intn(int(count)) + 1

	var gameska Game
	if err := db.First(&gameska, selected).Error; err != nil {
		l.Panic(err)
	}

	w.WriteHeader(http.StatusOK)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(&gameska)
}

func addComment(uuid string) error {
	var gameska Game
	if err := db.Where(&Game{UUID: "test"}).First(&gameska).Error; err != nil {
		return err
	}

	var ratingosek Rating
	if err := db.Where(&Rating{Name: "greatest"}).First(&ratingosek).Error; err != nil {
		return err
	}

	gameska.Comments = append(gameska.Comments, Comment{Rating: ratingosek, Message: "hahaaa"})
	if err := db.Save(&gameska).Error; err != nil {
		return err
	}

	return nil
}

func initDB(db *gorm.DB) {
	isDone := true
	var gameska Game
	if err := db.First(&gameska).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			isDone = false
		} else {
			l.Panic(err)
		}
	}

	if isDone {
		l.Info("master db already ingested")
		return
	}

	fdb, err := sql.Open("sqlite3", "flashpoint.sqlite?mode=ro")
	if err != nil {
		l.Panic(err)
	}

	l.Debug("reading masterdb")
	rows, err := fdb.Query(`
		SELECT id, title, launchCommand
		FROM game
		WHERE platform="Flash"`)
	if err != nil {
		l.Panic(err)
	}

	games := make([]*Game, 0, 100000)

	for rows.Next() {
		g := &Game{}
		err := rows.Scan(
			&g.UUID, &g.Title, &g.LaunchCommand)
		if err != nil {
			l.Panic(err)
		}

		games = append(games, g)
	}

	l.Debug("inserting games to the db")
	db.CreateInBatches(games, 100)

	l.Debug("inserting ratings")
	db.Create(&Rating{Name: "works"})
	db.Create(&Rating{Name: "buggy"})
	db.Create(&Rating{Name: "broken"})
}
