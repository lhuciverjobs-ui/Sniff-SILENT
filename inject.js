(function () {
    const EXTENSION_ID = "API_SNIFFER_PRO";
    const SKIP_EXTENSIONS = [".css", ".js", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".woff", ".woff2", ".ico"];

    let isPaused = false;

    // Sync pause state from extension storage via content.js bridge
    window.postMessage({ type: "API_SNIFFER_GET_PAUSE" }, "*");
    window.addEventListener("message", function (e) {
        if (e.data && e.data.type === "API_SNIFFER_PAUSE_STATE") {
            isPaused = !!e.data.paused;
        }
    });

    // ─────────────────────────────────────────────────────────────
    //  Token Detection Helpers
    // ─────────────────────────────────────────────────────────────
    const JWT_REGEX = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

    function extractTokensFromHeaders(headers, url) {
        const tokens = [];
        if (!headers || typeof headers !== 'object') return tokens;

        const entries = (headers instanceof Headers)
            ? [...headers.entries()]
            : Object.entries(headers);

        for (const [key, value] of entries) {
            if (typeof value !== 'string') continue;
            const lowerKey = key.toLowerCase();

            if (lowerKey === "authorization") {
                const bearerMatch = value.match(/^Bearer\s+(.+)$/i);
                if (bearerMatch) {
                    tokens.push({ name: "BEARER_TOKEN", value: bearerMatch[1], source: "request-header" });
                } else {
                    tokens.push({ name: "AUTH_TOKEN", value: value, source: "request-header" });
                }
            }

            if (lowerKey.includes("token") || lowerKey.includes("auth") || lowerKey.includes("api-key") || lowerKey.includes("apikey")) {
                if (lowerKey !== "authorization") {
                    const envName = key.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
                    tokens.push({ name: envName, value: value, source: "request-header" });
                }
            }

            const jwtMatches = value.match(JWT_REGEX);
            if (jwtMatches) {
                for (const jwt of jwtMatches) {
                    tokens.push({ name: "JWT_TOKEN", value: jwt, source: "request-header" });
                }
            }
        }
        return tokens;
    }

    function extractTokensFromBody(body) {
        const tokens = [];
        if (!body || typeof body !== 'object') return tokens;

        const tokenKeys = ["token", "access_token", "accessToken", "auth_token", "authToken",
            "refresh_token", "refreshToken", "jwt", "session_token", "sessionToken",
            "bearer", "api_key", "apiKey", "id_token", "idToken"];

        function scanObject(obj, prefix) {
            if (!obj || typeof obj !== 'object') return;
            for (const [key, val] of Object.entries(obj)) {
                const lowerKey = key.toLowerCase();
                if (typeof val === 'string' && val.length > 10) {
                    if (tokenKeys.some(tk => lowerKey.includes(tk.toLowerCase()))) {
                        const envName = (prefix ? prefix + "_" : "") + key.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
                        tokens.push({ name: envName, value: val, source: "response-body" });
                    }
                    const jwtMatches = val.match(JWT_REGEX);
                    if (jwtMatches) {
                        const envName = (prefix ? prefix + "_" : "") + key.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
                        tokens.push({ name: envName, value: jwtMatches[0], source: "response-body" });
                    }
                } else if (typeof val === 'object' && val !== null) {
                    scanObject(val, key.toUpperCase());
                }
            }
        }

        scanObject(body, "");
        return tokens;
    }

    function sendTokens(tokens, url) {
        for (const token of tokens) {
            window.postMessage({
                type: "API_SNIFFER_TOKEN",
                payload: {
                    name: token.name,
                    value: token.value,
                    source: token.source,
                    url: url,
                    timestamp: new Date().toISOString()
                }
            }, "*");
        }
    }

    function shouldCapture(url) {
        if (!url) return false;
        try {
            const path = new URL(url, window.location.origin).pathname.toLowerCase();
            return !SKIP_EXTENSIONS.some(ext => path.endsWith(ext));
        } catch (e) { return true; }
    }

    function normalizeHeaders(headers) {
        if (!headers) return {};
        const result = {};
        if (headers instanceof Headers) {
            headers.forEach((val, key) => result[key] = val);
        } else if (Array.isArray(headers)) {
            headers.forEach(header => {
                if (Array.isArray(header) && header.length === 2) result[header[0]] = header[1];
            });
        } else if (typeof headers === 'object') {
            Object.assign(result, headers);
        }
        return result;
    }

    function safeSerialize(obj) {
        try {
            JSON.stringify(obj);
            return obj;
        } catch (e) {
            return String(obj).substring(0, 500);
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  Fetch Monkey Patch
    // ─────────────────────────────────────────────────────────────
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        if (isPaused) return originalFetch.apply(this, args);

        let url = args[0];
        if (typeof url !== 'string') {
            if (url instanceof Request) url = url.url;
            else url = String(url);
        }

        const options = args[1] || {};
        const method = (options.method || "GET").toUpperCase();

        let requestBody = options.body;
        let parsedRequestBody = requestBody;
        if (typeof requestBody === 'string') {
            try { parsedRequestBody = JSON.parse(requestBody); } catch (e) { }
        }

        let response;
        let responseBody = null;
        let status = 0;
        let responseHeaders = {};

        try {
            response = await originalFetch.apply(this, args);
            status = response.status;

            const clone = response.clone();
            try {
                responseBody = await clone.json();
            } catch (e) {
                try { responseBody = await clone.text(); } catch (e2) { }
            }

            responseHeaders = normalizeHeaders(response.headers);
        } catch (err) {
            status = 0;
            throw err;
        } finally {
            if (shouldCapture(url)) {
                const reqHeaders = normalizeHeaders(options.headers);
                const headerTokens = extractTokensFromHeaders(reqHeaders, url);
                const bodyTokens = (responseBody && typeof responseBody === 'object')
                    ? extractTokensFromBody(responseBody)
                    : [];

                const allTokens = [...headerTokens, ...bodyTokens];
                if (allTokens.length > 0) sendTokens(allTokens, url);

                try {
                    window.postMessage({
                        type: EXTENSION_ID,
                        payload: {
                            id: Date.now() + Math.random(),
                            url: url,
                            method: method,
                            requestHeaders: safeSerialize(reqHeaders),
                            requestBody: safeSerialize(parsedRequestBody || requestBody),
                            status: status,
                            responseHeaders: safeSerialize(responseHeaders),
                            responseBody: safeSerialize(
                                typeof responseBody === 'string'
                                    ? responseBody.substring(0, 2000)
                                    : responseBody
                            ),
                            timestamp: new Date().toISOString(),
                            tokensFound: allTokens.length
                        }
                    }, "*");
                } catch (e) { /* serialization error, skip */ }
            }
        }

        return response;
    };

    // ─────────────────────────────────────────────────────────────
    //  XHR Monkey Patch
    // ─────────────────────────────────────────────────────────────
    const XHR = XMLHttpRequest.prototype;
    const origOpen = XHR.open;
    const origSend = XHR.send;
    const origSetHeader = XHR.setRequestHeader;

    XHR.open = function (method, url) {
        this._method = method ? method.toUpperCase() : "GET";
        this._url = url;
        this._requestHeaders = {};
        return origOpen.apply(this, arguments);
    };

    XHR.setRequestHeader = function (header, value) {
        this._requestHeaders[header] = value;
        return origSetHeader.apply(this, arguments);
    };

    XHR.send = function (postData) {
        this.addEventListener('load', function () {
            if (isPaused || !shouldCapture(this._url)) return;

            let responseBody = null;
            if (this.responseType === '' || this.responseType === 'text') {
                try {
                    responseBody = JSON.parse(this.responseText);
                } catch (e) {
                    responseBody = this.responseText
                        ? this.responseText.substring(0, 2000)
                        : null;
                }
            }

            const headers = {};
            const headerStr = this.getAllResponseHeaders();
            if (headerStr) {
                headerStr.trim().split(/[\r\n]+/).forEach(line => {
                    const idx = line.indexOf(': ');
                    if (idx > 0) {
                        headers[line.substring(0, idx)] = line.substring(idx + 2);
                    }
                });
            }

            const headerTokens = extractTokensFromHeaders(this._requestHeaders, this._url);
            const bodyTokens = (responseBody && typeof responseBody === 'object')
                ? extractTokensFromBody(responseBody)
                : [];

            const allTokens = [...headerTokens, ...bodyTokens];
            if (allTokens.length > 0) sendTokens(allTokens, this._url);

            let parsedBody = postData;
            if (typeof postData === 'string') {
                try { parsedBody = JSON.parse(postData); } catch (e) { }
            }

            try {
                window.postMessage({
                    type: EXTENSION_ID,
                    payload: {
                        id: Date.now() + Math.random(),
                        url: this._url,
                        method: this._method,
                        requestHeaders: this._requestHeaders,
                        requestBody: safeSerialize(parsedBody || postData),
                        status: this.status,
                        responseHeaders: headers,
                        responseBody: safeSerialize(responseBody),
                        timestamp: new Date().toISOString(),
                        tokensFound: allTokens.length
                    }
                }, "*");
            } catch (e) { /* serialization error, skip */ }
        });
        return origSend.apply(this, arguments);
    };

})();
