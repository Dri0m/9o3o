// Create global variable that will contain game data
let json;

// URL of Flashpoint's htdocs folder
const htdocs = 'https://ooooooooo.ooo/htdocs/';
// URL to fetch a random game from
const random = 'https://api.ooooooooo.ooo/random';
// URL templates to tell the site that a game is or isn't working
const working = (uuid) => `https://api.ooooooooo.ooo/game/${uuid}/worky`;
const broken  = (uuid) => `https://api.ooooooooo.ooo/game/${uuid}/not-worky`;

// Create copy of unaltered fetch() method
const originalFetch = window.fetch;

// To-do: figure out why 'load' event never fires
document.addEventListener('DOMContentLoaded', () => {
    // Get data for random game
    fetch(random)
    // Get JSON representation of that data
    .then((response) => response.json())
    // Do the things
    .then((data) => {
        // Initialize global variable with JSON data
        json = data;
        
        // Store original, unaltered URL of game
        const baseURL = new URL(json.launch_command);
        
        // Create Ruffle instance and add it to DOM
        const player = window.RufflePlayer.newest().createPlayer();
        document.querySelector('#player').append(player);
        
        // Add redirection to fetch() method
        // Concept adapted from https://github.com/TBubba/ruffle-redirect-poc
        window.fetch = async (resource, options) => {
            // Get URL of requested file relative to base
            const resourceURL = new URL(resource instanceof Request ? resource.url : resource, baseURL.href);
            
            // Don't redirect if the file is a Ruffle dependency or part of a browser extension
            if (resourceURL.hostname == 'unpkg.com' || !resourceURL.protocol.startsWith('http'))
                return await originalFetch(resource, options);
            else
                return await originalFetch(htdocs + resourceURL.hostname + resourceURL.pathname, options);
        }
        
        // Load game from original URL
        // This will be redirected by the modified fetch() method as well as any other files the game requests
        player.load(baseURL.href);
        
        // Display title of game
        document.querySelector('#title').textContent = json.title;
        
        // Set dimensions of player to that of the game once loaded
        player.addEventListener('loadedmetadata', () => {
            player.style.width  = player.metadata.width  + 'px';
            player.style.height = player.metadata.height + 'px';
        });
        
        // Now that everything else is ready, display voting prompt
        document.querySelector('#vote').hidden = false;
    });
});

// Send vote to server
function vote(callback) {
    let xhr = new XMLHttpRequest();
    xhr.open('POST', callback(json.uuid), true);
    xhr.send();
    
    // Replace voting buttons with a thank you message
    document.querySelector('#vote span:nth-child(1)').hidden = true;
    document.querySelector('#vote span:nth-child(2)').hidden = false;
}