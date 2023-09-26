package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	_ "github.com/mattn/go-sqlite3"
	"golang.org/x/exp/slices"
)

type Config struct {
	Address                 string   `json:"address"`
	FPDatabase              string   `json:"fpDatabase"`
	VotesDatabase           string   `json:"votesDatabase"`
	AllowedLaunchCommands   []string `json:"allowedLaunchCommands"`
	AllowedApplicationPaths []string `json:"allowedApplicationPaths"`
	FilteredTags            []string `json:"filteredTags"`
}

type Entry struct {
	UUID          string `json:"uuid"`
	Title         string `json:"title"`
	LaunchCommand string `json:"launchCommand"`
	ArchivePath   string `json:"archivePath"`
	Extreme       bool   `json:"extreme"`
	VotesWorking  int    `json:"votesWorking"`
	VotesBroken   int    `json:"votesBroken"`
}

var (
	config        Config
	fpWhere       string
	fpDatabase    *sql.DB
	votesDatabase *sql.DB
)

func main() {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnixMicro
	zerolog.SetGlobalLevel(zerolog.DebugLevel)

	// Load config.json
	configFile, err := os.ReadFile("config.json")
	if err != nil {
		log.Fatal().Err(err).Msg("failed to read config.json")
	} else if err := json.Unmarshal([]byte(configFile), &config); err != nil {
		log.Fatal().Err(err).Msg("failed to parse config.json")
	} else {
		log.Debug().Msg("loaded config.json")
	}

	// Connect to Flashpoint database
	fpDatabase, err = sql.Open("sqlite3", config.FPDatabase+"?mode=ro") // read only open
	if err != nil {
		log.Fatal().Err(err).Msg("failed to open Flashpoint database")
	}

	defer fpDatabase.Close()
	log.Debug().Msg("connected to Flashpoint database")

	// Create votes database if it doesn't exist
	if _, err := os.Stat(config.VotesDatabase); errors.Is(err, os.ErrNotExist) {
		if _, err := os.Create(config.VotesDatabase); err != nil {
			log.Fatal().Err(err).Msg("failed to initialize votes database")
		}
		log.Debug().Msg("created votes database")
	}

	// Connect to votes database
	votesDatabase, err = sql.Open("sqlite3", config.VotesDatabase+"?cache=shared&mode=rwc")
	if err != nil {
		log.Fatal().Err(err).Msg("failed to open votes database")
	}
	votesDatabase.SetMaxOpenConns(1)

	defer votesDatabase.Close()
	log.Info().Msg("connected to votes database")

	// Create vote table if it doesn't exist
	_, err = votesDatabase.Exec(`
		CREATE TABLE IF NOT EXISTS votes (
			id      VARCHAR(36) PRIMARY KEY,
			working INTEGER,
			broken  INTEGER
		)
	`)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to initialize votes table")
	}

	// Build WHERE component of SQL query
	if len(config.AllowedLaunchCommands) > 0 || len(config.AllowedApplicationPaths) > 0 {
		whereArray := make([]string, 0)
		for _, s := range config.AllowedLaunchCommands {
			whereArray = append(whereArray, fmt.Sprintf(`launchCommand LIKE "%s"`, s))
		}
		for _, s := range config.AllowedApplicationPaths {
			whereArray = append(whereArray, fmt.Sprintf(`applicationPath LIKE "%s"`, s))
		}
		fpWhere = strings.Join(whereArray, " OR ")
	}

	// Set up and start server
	http.HandleFunc("/get", getHandler)
	http.HandleFunc("/working", votesHandler)
	http.HandleFunc("/broken", votesHandler)

	// static fileserver
	http.HandleFunc("/", rootHandler)
	http.HandleFunc("/faq", faqHandler)
	fs := http.FileServer(http.Dir("../static"))
	http.Handle("/static/", http.StripPrefix("/static", fs))
	http.HandleFunc("/static/browse", oldBrowseRedirectHandler)

	server := &http.Server{
		Addr:         config.Address,
		WriteTimeout: 15 * time.Second,
		ReadTimeout:  15 * time.Second,
	}

	log.Info().Str("addr", server.Addr).Msg("server started")
	err = server.ListenAndServe()
	if err != nil {
		log.Err(err).Msg("server error")
	}
}

func rootHandler(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "../static/index.html")
	log.Debug().Msg("served /")
}

func faqHandler(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "../static/faq/index.html")
	log.Debug().Msg("served /faq")
}

func oldBrowseRedirectHandler(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, "https://ooooooooo.ooo/browse", http.StatusMovedPermanently)
	log.Debug().Msg("served /static/browse")
}

// Return JSON-formatted info about a specific or random entry
func getHandler(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	uuid := query.Get("id")

	var entry *Entry

	for {
		var err error
		if entry, err = getEntry(uuid); err != nil {
			var response string

			if err == sql.ErrNoRows {
				response = "the specified UUID is invalid"
			} else {
				response = "failed to obtain entry from database"
			}

			log.Error().Err(err).Str("uuid", uuid).Msg(response)
			w.WriteHeader(http.StatusInternalServerError)
			writeMessage(w, response)

			return
		}

		if entry.Extreme && len(uuid) == 0 && strings.ToLower(query.Get("filter")) == "true" {
			continue
		}

		break
	}

	w.Header().Set("Content-Type", "application/json")
	// w.Header().Set("Access-Control-Allow-Origin", "*")
	// w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	if err := json.NewEncoder(w).Encode(entry); err != nil {
		log.Error().Err(err).Msg("failed to marshal response to the user")
		writeServerError(w)
		return
	}

	log.Debug().Msgf("served %v", r.URL.RequestURI())
}

// Add new vote for the specified entry
func votesHandler(w http.ResponseWriter, r *http.Request) {
	var response string

	if err := addVote(r.URL.Query().Get("id"), r.URL.Path == "/working"); err != nil {
		log.Error().Err(err).Msg("failed to add vote")
		if err == sql.ErrNoRows {
			response = "the specified UUID is invalid"
		} else {
			response = "internal server error"
			w.WriteHeader(http.StatusInternalServerError)
		}
	} else {
		response = "success"
	}

	// w.Header().Set("Access-Control-Allow-Origin", "*")
	// w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	writeMessage(w, response)
	log.Debug().Msgf("received %v (%v)", r.URL.RequestURI(), response)
}

// Make sure entry has a valid UUID and contains a supported file extension in the launch command
func getEntry(uuid string) (*Entry, error) {
	if len(uuid) != 0 && !verifyUUID(uuid) {
		return nil, sql.ErrNoRows
	}

	var suffix string
	if len(uuid) == 0 {
		suffix = "ORDER BY random() LIMIT 1"
	} else {
		suffix = "AND id = ?"
	}

	var entry Entry
	var tagsStr string

	fpRow := fpDatabase.QueryRow(fmt.Sprintf(`
		SELECT id, title, tagsStr, launchCommand, path FROM (
			SELECT game.id, game.title, game.tagsStr,
				coalesce(game_data.launchCommand, game.launchCommand) AS launchCommand,
				coalesce(game_data.applicationPath, game.applicationPath) AS applicationPath,
				IFNULL(path, "") AS path
			FROM game LEFT JOIN game_data ON game.id = game_data.gameId
		) WHERE (%s) %s
	`, fpWhere, suffix), uuid)
	if err := fpRow.Scan(&entry.UUID, &entry.Title, &tagsStr, &entry.LaunchCommand, &entry.ArchivePath); err != nil {
		return nil, err
	}

	entry.Extreme = false
	for _, tag := range strings.Split(tagsStr, "; ") {
		if slices.Contains(config.FilteredTags, tag) {
			entry.Extreme = true
			break
		}
	}

	votesRow := votesDatabase.QueryRow("SELECT working, broken FROM votes WHERE id = ?", uuid)
	if err := votesRow.Scan(&entry.VotesWorking, &entry.VotesBroken); err != sql.ErrNoRows && err != nil {
		return nil, err
	}

	return &entry, nil
}

// Update votes database with new vote
func addVote(uuid string, working bool) error {
	if !verifyUUID(uuid) {
		return sql.ErrNoRows
	}

	row := fpDatabase.QueryRow(`
			SELECT game.id 
			FROM game 
			LEFT JOIN game_data ON game.id = game_data.gameId 
			WHERE game.id = ?`, uuid)
	if err := row.Err(); err != nil {
		return err
	}

	var (
		workingInt int
		brokenInt  int
		voteString string
	)

	if working {
		workingInt = 1
		brokenInt = 0
		voteString = "working"
	} else {
		workingInt = 0
		brokenInt = 1
		voteString = "broken"
	}

	if _, err := votesDatabase.Exec(fmt.Sprintf(`
		INSERT INTO votes (id, working, broken) VALUES (?, %[1]d, %[2]d)
		ON CONFLICT (id) DO UPDATE SET %[3]s = %[3]s + 1
	`, workingInt, brokenInt, voteString), uuid); err != nil {
		return err
	}

	return nil
}

// Check if UUID is the correct format
func verifyUUID(uuid string) bool {
	if len(uuid) != 36 {
		return false
	}

	for _, v := range uuid {
		if !strings.Contains("abcdefghijklmnopqrstuvwxyz0123456789-", string(v)) {
			return false
		}
	}

	return true
}

func writeServerError(w http.ResponseWriter) {
	w.WriteHeader(http.StatusInternalServerError)
	writeMessage(w, "internal server error")
}

func writeMessage(w http.ResponseWriter, message string) {
	if _, err := w.Write([]byte(message)); err != nil {
		log.Error().Err(err).Msg("failed write response to the user")
		return
	}
}
