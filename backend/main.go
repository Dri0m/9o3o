package main

import (
	"bufio"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	_ "github.com/mattn/go-sqlite3"
	"golang.org/x/exp/slices"
)

type Game struct {
	UUID                string    `json:"uuid,omitempty"`
	Title               *string   `json:"title,omitempty"`
	AlternateTitles     *string   `json:"alternateTitles,omitempty"`
	Series              *string   `json:"series,omitempty"`
	Developer           *string   `json:"developer,omitempty"`
	Publisher           *string   `json:"publisher,omitempty"`
	Platform            *string   `json:"platform,omitempty"`
	Extreme             *string   `json:"extreme,omitempty"`
	PlayMode            *string   `json:"playMode,omitempty"`
	Status              *string   `json:"status,omitempty"`
	GameNotes           *string   `json:"gameNotes,omitempty"`
	Source              *string   `json:"source,omitempty"`
	LaunchCommand       *string   `json:"launchCommand,omitempty"`
	ReleaseDate         *string   `json:"releaseDate,omitempty"`
	Version             *string   `json:"version,omitempty"`
	OriginalDescription *string   `json:"originalDescription,omitempty"`
	Languages           *string   `json:"languages,omitempty"`
	Library             *string   `json:"library,omitempty"`
	Tags                *string   `json:"tags,omitempty"`
	DateAdded           time.Time `json:"dateAdded"`
	DateModified        time.Time `json:"dateModified"`
	VotesWorking        int       `json:"votesWorking"`
	VotesBroken         int       `json:"votesBroken"`
}

const InternalServerError = "internal server error"

var flashpointDB *sql.DB
var votesDB *sql.DB

var filter = make([]string, 0)

func main() {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnixMicro
	zerolog.SetGlobalLevel(zerolog.DebugLevel)

	// Import filter
	filterFile, err := os.Open("filter.txt")
	if err != nil {
		log.Warn().Msg("could not import filter.txt; NSFW entries will not be filtered")
	} else {
		log.Info().Msg("imported filter.txt")
	}

	sc := bufio.NewScanner(filterFile)

	for sc.Scan() {
		filter = append(filter, sc.Text())
	}

	// Connect Flashpoint database
	flashpointDB, err = sql.Open("sqlite3", "flashpoint.sqlite")
	if err != nil {
		log.Fatal().Err(err).Msg("failed to open flashpoint database")
	}

	defer flashpointDB.Close()
	log.Debug().Msg("connected to flashpoint.sqlite")

	// Create vote database if it doesn't exist, then connect
	if _, err := os.Stat("votes.sqlite"); errors.Is(err, os.ErrNotExist) {
		if _, err := os.Create("votes.sqlite"); err != nil {
			log.Fatal().Err(err).Msg("failed to initialize votes database")
		}
		log.Debug().Msg("created votes.sqlite file")
	}

	votesDB, err = sql.Open("sqlite3", "votes.sqlite?cache=shared&mode=rwc")
	if err != nil {
		log.Fatal().Err(err).Msg("failed to open votes database")
	}
	votesDB.SetMaxOpenConns(1)

	defer votesDB.Close()
	log.Info().Msg("connected to votes.sqlite")

	// Create vote table if it doesn't exist
	_, err = votesDB.Exec(`
        CREATE TABLE IF NOT EXISTS votes (
            id      VARCHAR(36) PRIMARY KEY,
            working INTEGER,
            broken  INTEGER
        )
    `)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to initialize votes table")
	}

	// Set up and start server
	http.HandleFunc("/random", randomHandler)
	http.HandleFunc("/get/", getHandler)
	http.HandleFunc("/working/", workingHandler)
	http.HandleFunc("/broken/", brokenHandler)

	server := &http.Server{
		Addr:         "127.0.0.1:8985",
		WriteTimeout: 15 * time.Second,
		ReadTimeout:  15 * time.Second,
	}

	log.Info().Str("addr", server.Addr).Msg("server started")
	err = server.ListenAndServe()
	if err != nil {
		log.Err(err).Msg("server error")
	}
}

func write500(w http.ResponseWriter) {
	w.Write([]byte(InternalServerError))
	w.WriteHeader(http.StatusInternalServerError)
}

// Return JSON-formatted info about a random Flashpoint entry
func randomHandler(w http.ResponseWriter, r *http.Request) {
	var g *Game

	// If the NSFW filter is active, "re-roll" until a non-NSFW entry is picked
ParentLoop:
	for {
		var uuid string

		fpRow := flashpointDB.QueryRow(`
                SELECT   id
                FROM     game 
                WHERE    launchCommand LIKE '%.swf'
                ORDER BY random()
                LIMIT    1
            `)
		err := fpRow.Scan(&uuid)
		if err != nil {
			log.Error().Err(err).Msg("failed to obtain random game from database")
			write500(w)
			return
		}

		g, err = getMetadata(uuid)
		if err != nil {
			log.Error().Err(err).Msg("failed to obtain metadata from database")
			write500(w)
			return
		}

		// we want a NSFW game so stop
		if r.URL.Query().Has("nsfw") {
			break
		}

		// otherwise check if the game is NSFW or not
		tagArray := strings.Split(*g.Tags, ";")

		for _, v := range tagArray {
			v := strings.TrimSpace(v)
			if slices.Contains(filter, v) {
				continue ParentLoop
			}
		}

		vRow := votesDB.QueryRow(`
                SELECT working, broken
                FROM   votes
                WHERE  id = ?
            `, g.UUID)
		err = vRow.Scan(&g.VotesWorking, &g.VotesBroken)
		if err != sql.ErrNoRows && err != nil {
			log.Error().Err(err).Msg("failed to obtain votes from database")
			write500(w)
			return
		}

		break
	}

	w.Header().Set("Content-Type", "application/json")
	err := json.NewEncoder(w).Encode(g)
	if err != nil {
		log.Error().Err(err).Msg("failed to marshal response to the user")
		write500(w)
		return
	}

	log.Debug().Msgf("served %v (%v)", r.URL.RequestURI(), g.UUID)
}

// Return JSON-formatted info about the specified entry
func getHandler(w http.ResponseWriter, r *http.Request) {
	uuid := r.URL.Path[5:]
	ok := verifyUUID(uuid)

	var g *Game
	var err error

	if ok {
		g, err = getMetadata(uuid)
		if err != sql.ErrNoRows && err != nil {
			log.Error().Err(err).Str("uuid", uuid).Msg("failed to obtain game from database")
			write500(w)
			return
		}

		vRow := votesDB.QueryRow(`
            SELECT working, broken
            FROM   votes
            WHERE  id = ?
        `, uuid)
		err = vRow.Scan(&g.VotesWorking, &g.VotesBroken)
		if err != sql.ErrNoRows && err != nil {
			log.Error().Err(err).Msg("failed to obtain votes from database")
			write500(w)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	err = json.NewEncoder(w).Encode(g)
	if err != nil {
		log.Error().Err(err).Msg("failed to marshal response to the user")
		write500(w)
		return
	}

	log.Debug().Msgf("served %v", r.URL.RequestURI())
}

// Add new vote that the specified entry is working
func workingHandler(w http.ResponseWriter, r *http.Request) {
	response, err := addVote(r.URL.Path[9:], `
        INSERT INTO votes (id, working, broken) VALUES (?, 1, 0)
        ON CONFLICT (id) DO UPDATE SET working = working + 1
    `)
	if err != nil {
		log.Error().Err(err).Msg("failed to add vote")
		write500(w)
		return
	}

	_, err = w.Write([]byte(response))
	if err != nil {
		log.Error().Err(err).Msg("failed write response to the user")
		write500(w)
		return
	}

	log.Debug().Msgf("received %v (%v)", r.URL.RequestURI(), response)
}

// Add new vote that the specified entry is broken
func brokenHandler(w http.ResponseWriter, r *http.Request) {
	response, err := addVote(r.URL.Path[8:], `
        INSERT INTO votes (id, working, broken) VALUES (?, 0, 1)
        ON CONFLICT (id) DO UPDATE SET broken = broken + 1
    `)
	if err != nil {
		log.Error().Err(err).Msg("failed to add vote")
		write500(w)
		return
	}

	_, err = w.Write([]byte(response))
	if err != nil {
		log.Error().Err(err).Msg("failed write response to the user")
		write500(w)
		return
	}

	log.Debug().Msgf("received %v (%v)", r.URL.RequestURI(), response)
}

// Update vote database with new vote
func addVote(id string, q string) (string, error) {
	if !verifyUUID(id) {
		return "UUID is not valid", nil
	}

	row := flashpointDB.QueryRow(`
        SELECT id
        FROM   game
        WHERE  id = ?
    `, id)
	switch err := row.Scan(&id); err {
	case sql.ErrNoRows:
		return "UUID does not exist", nil
	case nil:
	default:
		return "", err
	}

	if _, err := votesDB.Exec(q, id); err != nil {
		return "", err
	}

	return "Success", nil
}

func verifyUUID(s string) bool {
	if len(s) != 36 {
		return false
	}

	safeChars := "abcdefghijklmnopqrstuvwxyz0123456789-"
	for _, v := range s {
		if !strings.Contains(safeChars, string(v)) {
			return false
		}
	}

	return true
}

func getMetadata(uuid string) (*Game, error) {
	row := flashpointDB.QueryRow(`
		SELECT id, title, alternateTitles, series, developer, publisher, platform, extreme, playMode, status, notes,
		       source, launchCommand, releaseDate, version, originalDescription, language, library, tagsStr, dateAdded, dateModified
		FROM game
		WHERE id=?`, uuid)

	g := Game{}

	var isExtreme bool

	err := row.Scan(
		&g.UUID, &g.Title, &g.AlternateTitles, &g.Series, &g.Developer, &g.Publisher, &g.Platform,
		&isExtreme, &g.PlayMode, &g.Status, &g.GameNotes, &g.Source, &g.LaunchCommand, &g.ReleaseDate,
		&g.Version, &g.OriginalDescription, &g.Languages, &g.Library, &g.Tags, &g.DateAdded, &g.DateModified)
	if err != nil {
		return nil, err
	}
	if isExtreme {
		yes := "Yes"
		g.Extreme = &yes
	} else {
		no := "No"
		g.Extreme = &no
	}

	return &g, nil
}
