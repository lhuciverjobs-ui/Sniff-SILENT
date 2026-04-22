// popup.js - API Sniffer Pro v3.3

const DEFAULT_CAPTURE_SETTINGS = {
    domain_filter: '',
    path_filter: '',
    method_filter: 'ALL',
    keyword_filter: '',
    active_tab_only: true,
    capture_tab_id: null
};

let currentTab = 'tokens';
let searchQuery = '';
let allRequests = [];
let allTokens = {};
let captureSettings = { ...DEFAULT_CAPTURE_SETTINGS };
let captureSession = null;
let isIncognitoContext = false;
let isIncognitoAllowed = false;

document.addEventListener('DOMContentLoaded', () => {
    initIncognitoMode().then(() => {
        loadAll();
        initPauseButton();
        initSessionControls();
        initFilterControls();
        initQuickActions();
        initTabs();
        initSearch();
        initExportButtons();
        initClearButtons();
        initDetailPanel();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;

        if (changes.captured_requests) {
            allRequests = changes.captured_requests.newValue || [];
            updateStats();
            if (currentTab === 'requests') renderRequests();
        }

        if (changes.extracted_tokens) {
            allTokens = changes.extracted_tokens.newValue || {};
            updateStats();
            if (currentTab === 'tokens') renderTokens();
        }

        if (changes.capture_settings) {
            captureSettings = { ...DEFAULT_CAPTURE_SETTINGS, ...(changes.capture_settings.newValue || {}) };
            syncFilterInputs();
            renderSessionMeta();
            renderScopeChips(document.getElementById('pauseBtn').classList.contains('paused'));
        }

        if (changes.capture_session) {
            captureSession = changes.capture_session.newValue || null;
            renderSessionMeta();
            renderScopeChips(document.getElementById('pauseBtn').classList.contains('paused'));
        }

        if (changes.is_paused) {
            syncPauseUI(!!changes.is_paused.newValue);
            renderSessionMeta();
            renderScopeChips(!!changes.is_paused.newValue);
        }
    });
});

function initIncognitoMode() {
    return new Promise((resolve) => {
        isIncognitoContext = !!(chrome.extension && chrome.extension.inIncognitoContext);

        if (!chrome.extension?.isAllowedIncognitoAccess) {
            isIncognitoAllowed = isIncognitoContext;
            renderIncognitoGate();
            resolve();
            return;
        }

        chrome.extension.isAllowedIncognitoAccess((allowed) => {
            isIncognitoAllowed = !!allowed;
            renderIncognitoGate();
            resolve();
        });
    });
}

function renderIncognitoGate() {
    const gate = document.getElementById('incognitoGate');
    const text = document.getElementById('incognitoGateText');

    if (isIncognitoContext) {
        gate.classList.remove('open');
        return;
    }

    gate.classList.add('open');
    text.textContent = isIncognitoAllowed
        ? 'This extension is intentionally locked to Incognito windows only. Open a new Incognito window and run it there for cleaner, isolated capture.'
        : 'This extension is intentionally locked to Incognito windows only. First enable Allow in Incognito, then use it from a new Incognito window.';
}

function loadAll() {
    chrome.storage.local.get({
        captured_requests: [],
        extracted_tokens: {},
        is_paused: true,
        capture_settings: DEFAULT_CAPTURE_SETTINGS,
        capture_session: null
    }, (result) => {
        allRequests = result.captured_requests;
        allTokens = result.extracted_tokens;
        captureSettings = { ...DEFAULT_CAPTURE_SETTINGS, ...(result.capture_settings || {}) };
        captureSession = result.capture_session || null;

        updateStats();
        syncFilterInputs();
        renderTokens();
        syncPauseUI(result.is_paused);
        renderSessionMeta();
        renderScopeChips(result.is_paused);
    });
}

function updateStats() {
    document.getElementById('reqCount').textContent = allRequests.length;
    document.getElementById('tokenCount').textContent = Object.keys(allTokens).length;

    const domains = new Set();
    allRequests.forEach((request) => {
        try {
            domains.add(new URL(request.url).hostname);
        } catch (error) {}
    });
    document.getElementById('domainCount').textContent = domains.size;
}

function defaultSessionName() {
    const now = new Date();
    return `Session ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
}

function buildAutoSessionName(tab) {
    const host = tab?.url ? safeHostname(tab.url) : 'Current Tab';
    return `${host} ${new Date().toLocaleTimeString()}`;
}

function initPauseButton() {
    document.getElementById('pauseBtn').addEventListener('click', () => {
        chrome.storage.local.get({ is_paused: true }, (result) => {
            if (result.is_paused) {
                startSession(false);
                return;
            }

            chrome.storage.local.set({ is_paused: true }, () => {
                syncPauseUI(true);
                renderSessionMeta();
                renderScopeChips(true);
                showToast('⏸ Capture paused');
            });
        });
    });
}

function syncPauseUI(paused) {
    const btn = document.getElementById('pauseBtn');
    const dot = document.getElementById('statusDot');
    const footer = document.getElementById('statusFooter');

    if (paused) {
        btn.textContent = '▶ Start Capture';
        btn.classList.add('paused');
        dot.classList.add('paused');
        footer.textContent = 'Standby mode • capture is off until started';
    } else {
        btn.textContent = '⏸ Pause';
        btn.classList.remove('paused');
        dot.classList.remove('paused');
        footer.textContent = 'Listening on filtered requests • capture is active';
    }
}

function initSessionControls() {
    document.getElementById('sessionNameInput').value = defaultSessionName();

    document.getElementById('newSessionBtn').addEventListener('click', () => {
        startSession(true);
    });

    document.getElementById('stopSessionBtn').addEventListener('click', () => {
        stopSession();
    });
}

function initQuickActions() {
    document.getElementById('quickStartBtn').addEventListener('click', async () => {
        const activeTab = await getActiveTab();
        if (!activeTab?.id || !activeTab?.url) {
            showToast('❌ Active tab not found');
            return;
        }

        applySiteFocus(activeTab, true);
        await startSession(true, {
            sessionName: buildAutoSessionName(activeTab),
            forceTabBinding: true
        });
    });

    document.getElementById('focusSiteBtn').addEventListener('click', async () => {
        const activeTab = await getActiveTab();
        if (!activeTab?.url) {
            showToast('❌ Active tab not found');
            return;
        }

        applySiteFocus(activeTab, false);
        showToast('🎯 Filters autofilled from current tab');
    });
}

function initFilterControls() {
    document.getElementById('applyFiltersBtn').addEventListener('click', async () => {
        const settings = await collectCaptureSettings(false);
        chrome.storage.local.set({ capture_settings: settings }, () => {
            captureSettings = settings;
            renderSessionMeta();
            renderScopeChips(document.getElementById('pauseBtn').classList.contains('paused'));
            showToast('✅ Filters applied');
        });
    });

    document.getElementById('clearFiltersBtn').addEventListener('click', () => {
        const reset = { ...DEFAULT_CAPTURE_SETTINGS };
        chrome.storage.local.set({ capture_settings: reset }, () => {
            captureSettings = reset;
            syncFilterInputs();
            renderSessionMeta();
            renderScopeChips(document.getElementById('pauseBtn').classList.contains('paused'));
            showToast('🧹 Filters cleared');
        });
    });
}

function initTabs() {
    document.querySelectorAll('.tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach((element) => element.classList.remove('active'));
            document.querySelectorAll('.panel').forEach((element) => element.classList.remove('active'));

            tab.classList.add('active');
            currentTab = tab.dataset.tab;
            document.getElementById(`panel-${currentTab}`).classList.add('active');
            render();
        });
    });
}

function render() {
    if (currentTab === 'tokens') renderTokens();
    if (currentTab === 'requests') renderRequests();
}

function initSearch() {
    const input = document.getElementById('searchInput');
    input.addEventListener('input', () => {
        searchQuery = input.value.toLowerCase().trim();
        render();
    });
}

function initDetailPanel() {
    document.getElementById('backBtn').addEventListener('click', () => {
        document.getElementById('detailPanel').classList.remove('open');
    });
}

function getSessionNameInput() {
    const value = document.getElementById('sessionNameInput').value.trim();
    return value || defaultSessionName();
}

function getActiveTab() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            resolve(tabs && tabs.length > 0 ? tabs[0] : null);
        });
    });
}

function syncFilterInputs() {
    document.getElementById('domainFilterInput').value = captureSettings.domain_filter || '';
    document.getElementById('pathFilterInput').value = captureSettings.path_filter || '';
    document.getElementById('methodFilterSelect').value = captureSettings.method_filter || 'ALL';
    document.getElementById('keywordFilterInput').value = captureSettings.keyword_filter || '';
    document.getElementById('activeTabOnlyInput').checked = captureSettings.active_tab_only !== false;
}

async function collectCaptureSettings(bindCurrentTab) {
    const activeTabOnly = document.getElementById('activeTabOnlyInput').checked;
    let captureTabId = activeTabOnly ? captureSettings.capture_tab_id : null;

    if (activeTabOnly && bindCurrentTab) {
        const activeTab = await getActiveTab();
        captureTabId = activeTab?.id ?? null;
    }

    return {
        domain_filter: document.getElementById('domainFilterInput').value.trim(),
        path_filter: document.getElementById('pathFilterInput').value.trim(),
        method_filter: document.getElementById('methodFilterSelect').value,
        keyword_filter: document.getElementById('keywordFilterInput').value.trim(),
        active_tab_only: activeTabOnly,
        capture_tab_id: activeTabOnly ? captureTabId : null
    };
}

function applySiteFocus(tab, persistToStorage) {
    const nextSettings = {
        ...captureSettings,
        domain_filter: tab?.url ? safeHostname(tab.url) : '',
        active_tab_only: true,
        capture_tab_id: tab?.id ?? null
    };

    captureSettings = nextSettings;
    syncFilterInputs();
    document.getElementById('sessionNameInput').value = buildAutoSessionName(tab);

    if (persistToStorage) {
        chrome.storage.local.set({ capture_settings: nextSettings }, () => {
            renderSessionMeta();
            renderScopeChips(false);
        });
    } else {
        renderSessionMeta();
        renderScopeChips(false);
    }
}

async function startSession(forceNew, options = {}) {
    const settings = await collectCaptureSettings(options.forceTabBinding !== false);
    const activeTab = settings.active_tab_only ? await getActiveTab() : null;
    const sessionName = options.sessionName || getSessionNameInput();
    const nextSession = (!forceNew && captureSession)
        ? {
            ...captureSession,
            name: sessionName,
            tabId: settings.capture_tab_id ?? captureSession.tabId ?? null,
            tabTitle: activeTab?.title || captureSession.tabTitle || ''
        }
        : {
            id: `session_${Date.now()}`,
            name: sessionName,
            startedAt: new Date().toISOString(),
            tabId: settings.capture_tab_id ?? null,
            tabTitle: activeTab?.title || ''
        };

    chrome.storage.local.set({
        capture_settings: settings,
        capture_session: nextSession,
        is_paused: false
    }, () => {
        captureSettings = settings;
        captureSession = nextSession;
        syncPauseUI(false);
        renderSessionMeta();
        renderScopeChips(false);
        showToast(forceNew ? '▶ New session started' : '▶ Capture started');
    });
}

function stopSession() {
    const nextSettings = {
        ...captureSettings,
        capture_tab_id: null
    };

    chrome.storage.local.set({
        is_paused: true,
        capture_session: null,
        capture_settings: nextSettings
    }, () => {
        captureSession = null;
        captureSettings = nextSettings;
        syncPauseUI(true);
        renderSessionMeta();
        renderScopeChips(true);
        showToast('⏹ Session stopped');
    });
}

function renderSessionMeta() {
    const scope = captureSettings.active_tab_only
        ? `tab ${captureSettings.capture_tab_id ?? 'not bound'}`
        : 'all tabs';

    const node = document.getElementById('sessionMeta');
    if (!captureSession) {
        node.textContent = `No active session. Scope: ${scope}.`;
        return;
    }

    node.textContent = `${captureSession.name} • ${formatDateTime(captureSession.startedAt)} • scope ${scope}`;
}

function renderScopeChips(isPaused) {
    const row = document.getElementById('scopeChipRow');
    const chips = [];

    chips.push(isPaused ? 'standby' : 'capturing');
    chips.push(captureSettings.active_tab_only ? `tab ${captureSettings.capture_tab_id ?? 'not bound'}` : 'all tabs');

    if (captureSettings.domain_filter) chips.push(`domain ${captureSettings.domain_filter}`);
    if (captureSettings.path_filter) chips.push(`path ${captureSettings.path_filter}`);
    if (captureSettings.method_filter && captureSettings.method_filter !== 'ALL') chips.push(captureSettings.method_filter);
    if (captureSettings.keyword_filter) chips.push(`keyword ${captureSettings.keyword_filter}`);
    if (captureSession?.name) chips.push(captureSession.name);

    row.innerHTML = chips.map((chip) => `<span class="scope-chip">${escapeHtml(chip)}</span>`).join('');
}

function renderTokens() {
    const list = document.getElementById('tokenList');
    const keys = Object.keys(allTokens).filter((key) => {
        if (!searchQuery) return true;
        const token = allTokens[key];
        return token.name.toLowerCase().includes(searchQuery)
            || (token.url || '').toLowerCase().includes(searchQuery)
            || (token.source || '').toLowerCase().includes(searchQuery)
            || (token.sessionName || '').toLowerCase().includes(searchQuery);
    });

    if (keys.length === 0) {
        list.innerHTML = '<div class="empty">No tokens detected yet...</div>';
        return;
    }

    list.innerHTML = '';

    for (const key of keys) {
        const token = allTokens[key];
        const item = document.createElement('div');
        item.className = 'token-item';

        const sourceBadgeClass = token.source === 'cookie'
            ? 'cookie'
            : token.source === 'response-body'
                ? 'resp'
                : 'req';

        item.innerHTML = `
            <div class="token-header">
                <div class="token-name">${escapeHtml(token.name)}</div>
                <button class="copy-btn" title="Copy value">Copy</button>
            </div>
            <div class="token-value" data-revealed="false" data-value="${escapeHtml(token.value)}" title="Click to reveal or hide">
                ${maskToken(token.value)}
            </div>
            <div class="token-meta">
                <span class="badge ${sourceBadgeClass}">${escapeHtml(token.source)}</span>
                ${token.count > 1 ? `<span class="badge highlight">x${token.count}</span>` : ''}
                ${token.sessionName ? `<span class="badge highlight">${escapeHtml(token.sessionName)}</span>` : ''}
                <span>${escapeHtml(token.url ? safeHostname(token.url) : 'unknown')}</span>
                ${token.updatedAt ? `<span>${formatTime(token.updatedAt)}</span>` : ''}
            </div>
        `;

        const valueEl = item.querySelector('.token-value');
        valueEl.addEventListener('click', () => {
            const revealed = valueEl.getAttribute('data-revealed') === 'true';
            const value = valueEl.getAttribute('data-value');
            valueEl.textContent = revealed ? maskToken(value) : value;
            valueEl.setAttribute('data-revealed', revealed ? 'false' : 'true');
        });

        item.querySelector('.copy-btn').addEventListener('click', (event) => {
            event.stopPropagation();
            const value = valueEl.getAttribute('data-value');
            navigator.clipboard.writeText(value)
                .then(() => showToast('✅ Copied!'))
                .catch(() => showToast('❌ Copy failed'));
        });

        list.appendChild(item);
    }
}

function renderRequests() {
    const list = document.getElementById('requestList');
    const filtered = [...allRequests].reverse().filter((request) => {
        if (!searchQuery) return true;

        return (request.url || '').toLowerCase().includes(searchQuery)
            || (request.method || '').toLowerCase().includes(searchQuery)
            || String(request.status).includes(searchQuery)
            || (request.sessionName || '').toLowerCase().includes(searchQuery)
            || (request.highlightTags || []).join(' ').toLowerCase().includes(searchQuery);
    }).slice(0, 100);

    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty">No requests captured yet...</div>';
        return;
    }

    list.innerHTML = '';

    for (const request of filtered) {
        const item = document.createElement('div');
        item.className = 'req-item';

        const method = (request.method || 'GET').toUpperCase();
        const methodClass = `method-${['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method) ? method : 'default'}`;
        const status = request.status || 0;
        const statusClass = status >= 200 && status < 300
            ? 'status-ok'
            : status >= 300 && status < 400
                ? 'status-redirect'
                : 'status-err';

        item.innerHTML = `
            <div class="req-header">
                <span class="method-badge ${methodClass}">${method}</span>
                <span class="status-badge ${statusClass}">${status || '?'}</span>
                <span class="req-url" title="${escapeHtml(request.url)}">${escapeHtml(request.url || '')}</span>
                ${request.tokensFound > 0 ? `<span class="req-tokens">🔑 ${request.tokensFound}</span>` : ''}
            </div>
            <div class="req-time">${escapeHtml(safeHostname(request.url))} • ${request.lastSeenAt ? formatTime(request.lastSeenAt) : formatTime(request.timestamp)}</div>
            <div class="req-meta-row">
                ${request.count > 1 ? `<span class="badge highlight">x${request.count}</span>` : ''}
                ${request.sessionName ? `<span class="badge highlight">${escapeHtml(request.sessionName)}</span>` : ''}
                ${(request.highlightTags || []).map((tag) => `<span class="badge ${badgeClassForHighlight(tag)}">${escapeHtml(tag)}</span>`).join('')}
            </div>
        `;

        item.addEventListener('click', () => showDetail(request));
        list.appendChild(item);
    }

    if (allRequests.length > 100) {
        const note = document.createElement('div');
        note.className = 'empty';
        note.textContent = `Showing last 100 of ${allRequests.length} requests`;
        list.appendChild(note);
    }
}

function showDetail(request) {
    const panel = document.getElementById('detailPanel');
    const body = document.getElementById('detailBody');
    const title = document.getElementById('detailTitle');
    const method = (request.method || 'GET').toUpperCase();

    title.textContent = `${method} ${(request.url || '').substring(0, 60)}`;

    body.innerHTML = `
        <div class="detail-section">
            <div class="detail-section-title">Info</div>
            <div class="detail-meta">
                URL: <span>${escapeHtml(request.url || '')}</span><br/>
                Method: <span>${escapeHtml(method)}</span><br/>
                Status: <span>${request.status || '?'}</span><br/>
                Session: <span>${escapeHtml(request.sessionName || 'none')}</span><br/>
                Captured: <span>${request.count || 1}x</span><br/>
                First seen: <span>${escapeHtml(request.firstSeenAt || request.timestamp || '')}</span><br/>
                Last seen: <span>${escapeHtml(request.lastSeenAt || request.timestamp || '')}</span>
            </div>
        </div>
        ${request.highlightTags && request.highlightTags.length > 0 ? `
        <div class="detail-section">
            <div class="detail-section-title">Highlights</div>
            <div class="detail-meta">${request.highlightTags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join(' • ')}</div>
        </div>` : ''}
        ${request.requestHeaders && Object.keys(request.requestHeaders).length > 0 ? `
        <div class="detail-section">
            <div class="detail-section-title">Request Headers</div>
            <div class="detail-code">${escapeHtml(formatCodeBlock(request.requestHeaders))}</div>
        </div>` : ''}
        ${request.requestBody ? `
        <div class="detail-section">
            <div class="detail-section-title">Request Body</div>
            <div class="detail-code">${escapeHtml(formatCodeBlock(request.requestBody))}</div>
        </div>` : ''}
        ${request.responseHeaders && Object.keys(request.responseHeaders).length > 0 ? `
        <div class="detail-section">
            <div class="detail-section-title">Response Headers</div>
            <div class="detail-code">${escapeHtml(formatCodeBlock(request.responseHeaders))}</div>
        </div>` : ''}
        ${request.responseBody ? `
        <div class="detail-section">
            <div class="detail-section-title">Response Body</div>
            <div class="detail-code">${escapeHtml(formatCodeBlock(request.responseBody))}</div>
        </div>` : ''}
    `;

    panel.classList.add('open');
}

function initExportButtons() {
    document.getElementById('copyEnv').addEventListener('click', () => {
        const keys = Object.keys(allTokens);
        if (keys.length === 0) {
            showToast('⚠️ No tokens to copy');
            return;
        }

        navigator.clipboard.writeText(buildEnvContent(allTokens))
            .then(() => showToast('✅ .env copied!'))
            .catch(() => showToast('❌ Copy failed'));
    });

    document.getElementById('downloadEnv').addEventListener('click', () => {
        const keys = Object.keys(allTokens);
        if (keys.length === 0) {
            showToast('⚠️ No tokens to download');
            return;
        }

        downloadFile(buildEnvContent(allTokens), `tokens_${ts()}.env`, 'text/plain');
        showToast('✅ .env downloaded!');
    });

    document.getElementById('downloadJson').addEventListener('click', () => {
        const payload = {
            metadata: {
                exportedAt: new Date().toISOString(),
                totalRequests: allRequests.length,
                totalTokens: Object.keys(allTokens).length,
                captureSettings,
                captureSession
            },
            tokens: allTokens,
            requests: allRequests
        };

        downloadFile(JSON.stringify(payload, null, 2), `api_sniff_${ts()}.json`, 'application/json');
        showToast('✅ JSON downloaded!');
    });

    document.getElementById('downloadCurl').addEventListener('click', () => {
        if (allRequests.length === 0) {
            showToast('⚠️ No requests to export');
            return;
        }

        let curls = '#!/bin/bash\n# API Sniffer Pro v3.3 - cURL Export\n';
        curls += `# Generated: ${new Date().toISOString()}\n\n`;

        allRequests.forEach((request) => {
            let command = `curl -X ${request.method || 'GET'} '${request.url}'`;

            if (request.requestHeaders) {
                Object.entries(request.requestHeaders).forEach(([key, value]) => {
                    if (!['content-length', 'host'].includes(key.toLowerCase())) {
                        const safeValue = String(value).replace(/'/g, "'\\''");
                        command += ` \\\n  -H '${key}: ${safeValue}'`;
                    }
                });
            }

            if (request.requestBody) {
                let body = typeof request.requestBody === 'object'
                    ? JSON.stringify(request.requestBody)
                    : String(request.requestBody);
                body = body.replace(/'/g, "'\\''");
                command += ` \\\n  -d '${body}'`;
            }

            curls += `# [${request.method || 'GET'}] ${request.url}\n# Status: ${request.status} | ${request.lastSeenAt || request.timestamp}\n${command}\n\n`;
        });

        downloadFile(curls, `api_curls_${ts()}.sh`, 'text/plain');
        showToast('✅ cURL exported!');
    });
}

function initClearButtons() {
    document.getElementById('clearTokens').addEventListener('click', () => {
        chrome.storage.local.set({ extracted_tokens: {} }, () => {
            allTokens = {};
            updateStats();
            renderTokens();
            showToast('🗑️ Tokens cleared');
        });
    });

    document.getElementById('clearLogs').addEventListener('click', () => {
        chrome.storage.local.set({ captured_requests: [] }, () => {
            allRequests = [];
            updateStats();
            renderRequests();
            showToast('🗑️ Requests cleared');
        });
    });

    document.getElementById('clearAll').addEventListener('click', () => {
        chrome.storage.local.set({ captured_requests: [], extracted_tokens: {} }, () => {
            allRequests = [];
            allTokens = {};
            updateStats();
            render();
            showToast('🧹 All data cleared');
        });
    });
}

function buildEnvContent(tokens) {
    let env = '# API Sniffer Pro v3.3 - Extracted Tokens\n';
    env += `# Generated: ${new Date().toISOString()}\n\n`;

    Object.keys(tokens).forEach((key) => {
        const token = tokens[key];
        env += `${token.name}="${token.value}"\n`;
    });

    return env;
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({ url, filename }, () => {
        if (chrome.runtime.lastError) {
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
        }
    });
}

function maskToken(value) {
    if (!value) return '****';
    if (value.length <= 12) return `${value.substring(0, 3)}****`;
    return `${value.substring(0, 6)}...${value.substring(value.length - 6)}`;
}

function badgeClassForHighlight(tag) {
    if (tag === 'AUTH') return 'auth';
    if (tag === 'TOKEN') return 'token';
    if (tag === 'ERROR') return 'error';
    if (tag === 'GRAPHQL') return 'graphql';
    if (tag === 'JSON') return 'json';
    return 'highlight';
}

function safeHostname(url) {
    try {
        return new URL(url).hostname;
    } catch (error) {
        return url || '';
    }
}

function formatCodeBlock(value) {
    if (!value) return '(empty)';
    if (typeof value === 'string') return value;

    try {
        return JSON.stringify(value, null, 2);
    } catch (error) {
        return String(value);
    }
}

function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function ts() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function formatTime(iso) {
    try {
        return new Date(iso).toLocaleTimeString();
    } catch (error) {
        return iso;
    }
}

function formatDateTime(iso) {
    try {
        return new Date(iso).toLocaleString();
    } catch (error) {
        return iso;
    }
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}
