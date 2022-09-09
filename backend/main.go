package main

import (
    "database/sql"
    "fmt"
    "encoding/json"
    "errors"
    "log"
    "net/http"
    "os"
    "strings"
    "time"
    
  _ "github.com/mattn/go-sqlite3"
    "golang.org/x/exp/slices"
)

type Entry struct {
    UUID          string `json:"uuid"`
    Title         string `json:"title"`
    LaunchCommand string `json:"launchCommand"`
    VotesWorking  int    `json:"votesWorking"`
    VotesBroken   int    `json:"votesBroken"`
}

var flashpointDB *sql.DB
var errorFlashpointDB error

var votesDB *sql.DB
var errorVotesDB error

var filter []string

func main() {
    // Import filters
    filterRaw, err := os.ReadFile("filter.txt")
    if err != nil {
        log.Println("could not import filter.txt; NSFW entries will not be filtered")
    } else {
        log.Println("imported filter.txt")
    }
    
    filter = strings.Split(string(filterRaw), "\r\n")
    
    // Connect Flashpoint database
    flashpointDB, errorFlashpointDB = sql.Open("sqlite3", "flashpoint.sqlite")
    if errorFlashpointDB != nil {
        log.Fatal(errorFlashpointDB)
    }
    
    defer flashpointDB.Close()
    log.Println("connected to flashpoint.sqlite")
    
    // Create vote database if it doesn't exist, then connect
    if _, err := os.Stat("votes.sqlite"); errors.Is(err, os.ErrNotExist) {
        os.Create("votes.sqlite")
        log.Println("created votes.sqlite")
    }
    
    votesDB, errorVotesDB = sql.Open("sqlite3", "votes.sqlite")
    if errorVotesDB != nil {
        log.Fatal(errorVotesDB)
    }
    
    defer votesDB.Close()
    log.Println("connected to votes.sqlite")
    
    // Create vote table if it doesn't exist
    if _, err := votesDB.Exec(`
        CREATE TABLE IF NOT EXISTS votes (
            id      VARCHAR(36) PRIMARY KEY,
            working INTEGER,
            broken  INTEGER
        )
    `); err != nil {
        log.Fatal(err)
    }
        
    // Set up and start server
    http.HandleFunc("/random",   randomHandler )
    http.HandleFunc("/get/",     getHandler    )
    http.HandleFunc("/working/", workingHandler)
    http.HandleFunc("/broken/",  brokenHandler )
    
    server := &http.Server{
        Addr: "127.0.0.1:8985",
        WriteTimeout: 15 * time.Second,
        ReadTimeout:  15 * time.Second,
    }
    
    log.Printf("server started at %v\n", server.Addr)
    log.Fatal(server.ListenAndServe())
}

// Return JSON-formatted info about a random Flashpoint entry
func randomHandler(w http.ResponseWriter, r *http.Request) {
    var entry Entry
    
    // If the NSFW filter is active, "re-roll" until a non-NSFW entry is picked
    ParentLoop:
        for {
            var tags string
            
            fpRow := flashpointDB.QueryRow(`
                SELECT   id, title, launchCommand, tagsStr 
                FROM     game 
                WHERE    launchCommand LIKE '%.swf'
                ORDER BY random()
                LIMIT    1
            `)
            fpErr := fpRow.Scan(&entry.UUID, &entry.Title, &entry.LaunchCommand, &tags)
            if fpErr != sql.ErrNoRows && fpErr != nil {
                log.Fatal(fpErr)
            }
            
            if strings.HasSuffix(r.URL.RequestURI(), "?nsfw") {
                break
            }
            
            tagArray := strings.Split(tags, "; ")
            
            for _, v := range tagArray {
                if slices.Contains(filter, v) {
                    continue ParentLoop
                }
            }
            
            vRow := votesDB.QueryRow(`
                SELECT working, broken
                FROM   votes
                WHERE  id = ?
            `, entry.UUID)
            vErr := vRow.Scan(&entry.VotesWorking, &entry.VotesBroken)
            if vErr != sql.ErrNoRows && vErr != nil {
                log.Fatal(vErr)
            }
            
            break
        }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(entry)
    
    log.Printf("served %v (%v)\n", r.URL.RequestURI(), entry.UUID)
}

// Return JSON-formatted info about the specified entry
func getHandler(w http.ResponseWriter, r *http.Request) {
    var entry Entry
    
    if id := r.URL.Path[5:]; verifyUUID(id) {
        fpRow := flashpointDB.QueryRow(`
            SELECT id, title, launchCommand
            FROM   game
            WHERE  id = ?
        `, id)
        fpErr := fpRow.Scan(&entry.UUID, &entry.Title, &entry.LaunchCommand)
        if fpErr != sql.ErrNoRows && fpErr != nil {
            log.Fatal(fpErr)
        }
        
        vRow := votesDB.QueryRow(`
            SELECT working, broken
            FROM   votes
            WHERE  id = ?
        `, id)
        vErr := vRow.Scan(&entry.VotesWorking, &entry.VotesBroken)
        if vErr != sql.ErrNoRows && vErr != nil {
            log.Fatal(vErr)
        }
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(entry)
    
    log.Printf("served %v\n", r.URL.RequestURI())
}

// Add new vote that the specified entry is working
func workingHandler(w http.ResponseWriter, r *http.Request) {
    response := addVote(r.URL.Path[9:], `
        INSERT INTO votes (id, working, broken) VALUES (?, 1, 0)
        ON CONFLICT (id) DO UPDATE SET working = working + 1
    `)
    
    fmt.Fprint(w, response)
    log.Printf("received %v (%v)\n", r.URL.RequestURI(), response)
}

// Add new vote that the specified entry is broken
func brokenHandler(w http.ResponseWriter, r *http.Request) {
    response := addVote(r.URL.Path[8:], `
        INSERT INTO votes (id, working, broken) VALUES (?, 0, 1)
        ON CONFLICT (id) DO UPDATE SET broken = broken + 1
    `)
    
    fmt.Fprint(w, response)
    log.Printf("received %v (%v)\n", r.URL.RequestURI(), response)
}

// Update vote database with new vote
func addVote(id string, q string) string {
    if !verifyUUID(id) {
        return "UUID is not valid"
    }
    
    row := flashpointDB.QueryRow(`
        SELECT id
        FROM   game
        WHERE  id = ?
    `, id)
    switch err := row.Scan(&id); err {
    case sql.ErrNoRows:
        return "UUID does not exist"
    case nil:
    default:
        log.Fatal(err)
    }
    
    if _, err := votesDB.Exec(q, id); err != nil {
        log.Fatal(err)
    }
    
    return "Success"
}

// Verify that the passed UUID is the correct length and isn't an SQL injection
func verifyUUID (s string) bool {
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