package main

import (
	"fmt"
	"net/http"

	"github.com/gorilla/mux"
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
	gorm.Model
	UUID           string `gorm:"unique"`
	LaunchCoummand string
	Comments       []Comment
}

func main() {
	db, err := gorm.Open(sqlite.Open(dbName), &gorm.Config{})
	if err != nil {
		panic("failed to connect database")
	}

	// Migrate the schema
	db.AutoMigrate(&Rating{}, &Comment{}, &Game{})

	r := mux.NewRouter()
	r.HandleFunc("/random", randomHandler).Methods("GET")
	http.Handle("/", r)

	// // Create
	// db.Create(&Game{UUID: "test", LaunchCoummand: "also test"})
	// db.Create(&Rating{Name: "greatest"})
}

func randomHandler(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusOK)
}

func addComment(db *gorm.DB, uuid string) error {
	var gameska Game
	if err := db.Where(&Game{UUID: "test"}).First(&gameska).Error; err != nil {
		return err
	}
	var ratingosek Rating
	if err := db.Where(&Rating{Name: "greatest"}).First(&ratingosek).Error; err != nil {
		return err
	}
	gameska.Comments = append(gameska.Comments, Comment{Rating: ratingosek, Message: "hahaaa"})
	db.Save(&gameska)
}