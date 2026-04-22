// background.js - Service Worker for API Sniffer Pro v3
// Intercepts network requests, applies capture rules, and stores deduped results.

const TOKEN_PATTERNS = [
    { name: "BEARER_TOKEN", regex: /^Bearer\s+(.+)$/i, headerKey: "authorization" },
    { name: "API_KEY", regex: /^([\w\-_.]+)$/i, headerKey: "x-api-key" },
    { name: "TOKEN_HEADER", regex: /^Token\s+(.+)$/i, headerKey: "authorization" }
];

const JWT_REGEX = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const MONITOR_PATH = "popup.html";
const MAX_REQUESTS = 2000;
const DEFAULT_CAPTURE_SETTINGS = {
    domain_filter: "",
    path_filter: "",
    method_filter: "ALL",
    keyword_filter: "",
    active_tab_only: true,
    capture_tab_id: null
};

let monitorWindowId = null;

function enableSidePanelAction() {
    if (!chrome.sidePanel?.setPanelBehavior) return;

    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
        console.error("[API Sniffer Pro v3] Failed to enable side panel action:", error);
    });
}

function normalizeCaptureSettings(settings = {}) {
    return {
        ...DEFAULT_CAPTURE_SETTINGS,
        ...settings
    };
}

function serializeForMatch(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;

    try {
        return JSON.stringify(value);
    } catch (error) {
        return String(value);
    }
}

function stableSerialize(value) {
    if (value == null) return "";
    if (typeof value !== "object") return String(value);

    if (Array.isArray(value)) {
        return `[${value.map(stableSerialize).join(",")}]`;
    }

    return `{${Object.keys(value).sort().map((key) => `${key}:${stableSerialize(value[key])}`).join(",")}}`;
}

function matchesListFilter(rawFilter, value) {
    const filter = (rawFilter || "").trim().toLowerCase();
    if (!filter) return true;

    const normalizedValue = (value || "").toLowerCase();
    const terms = filter.split(/[\s,]+/).filter(Boolean);
    if (terms.length === 0) return true;

    return terms.some((term) => normalizedValue.includes(term));
}

function shouldCaptureBySettings(settings, context) {
    const normalized = normalizeCaptureSettings(settings);
    const {
        tabId,
        url,
        method = "",
        keywordSource = ""
    } = context;

    if (normalized.active_tab_only && normalized.capture_tab_id !== null && normalized.capture_tab_id !== tabId) {
        return false;
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch (error) {
        return false;
    }

    if (!matchesListFilter(normalized.domain_filter, parsedUrl.hostname)) {
        return false;
    }

    if (normalized.path_filter && !parsedUrl.pathname.toLowerCase().includes(normalized.path_filter.toLowerCase())) {
        return false;
    }

    if (normalized.method_filter && normalized.method_filter !== "ALL" && normalized.method_filter !== method.toUpperCase()) {
        return false;
    }

    if (normalized.keyword_filter) {
        const haystack = `${url}\n${keywordSource}`.toLowerCase();
        if (!haystack.includes(normalized.keyword_filter.toLowerCase())) {
            return false;
        }
    }

    return true;
}

function buildHighlightTags(payload) {
    const tags = new Set();
    const requestHeaders = serializeForMatch(payload.requestHeaders).toLowerCase();
    const responseHeaders = serializeForMatch(payload.responseHeaders).toLowerCase();
    const requestBody = serializeForMatch(payload.requestBody).toLowerCase();
    const responseBody = serializeForMatch(payload.responseBody).toLowerCase();
    const url = String(payload.url || "").toLowerCase();
    const status = Number(payload.status || 0);

    if (/authorization|cookie|x-api-key|apikey|api-key/.test(requestHeaders)) tags.add("AUTH");
    if (/token|access_token|refresh_token|jwt|bearer/.test(`${requestHeaders}\n${requestBody}\n${responseBody}`)) tags.add("TOKEN");
    if (status >= 400) tags.add("ERROR");
    if (url.includes("graphql") || /operationname|query|mutation/.test(requestBody)) tags.add("GRAPHQL");
    if (typeof payload.responseBody === "object" || responseHeaders.includes("application/json") || requestHeaders.includes("application/json")) tags.add("JSON");

    return [...tags];
}

async function saveToken(name, value, source, url, tabId = null) {
    if (chrome.extension && !chrome.extension.inIncognitoContext) return;

    const data = await chrome.storage.local.get({
        is_paused: true,
        extracted_tokens: {},
        capture_settings: DEFAULT_CAPTURE_SETTINGS,
        capture_session: null
    });
    if (data.is_paused) return;

    const captureSettings = normalizeCaptureSettings(data.capture_settings);
    if (!shouldCaptureBySettings(captureSettings, {
        tabId,
        url,
        method: "TOKEN",
        keywordSource: `${name}\n${source}\n${value}`
    })) {
        return;
    }

    const tokens = data.extracted_tokens;

    let finalName = name;
    try {
        const hostname = new URL(url).hostname;
        const domain = hostname.replace(/\./g, "_").toUpperCase();
        finalName = `${domain}_${name}`;
    } catch (error) {
        finalName = name;
    }

    const key = finalName;
    const existing = tokens[key];
    tokens[key] = {
        name: finalName,
        value,
        source,
        url,
        tabId,
        sessionId: data.capture_session?.id || null,
        sessionName: data.capture_session?.name || null,
        count: (existing?.count || 0) + 1,
        updatedAt: new Date().toISOString()
    };

    await chrome.storage.local.set({ extracted_tokens: tokens });
}

function extractTokensFromHeaders(headers, url, tabId) {
    if (!headers) return;

    for (const header of headers) {
        const headerName = header.name.toLowerCase();
        const headerValue = header.value;

        for (const pattern of TOKEN_PATTERNS) {
            if (headerName === pattern.headerKey) {
                const match = headerValue.match(pattern.regex);
                if (match) {
                    saveToken(pattern.name, match[1] || headerValue, "request-header", url, tabId);
                } else if (headerName === "authorization") {
                    saveToken("AUTH_TOKEN", headerValue, "request-header", url, tabId);
                }
            }
        }

        if ((headerName.includes("token") || headerName.includes("auth")) && headerName !== "authorization") {
            const tokenName = headerName.replace(/[^a-z0-9]/gi, "_").toUpperCase();
            saveToken(tokenName, headerValue, "request-header", url, tabId);
        }

        const jwtMatches = headerValue.match(JWT_REGEX);
        if (jwtMatches) {
            for (const jwt of jwtMatches) {
                saveToken("JWT_TOKEN", jwt, "request-header", url, tabId);
            }
        }

        if (headerName === "cookie") {
            const cookies = headerValue.split(";").map((cookie) => cookie.trim());
            for (const cookie of cookies) {
                const [cookieName, ...cookieValueParts] = cookie.split("=");
                const cookieValue = cookieValueParts.join("=");
                const lowerName = cookieName.toLowerCase().trim();
                if (lowerName.includes("token") || lowerName.includes("session") || lowerName.includes("auth") || lowerName.includes("jwt")) {
                    const envName = `COOKIE_${cookieName.trim().replace(/[^a-z0-9]/gi, "_").toUpperCase()}`;
                    saveToken(envName, cookieValue, "cookie", url, tabId);
                }
            }
        }
    }
}

async function storeCapturedRequest(payload, tabId) {
    if (chrome.extension && !chrome.extension.inIncognitoContext) {
        return { status: "incognito_only" };
    }

    const data = await chrome.storage.local.get({
        is_paused: true,
        captured_requests: [],
        capture_settings: DEFAULT_CAPTURE_SETTINGS,
        capture_session: null
    });
    if (data.is_paused) return { status: "paused" };

    const settings = normalizeCaptureSettings(data.capture_settings);
    const keywordSource = [
        serializeForMatch(payload.requestHeaders),
        serializeForMatch(payload.requestBody),
        serializeForMatch(payload.responseHeaders),
        serializeForMatch(payload.responseBody)
    ].join("\n");

    if (!shouldCaptureBySettings(settings, {
        tabId,
        url: payload.url,
        method: payload.method || "GET",
        keywordSource
    })) {
        return { status: "filtered" };
    }

    const now = payload.timestamp || new Date().toISOString();
    const dedupeKey = [
        tabId,
        payload.method || "GET",
        payload.url || "",
        stableSerialize(payload.requestHeaders),
        stableSerialize(payload.requestBody)
    ].join("|");

    const nextEntry = {
        ...payload,
        tabId,
        dedupeKey,
        count: 1,
        firstSeenAt: now,
        lastSeenAt: now,
        sessionId: data.capture_session?.id || null,
        sessionName: data.capture_session?.name || null,
        highlightTags: buildHighlightTags(payload)
    };

    const requests = data.captured_requests || [];
    const existingIndex = requests.findIndex((item) => item.dedupeKey === dedupeKey);

    if (existingIndex >= 0) {
        const existing = requests[existingIndex];
        const mergedTags = new Set([...(existing.highlightTags || []), ...nextEntry.highlightTags]);
        requests[existingIndex] = {
            ...existing,
            ...nextEntry,
            count: (existing.count || 1) + 1,
            firstSeenAt: existing.firstSeenAt || now,
            lastSeenAt: now,
            highlightTags: [...mergedTags]
        };
    } else {
        requests.push(nextEntry);
        if (requests.length > MAX_REQUESTS) {
            requests.splice(0, requests.length - MAX_REQUESTS);
        }
    }

    await chrome.storage.local.set({ captured_requests: requests });
    return { status: "ok" };
}

chrome.webRequest.onBeforeSendHeaders.addListener(
    async (details) => {
        if (!details.incognito) return;

        const data = await chrome.storage.local.get({
            is_paused: true,
            capture_settings: DEFAULT_CAPTURE_SETTINGS
        });
        if (data.is_paused) return;

        const skipExts = [".css", ".js", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".woff", ".woff2", ".ico"];
        try {
            const pathname = new URL(details.url).pathname.toLowerCase();
            if (skipExts.some((ext) => pathname.endsWith(ext))) return;
        } catch (error) {
            return;
        }

        if (!shouldCaptureBySettings(data.capture_settings, {
            tabId: details.tabId,
            url: details.url,
            method: details.method || "GET",
            keywordSource: serializeForMatch(details.requestHeaders)
        })) {
            return;
        }

        extractTokensFromHeaders(details.requestHeaders, details.url, details.tabId);
    },
    { urls: ["<all_urls>"] },
    ["requestHeaders", "extraHeaders"]
);

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get({
        is_paused: null,
        capture_settings: null
    }, (result) => {
        const patch = {};
        if (result.is_paused === null) patch.is_paused = true;
        if (result.capture_settings === null) patch.capture_settings = DEFAULT_CAPTURE_SETTINGS;
        if (Object.keys(patch).length > 0) {
            chrome.storage.local.set(patch);
        }
    });

    enableSidePanelAction();
});

chrome.runtime.onStartup.addListener(() => {
    enableSidePanelAction();
});

async function openMonitorWindow() {
    const monitorUrl = chrome.runtime.getURL(MONITOR_PATH);

    if (monitorWindowId !== null) {
        try {
            const existingWindow = await chrome.windows.get(monitorWindowId);
            await chrome.windows.update(existingWindow.id, { focused: true });
            return;
        } catch (error) {
            monitorWindowId = null;
        }
    }

    const createdWindow = await chrome.windows.create({
        url: monitorUrl,
        type: "popup",
        width: 520,
        height: 760,
        focused: true
    });

    monitorWindowId = createdWindow.id ?? null;
}

if (!chrome.sidePanel?.setPanelBehavior) {
    chrome.action.onClicked.addListener(() => {
        openMonitorWindow().catch((error) => {
            console.error("[API Sniffer Pro v3] Failed to open monitor window:", error);
        });
    });
}

chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === monitorWindowId) {
        monitorWindowId = null;
    }
});

enableSidePanelAction();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "SAVE_TOKEN") {
        if (!sender.tab?.incognito) {
            sendResponse({ status: "incognito_only" });
            return true;
        }

        saveToken(message.name, message.value, message.source, message.url, sender.tab?.id ?? null)
            .then(() => sendResponse({ status: "ok" }))
            .catch((error) => sendResponse({ status: "error", error: error.message }));
        return true;
    }

    if (message.type === "SAVE_REQUEST") {
        if (!sender.tab?.incognito) {
            sendResponse({ status: "incognito_only" });
            return true;
        }

        storeCapturedRequest(message.payload, sender.tab?.id ?? null)
            .then((result) => sendResponse(result))
            .catch((error) => sendResponse({ status: "error", error: error.message }));
        return true;
    }
});

console.log("[API Sniffer Pro v3] Background service worker active.");
