// content.js - Runs in ISOLATED world
// Relays captured requests and tokens from inject.js (MAIN world) to the service worker.

window.addEventListener("message", function (event) {
    if (event.source !== window) return;

    if (event.data && event.data.type === "API_SNIFFER_PRO") {
        const payload = event.data.payload;

        chrome.storage.local.get({ is_paused: true }, function (result) {
            if (result.is_paused) return;

            chrome.runtime.sendMessage({
                type: "SAVE_REQUEST",
                payload
            }, function () {
                if (chrome.runtime.lastError) {
                    console.warn("[API Sniffer Pro v3] Failed to save request:", chrome.runtime.lastError.message);
                }
            });
        });
    }

    if (event.data && event.data.type === "API_SNIFFER_TOKEN") {
        const token = event.data.payload;

        chrome.storage.local.get({ is_paused: true }, function (result) {
            if (result.is_paused) return;

            chrome.runtime.sendMessage({
                type: "SAVE_TOKEN",
                name: token.name,
                value: token.value,
                source: token.source,
                url: token.url
            }, function () {
                if (chrome.runtime.lastError) {
                    console.warn("[API Sniffer Pro v3] Failed to save token:", chrome.runtime.lastError.message);
                }
            });
        });
    }

    if (event.data && event.data.type === "API_SNIFFER_GET_PAUSE") {
        chrome.storage.local.get({ is_paused: true }, function (result) {
            window.postMessage({ type: "API_SNIFFER_PAUSE_STATE", paused: result.is_paused }, "*");
        });
    }
});

chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === "local" && changes.is_paused) {
        window.postMessage({
            type: "API_SNIFFER_PAUSE_STATE",
            paused: changes.is_paused.newValue
        }, "*");
    }
});
