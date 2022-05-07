# Ruffle Redirect

A proof of concept for intercepting web requests made from a Flash application running inside (standalone) Ruffle.

The purpose of this is to make sure that is is feasable to make Ruffle run Flash applications that are "site locked" or relies on resources located at hard coded URLs.

Read the source code for more information (it's short and commented).

# Running Demo

Note: This project does not contain any Flash files. You have to provide one yourself.

0. Install [Node](https://nodejs.org/)
1. Install dependencies ``npm i``
2. Build the project and run the file server ``npm run serve``
3. Place your Flash file in ``/static/redirect_root``. This is the root folder of the file server
4. Open the demo in your web browser ``http://localhost:8080/`` (you will require specific seach paramters, see the next section)

# Details

## Search parameters

__The demo uses the following search parameters:__

* ``redirect_to`` - Base URL that all redirects will be redirected to. Include a trailing slash.
* ``entry`` - URL of the Flash file to load (this will be redirected).

Example: ``http://localhost:8080/?redirect_to=http://localhost:8080/redirect_root/&entry=https://www.coolmath-games.com/games/learn_to_fly_final_3.54k_coolmath_1.swf``

## "redirect_root" folder

__The "redirect_root" folder scructure looks like this:__

* The direct subfolders of redirect_root are named after _hostnames_ (examples: ``www.coolmath-games.com``, ``argmorgames.com``, ``localhost``)
* All deeper subfolders are parts from the _pathname_ (example: ``games``)
* Files can be put anywhere in this folder structure

Example structure:

* ``static/redirect_root``
  - ``www.coolmath-games.com``
    * ``games``
      - ``learn_to_fly_final_3.54k_coolmath_1.swf``
      - ``some_other_game_they_probably_have.swf``
  - ``localhost``
    * ``cool_game.swf``
    * ``data.xml``

## Redirection

__The redirection (roughly) works like this:__

* Ruffle attempts to send a request with the URL ``https://www.coolmath-games.com/games/very_cool/game.swf``
* The request is intercepted and its URL is remapped by using redirect_to and an algorithm (redirect_to = ``http://localhost:8080/redirect_root/``).
  - The algorithm takes two arguments (the requsts URL and redirect_to) and it outputs the new request URL. First it sets the new request URL to redirect_to, then it appends the current requests _hostname_ and _pathname_ to the _pathname_ of the new request URL ([see this diagram](https://nodejs.org/api/url.html#url_url_strings_and_url_objects)).
* The request is sent to ``http://localhost:8080/redirect_root/www.coolmath-games.com/games/very_cool/game.swf``
