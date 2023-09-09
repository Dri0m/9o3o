# 9o3o
[https://ooooooooo.ooo/](https://ooooooooo.ooo/)

This is an experimental web frontend for the [Flashpoint Archive](https://flashpointarchive.org/). It utilizes open-source players such as [Ruffle](https://ruffle.rs/) and [X_ITE](https://create3000.github.io/x_ite/), while offering the full extent of Flashpoint's redirection and URL spoofing capabilities in the browser.

## Setup API Locally

### Prerequisites
* [Go](https://go.dev/) (should be added to PATH)
* [MinGW-w64](https://www.mingw-w64.org/) (`bin` folder should be added to PATH)
* `flashpoint.sqlite` (place inside backend folder or define path in config.json)

### Instructions
1. Download the source code
2. Open the Command Prompt in the `backend` folder
3. Use the command `go build` to start compiling the executable
4. Once finished, open the executable within the Command Prompt using the command `backend.exe`

The API will now be served from `http://127.0.0.1:8985`.