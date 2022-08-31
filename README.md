# 9o3o

[https://ooooooooo.ooo/](https://ooooooooo.ooo/)

This is a website that loads a random game from [BlueMaxima's Flashpoint](https://bluemaxima.org/flashpoint/) into the browser using [Ruffle](https://github.com/ruffle-rs/ruffle). It also replicates the URL spoofing capabilities of Flashpoint using a system based on TBubba's [Ruffle Redirect](https://github.com/TBubba/ruffle-redirect-poc) proof-of-concept.

While the site currently has little functionality, the end goal is to essentially turn it into an online version of the Flashpoint archive.

## Setup API Locally

### Prerequisites
* [Go](https://go.dev/) (should be added to PATH)
* [MinGW-w64](https://www.mingw-w64.org/) (`bin` folder should be added to PATH)
* [flashpoint.sqlite](http://infinity.unstable.life/Flashpoint/Data/flashpoint.sqlite) (should exist in the same directory as the compiled executable)

### Instructions
1. Download the source code
2. Open the Command Prompt in the `backend` folder
3. Use the command `go build` to start compiling the executable
4. Once finished, open the executable within the Command Prompt using the command `backend.exe`

The API will now be served from `http://127.0.0.1:8985`.