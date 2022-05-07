window.addEventListener('load', function init() {
  // Create and append the iframe that will contain the Ruffle player
  // Note: This is done in code (instead of html) because we need to pass
  // search paramters. If you're generating the HTML somewhere (like PHP
  // or React) then you can do this from there.
  const player = document.createElement('iframe');
  player.src = `player.html${window.location.search}`; // You don't need to forward all search paramters (it's just convenient)
  player.className = 'player';
  document.body.appendChild(player);
});
