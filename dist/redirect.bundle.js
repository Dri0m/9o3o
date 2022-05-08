/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/main.ts":
/*!*********************!*\
  !*** ./src/main.ts ***!
  \*********************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"all_the_launch_commands\": () => (/* binding */ all_the_launch_commands)\n/* harmony export */ });\nfunction all_the_launch_commands() {\r\n    return \"https://www.andkon.com/arcade/sport/bowman/bowman.swf\";\r\n}\r\n\n\n//# sourceURL=webpack://ruffle-redirect/./src/main.ts?");

/***/ }),

/***/ "./src/redirect.ts":
/*!*************************!*\
  !*** ./src/redirect.ts ***!
  \*************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var _main__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./main */ \"./src/main.ts\");\nvar __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {\r\n    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }\r\n    return new (P || (P = Promise))(function (resolve, reject) {\r\n        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }\r\n        function rejected(value) { try { step(generator[\"throw\"](value)); } catch (e) { reject(e); } }\r\n        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }\r\n        step((generator = generator.apply(thisArg, _arguments || [])).next());\r\n    });\r\n};\r\n\r\nwindow.addEventListener('load', function init() {\r\n    const redirect_to = \"https://ooooooooo.ooo/htdocs/\";\r\n    const entry = (0,_main__WEBPACK_IMPORTED_MODULE_0__.all_the_launch_commands)();\r\n    // Set the base URL for requests with relative files.\r\n    // The base is set so all relative paths are relative to the entry file.\r\n    // Note: This makes it possible for the Flash application to use relative paths.\r\n    { // <- This scope is here just to separate this messy code from the parent scope.\r\n        const base_url = new URL(entry);\r\n        const last_slash_index = base_url.pathname.lastIndexOf('/');\r\n        if (last_slash_index !== -1) {\r\n            base_url.pathname = base_url.pathname.substr(0, last_slash_index);\r\n        }\r\n        window.RufflePlayer.config.base = base_url.href;\r\n    }\r\n    // Create and add the Ruffle player\r\n    const ruffle = window.RufflePlayer.newest();\r\n    const player = ruffle.createPlayer();\r\n    document.body.appendChild(player);\r\n    // Initialize state\r\n    // Note: These values to not have to be stored globally, you could store them wherever.\r\n    window.RuffleRedirect = {\r\n        redirect_to: new URL(redirect_to),\r\n        original_fetch: window.fetch,\r\n    };\r\n    // Load the Flash file into Ruffle\r\n    //player.load(fakeify(new URL(entry)).toString());\r\n    // Replace the fetch function with the wrapped version.\r\n    // This is the function that Ruffle calls whenever it makes a request.\r\n    // Note: This is done last so all of Ruffles files are loaded before we start rerouting requests.\r\n    setTimeout(function () {\r\n        window.fetch = wrappedFetch;\r\n        player.load(entry);\r\n    }, 1000);\r\n});\r\nfunction fakeify(input_url) {\r\n    const fake_input_url = new URL(window.RuffleRedirect.redirect_to.href);\r\n    fake_input_url.pathname += input_url.hostname;\r\n    if (!input_url.pathname.startsWith('/')) {\r\n        fake_input_url.pathname += '/';\r\n    }\r\n    fake_input_url.pathname += input_url.pathname;\r\n    return fake_input_url.href;\r\n}\r\nfunction wrappedFetch(input, init) {\r\n    return __awaiter(this, void 0, void 0, function* () {\r\n        // Get the requested URL\r\n        let input_url;\r\n        if (input instanceof Request) {\r\n            input_url = new URL(input.url);\r\n        }\r\n        else {\r\n            input_url = new URL(input + '');\r\n        }\r\n        let fake_input = input;\r\n        let fake_init = init;\r\n        // Modify the arguments to redirect the request\r\n        // Note: Feel free to edit how input_url is remapped. Maybe you want to include the protocol, port etc.\r\n        // Diagram over URL components: https://nodejs.org/api/url.html#url_url_strings_and_url_objects\r\n        fake_input = fakeify(input_url);\r\n        // { // <- This scope is here just to separate this messy code from the parent scope.\r\n        //   const fake_input_url = new URL(window.RuffleRedirect!.redirect_to.href);\r\n        //   fake_input_url.pathname += input_url.hostname;\r\n        //   if (!input_url.pathname.startsWith('/')) { fake_input_url.pathname += '/'; }\r\n        //   fake_input_url.pathname += input_url.pathname;\r\n        //   fake_input = fake_input_url.href;\r\n        // }\r\n        if (input instanceof Request) {\r\n            fake_init = input;\r\n        }\r\n        // Note: This is just for debugging and troubleshooting purposes\r\n        console.log('Redirected request', 'From:', input_url.href, 'To:', fake_input);\r\n        const original_fetch = window.RuffleRedirect.original_fetch;\r\n        const response = yield original_fetch(fake_input, fake_init);\r\n        // Note: It is possible to create a new \"fake\" response and make any modifications you want.\r\n        // const fake_response = new Response(response.body, response);\r\n        return response;\r\n    });\r\n}\r\n\n\n//# sourceURL=webpack://ruffle-redirect/./src/redirect.ts?");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = __webpack_require__("./src/redirect.ts");
/******/ 	
/******/ })()
;