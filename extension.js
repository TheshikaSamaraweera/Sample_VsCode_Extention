const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const os = require('os');

// Global variables to store current analysis data
let currentAnalysisData = null;
let currentCode = null;
let currentLanguage = null;
let currentFilename = null;
let currentFilePath = null;
let diagnosticCollection = null;
let statusBarItem = null;
let treeDataProvider = null;
let backendHealthy = false;
let autoAnalyzeEnabled = false;

// Get API URL from configuration
function getApiUrl() {
    const config = vscode.workspace.getConfiguration('codeHealth');
    return config.get('backendUrl', 'http://localhost:8000');
}

function activate(context) {
    console.log('🚀 AI Code Reviewer Extension is now active!');

    // Initialize diagnostic collection
    diagnosticCollection = vscode.languages.createDiagnosticCollection('codeHealth');
    context.subscriptions.push(diagnosticCollection);

    // Initialize status bar
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'code-health.showStatus';
    statusBarItem.text = '$(pulse) Code Health';
    statusBarItem.tooltip = 'Click to check backend status';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Create tree data provider
    treeDataProvider = new CodeHealthTreeDataProvider();

    // Register tree view
    const treeView = vscode.window.createTreeView('codeHealthSidebarView', {
        treeDataProvider: treeDataProvider,
        showCollapseAll: true
    });

    context.subscriptions.push(treeView);

    // Check backend health on startup
    checkBackendHealth();

    // Command: Analyze current file
    const analyzeFileCommand = vscode.commands.registerCommand('code-health.analyzeFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No file is currently open');
            return;
        }

        const document = editor.document;
        const code = document.getText();
        const language = document.languageId;
        const filename = path.basename(document.fileName);

        // Store current data for later use
        currentCode = code;
        currentLanguage = language;
        currentFilename = filename;
        currentFilePath = document.fileName;

        await analyzeCode(code, language, filename, document.fileName);
    });

    // Command: Upload and analyze file
    const uploadAnalyzeCommand = vscode.commands.registerCommand('code-health.uploadAndAnalyze', async () => {
        const options = {
            canSelectMany: false,
            openLabel: 'Select file to analyze',
            filters: {
                'Code files': ['py', 'js', 'ts', 'java', 'cpp', 'c', 'php', 'rb', 'go']
            }
        };

        const fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri && fileUri[0]) {
            try {
                const filePath = fileUri[0].fsPath;
                const code = fs.readFileSync(filePath, 'utf8');
                const extension = path.extname(filePath).slice(1);
                const filename = path.basename(filePath);

                // Map file extensions to languages
                const languageMap = {
                    'py': 'python',
                    'js': 'javascript',
                    'ts': 'typescript',
                    'java': 'java',
                    'cpp': 'cpp',
                    'c': 'c',
                    'php': 'php',
                    'rb': 'ruby',
                    'go': 'go'
                };

                const language = languageMap[extension] || 'unknown';

                // Store current data for later use
                currentCode = code;
                currentLanguage = language;
                currentFilename = filename;
                currentFilePath = filePath;

                await analyzeCode(code, language, filename, filePath);

            } catch (error) {
                vscode.window.showErrorMessage(`Error reading file: ${error.message}`);
            }
        }
    });

    // Command: Start Smart Auto-Fix
    const smartFixCommand = vscode.commands.registerCommand('code-health.startSmartFix', async () => {
        if (!currentCode || !currentAnalysisData) {
            vscode.window.showErrorMessage('Please analyze a file first.');
            return;
        }
        await startSmartFix(currentCode, currentLanguage, currentFilePath);
    });

    // Command: Start Selective Fix
    const selectiveFixCommand = vscode.commands.registerCommand('code-health.startSelectiveFix', async () => {
        if (!currentCode || !currentAnalysisData) {
            vscode.window.showErrorMessage('Please analyze a file first.');
            return;
        }
        await startSelectiveFix(currentCode, currentLanguage, currentFilePath);
    });

    // Command: Refresh
    const refreshCommand = vscode.commands.registerCommand('code-health.refresh', async () => {
        await checkBackendHealth();
        treeDataProvider.refresh();
        vscode.window.showInformationMessage('🔄 Code Health refreshed!');
    });

    // Command: Show backend status
    const showStatusCommand = vscode.commands.registerCommand('code-health.showStatus', async () => {
        await showBackendStatus();
    });

    // Command: Clear cache
    const clearCacheCommand = vscode.commands.registerCommand('code-health.clearCache', async () => {
        await clearBackendCache();
    });

    // Command: View cache stats
    const cacheStatsCommand = vscode.commands.registerCommand('code-health.cacheStats', async () => {
        await showCacheStats();
    });

    // Command: Fix specific issue
    const fixIssueCommand = vscode.commands.registerCommand('code-health.fixIssue', async (issueId) => {
        await fixSpecificIssue(issueId);
    });

    // Command: Jump to issue
    const jumpToIssueCommand = vscode.commands.registerCommand('code-health.jumpToIssue', async (line) => {
        jumpToLine(line);
    });

    // Command: Toggle auto-analyze
    const toggleAutoAnalyzeCommand = vscode.commands.registerCommand('code-health.toggleAutoAnalyze', () => {
        autoAnalyzeEnabled = !autoAnalyzeEnabled;
        const config = vscode.workspace.getConfiguration('codeHealth');
        config.update('autoAnalyzeOnSave', autoAnalyzeEnabled, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(
            `Auto-analyze on save: ${autoAnalyzeEnabled ? 'Enabled ✅' : 'Disabled ❌'}`
        );
        updateStatusBar();
    });

    // Command: Analyze with options
    const analyzeWithOptionsCommand = vscode.commands.registerCommand('code-health.analyzeWithOptions', async () => {
        await analyzeWithOptions();
    });

    // Command: Show analysis history
    const showHistoryCommand = vscode.commands.registerCommand('code-health.showHistory', () => {
        showAnalysisHistory();
    });

    // Command: Export results
    const exportResultsCommand = vscode.commands.registerCommand('code-health.exportResults', async () => {
        await exportAnalysisResults();
    });

    // Register code action provider
    const codeActionProvider = new CodeHealthActionProvider();
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            { scheme: 'file' },
            codeActionProvider,
            { providedCodeActionKinds: CodeHealthActionProvider.providedCodeActionKinds }
        )
    );

    // Auto-analyze on save
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (document) => {
            const config = vscode.workspace.getConfiguration('codeHealth');
            if (config.get('autoAnalyzeOnSave', false)) {
                const editor = vscode.window.activeTextEditor;
                if (editor && editor.document === document) {
                    await analyzeCode(
                        document.getText(),
                        document.languageId,
                        path.basename(document.fileName),
                        document.fileName
                    );
                }
            }
        })
    );

    // Watch for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('codeHealth')) {
                checkBackendHealth();
                updateStatusBar();
            }
        })
    );

    context.subscriptions.push(
        analyzeFileCommand,
        uploadAnalyzeCommand,
        smartFixCommand,
        selectiveFixCommand,
        refreshCommand,
        showStatusCommand,
        clearCacheCommand,
        cacheStatsCommand,
        fixIssueCommand,
        jumpToIssueCommand,
        toggleAutoAnalyzeCommand,
        analyzeWithOptionsCommand,
        showHistoryCommand,
        exportResultsCommand
    );

    // Load auto-analyze setting
    const config = vscode.workspace.getConfiguration('codeHealth');
    autoAnalyzeEnabled = config.get('autoAnalyzeOnSave', false);
    updateStatusBar();
}

async function analyzeCode(code, language, filename, filePath = null) {
    // Show progress
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Analyzing code with AI...",
        cancellable: false
    }, async (progress) => {
        progress.report({ increment: 0, message: 'Sending to AI analyzer...' });

        try {
            // Check if backend is running
            progress.report({ increment: 20, message: 'Connecting to AI backend...' });

            const config = vscode.workspace.getConfiguration('codeHealth');
            const enableDeduplication = config.get('enableHybridDeduplication', true);
            const showDeduplicationStats = config.get('showDeduplicationStats', true);

            const response = await fetch(`${getApiUrl()}/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    code: code,
                    language: language,
                    file_path: filename,
                    enable_hybrid_deduplication: enableDeduplication,
                    show_deduplication_stats: showDeduplicationStats
                })
            });

            progress.report({ increment: 70, message: 'Processing results...' });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Backend error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            progress.report({ increment: 100 });

            // Store analysis data for later use
            currentAnalysisData = result;
            backendHealthy = true;
            updateStatusBar();

            // Update diagnostics
            updateDiagnostics(result, filePath);

            // Update tree view
            treeDataProvider.updateAnalysisData(result);

            // Show results
            showAnalysisResults(result, filename, language);

            // Show success notification
            vscode.window.showInformationMessage(
                `✅ Analysis complete: ${result.total_issues} issues found (Score: ${result.code_score.toFixed(1)}/100)`
            );

        } catch (error) {
            backendHealthy = false;
            updateStatusBar();

            if (error.code === 'ECONNREFUSED' || error.message.includes('fetch')) {
                vscode.window.showErrorMessage(
                    '❌ AI Code Reviewer backend is not running! Please start the Python backend first.',
                    'Show Instructions'
                ).then(selection => {
                    if (selection === 'Show Instructions') {
                        showBackendInstructions();
                    }
                });
            } else {
                vscode.window.showErrorMessage(`Analysis failed: ${error.message}`);
            }
            console.error('Analysis error:', error);
        }
    });
}

async function startSmartFix(code, language, filePath) {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Running Smart Auto-Fix...",
        cancellable: false
    }, async (progress) => {
        try {
            progress.report({ increment: 0, message: 'Starting iterative refinement...' });

            const response = await fetch(`${getApiUrl()}/fix/iterative`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: code,
                    language: language,
                    file_path: filePath
                })
            });

            progress.report({ increment: 50, message: 'AI is refining your code...' });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Backend error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            progress.report({ increment: 100 });

            showIterativeFixResults(result, path.basename(filePath));

        } catch (error) {
            vscode.window.showErrorMessage(`Smart Auto-Fix failed: ${error.message}`);
            console.error('Smart Auto-Fix error:', error);
        }
    });
}

async function startSelectiveFix(code, language, filePath) {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Starting Selective Fix...",
        cancellable: false
    }, async (progress) => {
        try {
            progress.report({ increment: 0, message: 'Fetching fixable issues...' });

            const response = await fetch(`${getApiUrl()}/fix/selective/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: code,
                    language: language,
                    file_path: filePath
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Backend error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            progress.report({ increment: 100 });

            showSelectiveFixUI(result, code, language, filePath);

        } catch (error) {
            vscode.window.showErrorMessage(`Selective Fix failed: ${error.message}`);
            console.error('Selective Fix error:', error);
        }
    });
}





// Show smart fix results with enhanced display
function showSmartFixResults(result, filename) {
    const panel = vscode.window.createWebviewPanel(
        'smartFixResults',
        `🤖 Smart AI Fix Results - ${filename}`,
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(
        async message => {
            if (message.command === 'applyCode') {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    const document = editor.document;
                    const fullRange = new vscode.Range(
                        document.positionAt(0),
                        document.positionAt(document.getText().length)
                    );
                    await editor.edit(editBuilder => {
                        editBuilder.replace(fullRange, message.code);
                    });
                    vscode.window.showInformationMessage('✅ Smart AI Fix applied to editor!');
                    panel.dispose();
                } else {
                    vscode.window.showErrorMessage('No active editor to apply code to');
                }
            } else if (message.command === 'showDiff') {
                await showDiffView(currentCode, message.code, filename);
            }
        },
        undefined,
        []
    );

    panel.webview.html = getSmartFixResultsHtml(result, filename);
}

// HTML for smart fix results
function getSmartFixResultsHtml(result, filename) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background: var(--vscode-editor-background);
                    margin: 0;
                    padding: 20px;
                }
                .header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 20px;
                    border-radius: 10px;
                    margin-bottom: 20px;
                }
                .stats {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 15px;
                    margin-bottom: 20px;
                }
                .stat-card {
                    background: var(--vscode-textBlockQuote-background);
                    border: 1px solid var(--vscode-textBlockQuote-border);
                    border-radius: 8px;
                    padding: 15px;
                    text-align: center;
                }
                .stat-number {
                    font-size: 2em;
                    font-weight: bold;
                    color: #4CAF50;
                }
                .code-container {
                    background: var(--vscode-textBlockQuote-background);
                    border: 1px solid var(--vscode-textBlockQuote-border);
                    border-radius: 8px;
                    padding: 20px;
                    margin-bottom: 20px;
                }
                .code-block {
                    background: var(--vscode-textCodeBlock-background);
                    border: 1px solid var(--vscode-textBlockQuote-border);
                    border-radius: 4px;
                    padding: 15px;
                    font-family: 'Courier New', monospace;
                    white-space: pre-wrap;
                    overflow-x: auto;
                    max-height: 500px;
                    overflow-y: auto;
                    font-size: 13px;
                    line-height: 1.5;
                }
                .copy-button, .apply-button {
                    background: #2196F3;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-weight: bold;
                    margin-right: 10px;
                    margin-bottom: 10px;
                }
                .diff-button {
                    background: #FF9800;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-weight: bold;
                    margin-right: 10px;
                    margin-bottom: 10px;
                }
                .diff-button:hover {
                    background: #F57C00;
                }
                .apply-button {
                    background: #4CAF50;
                }
                .copy-button:hover {
                    background: #1976D2;
                }
                .apply-button:hover {
                    background: #45a049;
                }
                .badge {
                    display: inline-block;
                    background: #4CAF50;
                    color: white;
                    padding: 4px 12px;
                    border-radius: 12px;
                    font-size: 0.9em;
                    margin-left: 10px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🤖 Smart AI Fix - Iterative Refinement Complete!</h1>
                <p><strong>File:</strong> ${filename}</p>
                <p><strong>Timestamp:</strong> ${new Date(result.analysis_timestamp).toLocaleString()}</p>
                <span class="badge">✨ AI-Powered</span>
            </div>

            <div class="stats">
                <div class="stat-card">
                    <div class="stat-number">${result.fixed_issues_count}</div>
                    <div>Issues Fixed</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${result.fixed_issue_ids.length}</div>
                    <div>Total Fixes Applied</div>
                </div>
            </div>

            <div class="code-container">
                <h3>✨ Refined Code (Iterative AI Fix)</h3>
                <button class="copy-button" onclick="copyCode()">📋 Copy Code</button>
                <button class="diff-button" onclick="showDiff()">⚖️ Review Changes (Diff)</button>
                <button class="apply-button" onclick="applyCode()">✅ Apply to Editor</button>
                <div class="code-block" id="fixedCode">${escapeHtml(result.refactored_code)}</div>
            </div>

            <div style="background: var(--vscode-textBlockQuote-background); padding: 15px; border-radius: 8px;">
                <h3>💡 What Smart AI Fix Did:</h3>
                <ul>
                    <li>✅ Analyzed all ${result.fixed_issues_count} issues in your code</li>
                    <li>🔄 Applied iterative refinement with multiple AI passes</li>
                    <li>🧬 Used AST-aware code transformation</li>
                    <li>🔒 Maintained code structure and functionality</li>
                    <li>✨ Optimized for best practices and quality</li>
                </ul>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                function copyCode() {
                    const codeElement = document.getElementById('fixedCode');
                    const text = codeElement.textContent;
                    navigator.clipboard.writeText(text).then(() => {
                        alert('✅ Code copied to clipboard!');
                    });
                }

                function applyCode() {
                    const codeElement = document.getElementById('fixedCode');
                    const text = codeElement.textContent;
                    vscode.postMessage({
                        command: 'applyCode',
                        code: text
                    });
                }

                function showDiff() {
                    const codeElement = document.getElementById('fixedCode');
                    const text = codeElement.textContent;
                    vscode.postMessage({
                        command: 'showDiff',
                        code: text
                    });
                }
            </script>
        </body>
        </html>
    `;
}

// Helper to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Helper function to update status bar
function updateStatusBar() {
    if (!statusBarItem) return;

    if (backendHealthy) {
        statusBarItem.text = `$(check) Code Health ${autoAnalyzeEnabled ? '$(sync)' : ''}`;
        statusBarItem.tooltip = `Backend: Online${autoAnalyzeEnabled ? ' | Auto-analyze: ON' : ''}`;
        statusBarItem.backgroundColor = undefined;
    } else {
        statusBarItem.text = '$(x) Code Health';
        statusBarItem.tooltip = 'Backend: Offline - Click for details';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
}

// Check backend health
async function checkBackendHealth() {
    try {
        const response = await fetch(`${getApiUrl()}/health`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            backendHealthy = true;
            const health = await response.json();
            console.log('Backend health:', health);
        } else {
            backendHealthy = false;
        }
    } catch (error) {
        backendHealthy = false;
        console.error('Backend health check failed:', error);
    }
    updateStatusBar();
}

// Show backend status
async function showBackendStatus() {
    try {
        const response = await fetch(`${getApiUrl()}/health`);
        if (!response.ok) {
            throw new Error('Backend not responding');
        }

        const health = await response.json();
        const panel = vscode.window.createWebviewPanel(
            'backendStatus',
            'Backend Status',
            vscode.ViewColumn.One,
            {}
        );

        panel.webview.html = getBackendStatusHtml(health);
    } catch (error) {
        vscode.window.showErrorMessage(
            'Backend is offline. Please start the Python backend.',
            'Show Instructions'
        ).then(selection => {
            if (selection === 'Show Instructions') {
                showBackendInstructions();
            }
        });
    }
}

// Clear backend cache
async function clearBackendCache() {
    try {
        const response = await fetch(`${getApiUrl()}/cache/clear`, {
            method: 'DELETE'
        });

        if (response.ok) {
            const result = await response.json();
            vscode.window.showInformationMessage(`✅ ${result.message}`);
        } else {
            throw new Error('Failed to clear cache');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to clear cache: ${error.message}`);
    }
}

// Show cache statistics
async function showCacheStats() {
    try {
        const response = await fetch(`${getApiUrl()}/cache/stats`);
        if (!response.ok) {
            throw new Error('Failed to get cache stats');
        }

        const stats = await response.json();
        vscode.window.showInformationMessage(
            `📊 Cache Stats: ${stats.total_entries} entries, ${stats.cache_size_mb.toFixed(2)} MB`
        );
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to get cache stats: ${error.message}`);
    }
}

// Fix specific issue
async function fixSpecificIssue(issueId) {
    if (!currentAnalysisData || !currentCode) {
        vscode.window.showErrorMessage('No analysis data available');
        return;
    }

    // The issueId from the diagnostic is the unique ID. We need to find the corresponding issue number for the API.
    const issue = currentAnalysisData.issues.find(i => i.id === issueId);
    if (!issue) {
        vscode.window.showErrorMessage('Could not find the selected issue to fix.');
        return;
    }

    // The API's selective fix endpoint expects the 1-based index of the issue.
    const issue_index = currentAnalysisData.issues.indexOf(issue) + 1;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Fixing specific issue...",
        cancellable: false
    }, async (progress) => {
        try {
            progress.report({ increment: 0, message: 'Sending to AI for fixing...' });

            const response = await fetch(`${getApiUrl()}/fix/selective/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: currentCode,
                    issue_ids: [issue_index],
                    language: currentLanguage,
                    file_path: currentFilePath
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Backend error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            progress.report({ increment: 100 });

            showFixedCode(result, currentFilename);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to apply fix: ${error.message}`);
            console.error('Apply fix error:', error);
        }
    });
}

// Jump to line in editor
function jumpToLine(line) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
    }

    const position = new vscode.Position(Math.max(0, line - 1), 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.InCenter
    );
}

// Analyze with options
async function analyzeWithOptions() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No file is currently open');
        return;
    }

    const options = await vscode.window.showQuickPick(
        [
            { label: 'Standard Analysis', value: 'standard' },
            { label: 'With Deduplication Stats', value: 'dedup' },
            { label: 'Without Deduplication', value: 'nodedup' }
        ],
        { placeHolder: 'Select analysis type' }
    );

    if (!options) return;

    const config = vscode.workspace.getConfiguration('codeHealth');
    const originalDedup = config.get('enableHybridDeduplication');
    const originalStats = config.get('showDeduplicationStats');

    if (options.value === 'dedup') {
        await config.update('enableHybridDeduplication', true, false);
        await config.update('showDeduplicationStats', true, false);
    } else if (options.value === 'nodedup') {
        await config.update('enableHybridDeduplication', false, false);
    }

    const document = editor.document;
    await analyzeCode(
        document.getText(),
        document.languageId,
        path.basename(document.fileName),
        document.fileName
    );

    // Restore original settings
    await config.update('enableHybridDeduplication', originalDedup, false);
    await config.update('showDeduplicationStats', originalStats, false);
}

// Show analysis history
function showAnalysisHistory() {
    vscode.window.showInformationMessage('Analysis history feature coming soon!');
}

// Export analysis results
async function exportAnalysisResults() {
    if (!currentAnalysisData) {
        vscode.window.showErrorMessage('No analysis data to export');
        return;
    }

    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('analysis-results.json'),
        filters: {
            'JSON': ['json'],
            'Text': ['txt'],
            'Markdown': ['md']
        }
    });

    if (uri) {
        try {
            const ext = path.extname(uri.fsPath);
            let content;

            if (ext === '.json') {
                content = JSON.stringify(currentAnalysisData, null, 2);
            } else if (ext === '.md') {
                content = generateMarkdownReport(currentAnalysisData);
            } else {
                content = generateTextReport(currentAnalysisData);
            }

            fs.writeFileSync(uri.fsPath, content, 'utf8');
            vscode.window.showInformationMessage(`✅ Results exported to ${uri.fsPath}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Export failed: ${error.message}`);
        }
    }
}

// Generate markdown report
function generateMarkdownReport(data) {
    let md = `# Code Analysis Report\n\n`;
    md += `**Score:** ${data.code_score.toFixed(1)}/100\n`;
    md += `**Total Issues:** ${data.total_issues}\n`;
    md += `**Timestamp:** ${new Date(data.analysis_timestamp).toLocaleString()}\n\n`;

    md += `## Severity Breakdown\n\n`;
    for (const [severity, count] of Object.entries(data.severity_counts || {})) {
        md += `- **${severity}:** ${count}\n`;
    }

    md += `\n## Issues\n\n`;
    data.issues.forEach((issue, i) => {
        md += `### ${i + 1}. Line ${issue.line} - ${issue.severity}\n`;
        md += `**Description:** ${issue.description}\n\n`;
        md += `**Suggestion:** ${issue.suggestion}\n\n`;
        md += `**Category:** ${issue.category} | **Source:** ${issue.source}\n\n`;
        md += `---\n\n`;
    });

    return md;
}

// Generate text report
function generateTextReport(data) {
    let txt = `CODE ANALYSIS REPORT\n${'='.repeat(50)}\n\n`;
    txt += `Score: ${data.code_score.toFixed(1)}/100\n`;
    txt += `Total Issues: ${data.total_issues}\n`;
    txt += `Timestamp: ${new Date(data.analysis_timestamp).toLocaleString()}\n\n`;

    txt += `ISSUES:\n${'-'.repeat(50)}\n\n`;
    data.issues.forEach((issue, i) => {
        txt += `${i + 1}. Line ${issue.line} [${issue.severity.toUpperCase()}]\n`;
        txt += `   ${issue.description}\n`;
        txt += `   Suggestion: ${issue.suggestion}\n\n`;
    });

    return txt;
}

// Update diagnostics
function updateDiagnostics(analysisData, filePath) {
    if (!filePath || !diagnosticCollection) return;

    const diagnostics = [];
    const uri = vscode.Uri.file(filePath);

    for (const issue of analysisData.issues || []) {
        const line = Math.max(0, (issue.line || 1) - 1);
        const range = new vscode.Range(
            new vscode.Position(line, 0),
            new vscode.Position(line, 1000)
        );

        let severity;
        switch (issue.severity?.toLowerCase()) {
            case 'critical':
            case 'high':
                severity = vscode.DiagnosticSeverity.Error;
                break;
            case 'medium':
                severity = vscode.DiagnosticSeverity.Warning;
                break;
            case 'low':
                severity = vscode.DiagnosticSeverity.Information;
                break;
            default:
                severity = vscode.DiagnosticSeverity.Hint;
        }

        const diagnostic = new vscode.Diagnostic(
            range,
            `${issue.description}\n💡 ${issue.suggestion}`,
            severity
        );

        diagnostic.source = 'Code Health';
        diagnostic.code = issue.id;
        diagnostics.push(diagnostic);
    }

    diagnosticCollection.set(uri, diagnostics);
}

// Code Action Provider
class CodeHealthActionProvider {
    static providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];

    provideCodeActions(document, range, context) {
        const actions = [];

        for (const diagnostic of context.diagnostics) {
            if (diagnostic.source === 'Code Health') {
                const action = new vscode.CodeAction(
                    `Fix issue: ${diagnostic.code}`,
                    vscode.CodeActionKind.QuickFix
                );
                action.command = {
                    command: 'code-health.fixIssue',
                    title: 'Fix this issue',
                    arguments: [diagnostic.code]
                };
                action.diagnostics = [diagnostic];
                actions.push(action);

                // Add "Jump to issue" action
                const jumpAction = new vscode.CodeAction(
                    'View issue details',
                    vscode.CodeActionKind.QuickFix
                );
                jumpAction.command = {
                    command: 'code-health.jumpToIssue',
                    title: 'Jump to issue',
                    arguments: [range.start.line + 1]
                };
                actions.push(jumpAction);
            }
        }

        return actions;
    }
}

function showAnalysisResults(result, filename, language) {
    const panel = vscode.window.createWebviewPanel(
        'codeAnalysisResults',
        `AI Analysis Results - ${filename}`,
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(
        async message => {
            switch (message.command) {
                case 'smartAiFix':
                    await startSmartFix(currentCode, currentLanguage, currentFilePath);
                    break;
                case 'fixSelected':
                    // This is now handled by the selective fix workflow, but we can call the apply endpoint directly for a quicker fix.
                    await applySelectedFixes(currentCode, currentLanguage, currentFilePath, message.issueIds, panel);
                    break;
                case 'jumpToLine':
                    jumpToLine(message.line);
                    break;
            }
        },
        undefined,
        []
    );

    panel.webview.html = getResultsHtml(result, filename, language);
}

function showFixedCode(result, filename) {
    const panel = vscode.window.createWebviewPanel(
        'fixedCodeResults',
        `Fixed Code - ${filename}`,
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(
        async message => {
            if (message.command === 'applyCode') {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    const document = editor.document;
                    const fullRange = new vscode.Range(
                        document.positionAt(0),
                        document.positionAt(document.getText().length)
                    );
                    await editor.edit(editBuilder => {
                        editBuilder.replace(fullRange, message.code);
                    });
                    vscode.window.showInformationMessage('✅ Fixed code applied to editor!');
                    panel.dispose();
                } else {
                    vscode.window.showErrorMessage('No active editor to apply code to');
                }
            } else if (message.command === 'showDiff') {
                await showDiffView(currentCode, message.code, filename);
            }
        },
        undefined,
        []
    );

    panel.webview.html = getFixedCodeHtml(result, filename);
}

function getResultsHtml(result, filename, language) {
    const issuesHtml = result.issues.map((issue, index) => `
        <div class="issue-card ${issue.severity.toLowerCase()}">
            <div class="issue-header">
                <input type="checkbox" class="issue-checkbox" data-issue-id="${issue.id}" id="issue-${issue.id}">
                <label for="issue-${issue.id}" class="issue-number">#${index + 1}</label>
                <span class="issue-title">${issue.description}</span>
                <span class="line-number" onclick="jumpToLine(${issue.line})" style="cursor: pointer;" title="Click to jump to line">📍 Line ${issue.line}</span>
                <span class="severity-badge ${issue.severity.toLowerCase()}">${issue.severity}</span>
                <span class="category-badge">${issue.category}</span>
            </div>
            <div class="issue-description">
                <strong>Description:</strong> ${issue.description}
            </div>
            <div class="issue-suggestion">
                <strong>💡 Suggestion:</strong> ${issue.suggestion}
            </div>
            <div class="issue-details">
                <strong>Confidence:</strong> ${(issue.confidence * 100).toFixed(1)}% | 
                <strong>Priority:</strong> ${(issue.priority * 100).toFixed(1)}% | 
                <strong>Source:</strong> ${issue.source}
            </div>
            ${issue.ast_enhanced ? `<div class="ast-badge">🧬 AST Enhanced</div>` : ''}
            ${issue.merge_type ? `<div class="merge-badge">🔗 Merged from ${issue.merged_count} sources</div>` : ''}
        </div>
    `).join('');

    // Generate severity chart
    const severityStats = result.severity_counts || {};
    const analysisBreakdown = result.analysis_breakdown || {};

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background: var(--vscode-editor-background);
                    margin: 0;
                    padding: 20px;
                }
                .header {
                    background: linear-gradient(90deg, #667eea, #764ba2);
                    color: white;
                    padding: 20px;
                    border-radius: 10px;
                    margin-bottom: 20px;
                    position: relative;
                }
                .ai-badge {
                    background: #4CAF50;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 12px;
                    font-size: 0.8em;
                    font-weight: bold;
                    margin-left: 10px;
                }
                .action-buttons {
                    display: flex;
                    gap: 10px;
                    margin-top: 15px;
                    flex-wrap: wrap;
                }
                .smart-fix-button {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 14px;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                .smart-fix-button:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 12px rgba(0,0,0,0.15);
                }
                .fix-selected-button {
                    background: #4CAF50;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 14px;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                .fix-selected-button:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 12px rgba(0,0,0,0.15);
                    background: #45a049;
                }
                .select-all-button {
                    background: #2196F3;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 14px;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                .select-all-button:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 12px rgba(0,0,0,0.15);
                    background: #1976D2;
                }
                .issue-checkbox {
                    width: 18px;
                    height: 18px;
                    cursor: pointer;
                    margin-right: 8px;
                }
                .ast-badge, .merge-badge {
                    display: inline-block;
                    background: #9C27B0;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 0.85em;
                    margin-top: 8px;
                    margin-right: 5px;
                }
                .merge-badge {
                    background: #FF9800;
                }
                .stats-container {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                    margin-bottom: 20px;
                }
                .stats-card {
                    background: var(--vscode-textBlockQuote-background);
                    border: 1px solid var(--vscode-textBlockQuote-border);
                    border-radius: 8px;
                    padding: 15px;
                }
                .stats-title {
                    font-weight: bold;
                    margin-bottom: 10px;
                    color: #667eea;
                }
                .stat-item {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 5px;
                    padding: 5px;
                    border-radius: 4px;
                }
                .summary {
                    display: flex;
                    gap: 20px;
                    margin-bottom: 20px;
                }
                .summary-card {
                    background: var(--vscode-textBlockQuote-background);
                    border: 1px solid var(--vscode-textBlockQuote-border);
                    border-radius: 8px;
                    padding: 15px;
                    flex: 1;
                    text-align: center;
                }
                .summary-number {
                    font-size: 2em;
                    font-weight: bold;
                    color: #667eea;
                }
                .issue-card {
                    background: var(--vscode-textBlockQuote-background);
                    border: 1px solid var(--vscode-textBlockQuote-border);
                    border-radius: 8px;
                    padding: 15px;
                    margin-bottom: 15px;
                }
                .issue-card.critical {
                    border-left: 4px solid #d32f2f;
                }
                .issue-card.high {
                    border-left: 4px solid #f44336;
                }
                .issue-card.medium {
                    border-left: 4px solid #ff9800;
                }
                .issue-card.low {
                    border-left: 4px solid #2196f3;
                }
                .issue-header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 10px;
                    flex-wrap: wrap;
                }
                .issue-number {
                    background: #667eea;
                    color: white;
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-size: 0.8em;
                    font-weight: bold;
                }
                .issue-title {
                    font-weight: bold;
                    color: #667eea;
                    flex-grow: 1;
                }
                .line-number {
                    background: #4CAF50;
                    color: white;
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 0.9em;
                }
                .severity-badge {
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 0.8em;
                    font-weight: bold;
                    color: white;
                }
                .severity-badge.critical { background: #d32f2f; }
                .severity-badge.high { background: #f44336; }
                .severity-badge.medium { background: #ff9800; }
                .severity-badge.low { background: #2196f3; }
                .category-badge {
                    background: #9C27B0;
                    color: white;
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 0.8em;
                }
                .issue-description, .issue-suggestion, .issue-details {
                    color: var(--vscode-foreground);
                    line-height: 1.5;
                    margin-bottom: 10px;
                }
                .issue-details {
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                }
                .no-issues {
                    text-align: center;
                    padding: 40px;
                    color: #4CAF50;
                }
                .no-issues h2 {
                    color: #4CAF50;
                }
                .score-display {
                    text-align: center;
                    margin-bottom: 20px;
                }
                .score-number {
                    font-size: 3em;
                    font-weight: bold;
                    color: #4CAF50;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🤖 AI Code Analysis Results</h1>
                <span class="ai-badge">✨ AI POWERED</span>
                <p><strong>File:</strong> ${filename}</p>
                <p><strong>Language:</strong> ${language}</p>
                <p><strong>AI Model:</strong> Google Gemini Pro</p>
                <div class="action-buttons">
                    <button class="smart-fix-button" onclick="smartAiFix()" title="AI-powered iterative code fixing with multiple refinement passes">
                        🤖 Smart AI Fix (Iterative)
                    </button>
                    <button class="fix-selected-button" onclick="fixSelected()" title="Fix only the selected issues">
                        ✅ Fix Selected Issues
                    </button>
                    <button class="select-all-button" onclick="toggleSelectAll()">
                        ☑️ Select All
                    </button>
                </div>
            </div>

            <div class="score-display">
                <div class="score-number">${result.code_score.toFixed(1)}</div>
                <div>Code Quality Score</div>
            </div>

            <div class="summary">
                <div class="summary-card">
                    <div class="summary-number">${result.total_issues}</div>
                    <div>Total Issues</div>
                </div>
                <div class="summary-card">
                    <div class="summary-number">${severityStats.critical || 0}</div>
                    <div>Critical</div>
                </div>
                <div class="summary-card">
                    <div class="summary-number">${severityStats.high || 0}</div>
                    <div>High Priority</div>
                </div>
                <div class="summary-card">
                    <div class="summary-number">${severityStats.medium || 0}</div>
                    <div>Medium Priority</div>
                </div>
                <div class="summary-card">
                    <div class="summary-number">${severityStats.low || 0}</div>
                    <div>Low Priority</div>
                </div>
            </div>

            ${result.total_issues > 0 ? `
                <div class="stats-container">
                    <div class="stats-card">
                        <div class="stats-title">📊 Issues by Severity</div>
                        ${Object.entries(severityStats).map(([severity, count]) => `
                            <div class="stat-item">
                                <span>${severity}:</span>
                                <span><strong>${count}</strong></span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="stats-card">
                        <div class="stats-title">🔍 Analysis Breakdown</div>
                        ${Object.entries(analysisBreakdown).map(([type, count]) => `
                            <div class="stat-item">
                                <span>${type.replace('_', ' ')}:</span>
                                <span><strong>${count}</strong></span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                ${result.deduplication_stats ? `
                    <div class="stats-card" style="margin-bottom: 20px;">
                        <div class="stats-title">🔗 Deduplication Statistics</div>
                        <div class="stat-item">
                            <span>Original Issues:</span>
                            <span><strong>${result.deduplication_stats.original_issue_count || 0}</strong></span>
                        </div>
                        <div class="stat-item">
                            <span>Final Issues:</span>
                            <span><strong>${result.deduplication_stats.final_issue_count || 0}</strong></span>
                        </div>
                        <div class="stat-item">
                            <span>Reduction:</span>
                            <span><strong>${(result.deduplication_stats.reduction_percentage || 0).toFixed(1)}%</strong></span>
                        </div>
                        <div class="stat-item">
                            <span>Merge Operations:</span>
                            <span><strong>${result.deduplication_stats.merge_operations || 0}</strong></span>
                        </div>
                    </div>
                ` : ''}

                ${result.ast_metrics ? `
                    <div class="stats-card" style="margin-bottom: 20px;">
                        <div class="stats-title">🧬 AST Analysis Metrics</div>
                        <div class="stat-item">
                            <span>Functions:</span>
                            <span><strong>${result.ast_metrics.function_count || 0}</strong></span>
                        </div>
                        <div class="stat-item">
                            <span>Classes:</span>
                            <span><strong>${result.ast_metrics.class_count || 0}</strong></span>
                        </div>
                        <div class="stat-item">
                            <span>Complexity:</span>
                            <span><strong>${result.ast_metrics.complexity || 'N/A'}</strong></span>
                        </div>
                        <div class="stat-item">
                            <span>AST Enhanced Issues:</span>
                            <span><strong>${result.ast_enhanced_count || 0}</strong></span>
                        </div>
                    </div>
                ` : ''}
            ` : ''}

            ${result.total_issues === 0 ? `
                <div class="no-issues">
                    <h2>🎉 Excellent Code Quality!</h2>
                    <p>AI analysis found no issues in this file.</p>
                    <p>Your code follows best practices and maintains high quality standards!</p>
                </div>
            ` : `
                <h2>🔍 Issues Found by AI:</h2>
                ${issuesHtml}
            `}

           <script>
                const vscode = acquireVsCodeApi();
                let allSelected = false;

                function smartAiFix() {
                    vscode.postMessage({
                        command: 'smartAiFix'
                    });
                }

                function fixSelected() {
                    const checkboxes = document.querySelectorAll('.issue-checkbox:checked');
                    if (checkboxes.length === 0) {
                        alert('Please select at least one issue to fix');
                        return;
                    }
                    const issueIds = Array.from(checkboxes).map(cb => cb.dataset.issueId);
                    vscode.postMessage({
                        command: 'fixSelected',
                        issueIds: issueIds
                    });
                }

                function toggleSelectAll() {
                    allSelected = !allSelected;
                    const checkboxes = document.querySelectorAll('.issue-checkbox');
                    checkboxes.forEach(cb => cb.checked = allSelected);
                    const button = document.querySelector('.select-all-button');
                    if (button) {
                        button.textContent = allSelected ? '☐ Deselect All' : '☑️ Select All';
                    }
                }

                function jumpToLine(line) {
                    vscode.postMessage({
                        command: 'jumpToLine',
                        line: line
                    });
                }

                // FIXED: Update selected count with proper error handling and event delegation
                function updateSelectedCount() {
                    const selectedCount = document.querySelectorAll('.issue-checkbox:checked').length;
                    const fixButton = document.querySelector('.fix-selected-button');
                    
                    if (fixButton) {
                        if (selectedCount > 0) {
                            fixButton.textContent = \`✅ Fix Selected Issues (\${selectedCount})\`;
                        } else {
                            fixButton.textContent = '✅ Fix Selected Issues';
                        }
                    }
                }

                // Use event delegation to handle checkbox changes efficiently
                // This prevents multiple listeners and handles dynamically added checkboxes
                document.addEventListener('change', function(e) {
                    if (e.target && e.target.classList.contains('issue-checkbox')) {
                        updateSelectedCount();
                    }
                }, { passive: true });

                // Initialize the count on page load
                document.addEventListener('DOMContentLoaded', function() {
                    updateSelectedCount();
                });

                // Also update immediately in case DOMContentLoaded already fired
                if (document.readyState === 'loading') {
                    // Still loading, wait for DOMContentLoaded
                } else {
                    // DOM is ready, update now
                    updateSelectedCount();
                }
            </script>
        </body>
        </html>
    `;
}

function showIterativeFixResults(result, filename) {
    const panel = vscode.window.createWebviewPanel(
        'iterativeFixResults',
        `Smart-Fix Results - ${filename}`,
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    panel.webview.onDidReceiveMessage(
        async message => {
            if (message.command === 'applyCode') {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    const document = editor.document;
                    const fullRange = new vscode.Range(
                        document.positionAt(0),
                        document.positionAt(document.getText().length)
                    );
                    await editor.edit(editBuilder => {
                        editBuilder.replace(fullRange, message.code);
                    });
                    vscode.window.showInformationMessage('✅ Smart-Fix applied to editor!');
                    panel.dispose();
                } else {
                    vscode.window.showErrorMessage('No active editor to apply code to');
                }
            } else if (message.command === 'showDiff') {
                await showDiffView(currentCode, message.code, filename);
            }
        },
        undefined,
        []
    );

    panel.webview.html = getIterativeFixResultsHtml(result, filename);
}

function showSelectiveFixUI(result, code, language, filePath) {
    const panel = vscode.window.createWebviewPanel(
        'selectiveFixUI',
        `Selective Fix - ${path.basename(filePath)}`,
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    panel.webview.onDidReceiveMessage(
        async message => {
            if (message.command === 'applySelectedFixes') {
                await applySelectedFixes(code, language, filePath, message.issueIds, panel);
            }
        },
        undefined,
        []
    );

    panel.webview.html = getSelectiveFixUIHtml(result, path.basename(filePath));
}

async function applySelectedFixes(code, language, filePath, issueIds, panel) {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Applying selected fixes...",
        cancellable: false
    }, async (progress) => {
        try {
            progress.report({ increment: 0, message: 'Sending to AI for fixing...' });

            const response = await fetch(`${getApiUrl()}/fix/selective/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: code,
                    issue_ids: issueIds,
                    language: language,
                    file_path: filePath
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Backend error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            progress.report({ increment: 100 });

            panel.dispose(); // Close the selective fix UI
            showFixedCode(result, path.basename(filePath)); // Show the fixed code

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to apply fixes: ${error.message}`);
            console.error('Apply fixes error:', error);
        }
    });
}

async function showDiffView(originalCode, fixedCode, filename) {
    try {
        // Create a temporary file for the fixed code
        const tempDir = os.tmpdir();
        const tempFilePath = path.join(tempDir, `fixed_${filename}`);
        fs.writeFileSync(tempFilePath, fixedCode);

        const originalUri = vscode.Uri.file(currentFilePath); // Use the global currentFilePath
        const fixedUri = vscode.Uri.file(tempFilePath);

        await vscode.commands.executeCommand('vscode.diff',
            originalUri,
            fixedUri,
            `Original vs Fixed: ${filename}`
        );
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to show diff view: ${error.message}`);
    }
}

function getFixedCodeHtml(result, filename) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background: var(--vscode-editor-background);
                    margin: 0;
                    padding: 20px;
                }
                .header {
                    background: linear-gradient(90deg, #4CAF50, #45a049);
                    color: white;
                    padding: 20px;
                    border-radius: 10px;
                    margin-bottom: 20px;
                }
                .code-container {
                    background: var(--vscode-textBlockQuote-background);
                    border: 1px solid var(--vscode-textBlockQuote-border);
                    border-radius: 8px;
                    padding: 20px;
                    margin-bottom: 20px;
                }
                .code-block {
                    background: var(--vscode-textCodeBlock-background);
                    border: 1px solid var(--vscode-textBlockQuote-border);
                    border-radius: 4px;
                    padding: 15px;
                    font-family: 'Courier New', monospace;
                    white-space: pre-wrap;
                    overflow-x: auto;
                    max-height: 500px;
                    overflow-y: auto;
                }
                .stats {
                    display: flex;
                    gap: 20px;
                    margin-bottom: 20px;
                }
                .stat-card {
                    background: var(--vscode-textBlockQuote-background);
                    border: 1px solid var(--vscode-textBlockQuote-border);
                    border-radius: 8px;
                    padding: 15px;
                    flex: 1;
                    text-align: center;
                }
                .stat-number {
                    font-size: 2em;
                    font-weight: bold;
                    color: #4CAF50;
                }
                .copy-button, .apply-button {
                    background: #2196F3;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-weight: bold;
                    margin-bottom: 10px;
                    margin-right: 10px;
                }
                .apply-button {
                    background: #4CAF50;
                }
                .copy-button:hover {
                    background: #1976D2;
                }
                .apply-button:hover {
                    background: #45a049;
                }
                .diff-button {
                    background: #FF9800;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-weight: bold;
                    margin-bottom: 10px;
                    margin-right: 10px;
                }
                .diff-button:hover {
                    background: #F57C00;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>✅ Code Fixed Successfully!</h1>
                <p><strong>File:</strong> ${filename}</p>
                <p><strong>Fixed Issues:</strong> ${result.fixed_issues_count}</p>
                <p><strong>Timestamp:</strong> ${new Date(result.analysis_timestamp).toLocaleString()}</p>
            </div>

            <div class="stats">
                <div class="stat-card">
                    <div class="stat-number">${result.fixed_issues_count}</div>
                    <div>Issues Fixed</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${result.fixed_issue_ids.length}</div>
                    <div>Issue IDs</div>
                </div>
            </div>

            <div class="code-container">
                <button class="copy-button" onclick="copyCode()">📋 Copy Fixed Code</button>
                <button class="diff-button" onclick="showDiff()">⚖️ Review Changes (Diff)</button>
                <button class="apply-button" onclick="applyCode()">✅ Apply to Editor</button>
                <div class="code-block" id="fixedCode">${escapeHtml(result.refactored_code)}</div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                function copyCode() {
                    const codeElement = document.getElementById('fixedCode');
                    const text = codeElement.textContent;
                    navigator.clipboard.writeText(text).then(() => {
                        alert('✅ Code copied to clipboard!');
                    });
                }

                function applyCode() {
                    const codeElement = document.getElementById('fixedCode');
                    const text = codeElement.textContent;
                    vscode.postMessage({
                        command: 'applyCode',
                        code: text
                    });
                }
            </script>
        </body>
        </html>
    `;
}

function showBackendInstructions() {
    const panel = vscode.window.createWebviewPanel(
        'backendInstructions',
        'AI Code Reviewer Backend Setup',
        vscode.ViewColumn.One,
        {}
    );

    panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background: var(--vscode-editor-background);
                    margin: 0;
                    padding: 20px;
                    line-height: 1.6;
                }
                .header {
                    background: linear-gradient(90deg, #4ecdc4, #44a08d);
                    color: white;
                    padding: 20px;
                    border-radius: 10px;
                    margin-bottom: 20px;
                }
                .step {
                    background: var(--vscode-textBlockQuote-background);
                    border: 1px solid var(--vscode-textBlockQuote-border);
                    border-radius: 8px;
                    padding: 15px;
                    margin-bottom: 15px;
                }
                .code-block {
                    background: var(--vscode-textCodeBlock-background);
                    border: 1px solid var(--vscode-textBlockQuote-border);
                    border-radius: 4px;
                    padding: 10px;
                    font-family: 'Courier New', monospace;
                    margin: 10px 0;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🐍 AI Code Reviewer Backend Setup</h1>
                <p>Follow these steps to start the AI Code Reviewer backend</p>
            </div>

            <div class="step">
                <h3>Step 1: Get Gemini API Key</h3>
                <p>Get your free API key from Google AI Studio:</p>
                <div class="code-block">https://makersuite.google.com/app/apikey</div>
            </div>

            <div class="step">
                <h3>Step 2: Set Environment Variable</h3>
                <p>Set your API key as environment variable:</p>
                <div class="code-block">
                    # Windows:<br>
                    set GEMINI_API_KEY=your_api_key_here<br><br>
                    # Linux/Mac:<br>
                    export GEMINI_API_KEY=your_api_key_here
                </div>
            </div>

            <div class="step">
                <h3>Step 3: Install Python Dependencies</h3>
                <p>Navigate to the ai_code_review_system directory and install dependencies:</p>
                <div class="code-block">
                    cd ai_code_review_system<br>
                    pip install -r requirements.txt
                </div>
            </div>

            <div class="step">
                <h3>Step 4: Start the AI Backend</h3>
                <p>Run the AI Code Reviewer API server:</p>
                <div class="code-block">
                    python start_api.py
                </div>
                <p>You should see: "🚀 Starting AI Code Reviewer API Server..."</p>
            </div>

            <div class="step">
                <h3>Step 5: Verify Backend is Running</h3>
                <p>Visit: <strong>http://localhost:8000/health</strong> to verify the backend is working</p>
                <p>API Documentation: <strong>http://localhost:8000/docs</strong></p>
            </div>
        </body>
        </html>
    `;
}

function getIterativeFixResultsHtml(result, filename) {
    const historyHtml = result.history.map(step => `
        <div class="stat-item">
            <span>Iteration ${step.iteration}:</span>
            <span>Score: <strong>${step.score.toFixed(1)}</strong> | Issues Fixed: <strong>${step.issues_fixed}</strong></span>
        </div>
    `).join('');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                /* Add your styles here */
            </style>
        </head>
        <body>
            <h1>Smart Auto-Fix Results</h1>
            <p>File: ${filename}</p>
            <h2>Summary</h2>
            <p>Initial Score: ${result.initial_score.toFixed(1)}</p>
            <p>Final Score: ${result.final_score.toFixed(1)}</p>
            <p>Score Improvement: ${result.score_improvement.toFixed(1)}</p>
            <p>Issues Resolved: ${result.issues_resolved}</p>
            <h2>Iteration History</h2>
            <div>${historyHtml}</div>
            <h2>Final Code</h2>
            <pre><code>${escapeHtml(result.final_code)}</code></pre>
            <button onclick="showDiff()">Review Changes (Diff)</button>
            <button onclick="applyCode()">Apply to Editor</button>
            <script>
                const vscode = acquireVsCodeApi();
                function applyCode() {
                    vscode.postMessage({
                        command: 'applyCode',
                        code: ${JSON.stringify(result.final_code)}
                    });
                }
                function showDiff() {
                    vscode.postMessage({
                        command: 'showDiff',
                        code: ${JSON.stringify(result.final_code)}
                    });
                }
            </script>
        </body>
        </html>
    `;
}

function getSelectiveFixUIHtml(result, filename) {
    const issuesHtml = result.issues.map((issue, index) => `
        <div>
            <input type="checkbox" id="issue-${index}" value="${index + 1}">
            <label for="issue-${index}">${issue.description} (Line: ${issue.line}, Severity: ${issue.severity})</label>
        </div>
    `).join('');

    return `
        <!DOCTYPE html>
        <html>
        <body>
            <h1>Selective Fix</h1>
            <p>File: ${filename}</p>
            <form id="fix-form">
                ${issuesHtml}
                <button type="submit">Apply Selected Fixes</button>
            </form>
            <script>
                const vscode = acquireVsCodeApi();
                const form = document.getElementById('fix-form');
                form.addEventListener('submit', (event) => {
                    event.preventDefault();
                    const selectedIssues = Array.from(form.elements)
                        .filter(el => el.type === 'checkbox' && el.checked)
                        .map(el => parseInt(el.value));
                    vscode.postMessage({
                        command: 'applySelectedFixes',
                        issueIds: selectedIssues
                    });
                });
            </script>
        </body>
        </html>
    `;
}

function getBackendStatusHtml(health) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background: var(--vscode-editor-background);
                    margin: 0;
                    padding: 20px;
                }
                .header {
                    background: linear-gradient(90deg, #4CAF50, #45a049);
                    color: white;
                    padding: 20px;
                    border-radius: 10px;
                    margin-bottom: 20px;
                }
                .status-card {
                    background: var(--vscode-textBlockQuote-background);
                    border: 1px solid var(--vscode-textBlockQuote-border);
                    border-radius: 8px;
                    padding: 15px;
                    margin-bottom: 15px;
                }
                .status-item {
                    display: flex;
                    justify-content: space-between;
                    padding: 8px;
                    border-bottom: 1px solid var(--vscode-textBlockQuote-border);
                }
                .status-item:last-child {
                    border-bottom: none;
                }
                .badge {
                    background: #4CAF50;
                    color: white;
                    padding: 4px 12px;
                    border-radius: 12px;
                    font-size: 0.9em;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>✅ Backend Status: ${health.status === 'healthy' ? 'Online' : 'Offline'}</h1>
                <p>Version: ${health.version || 'Unknown'}</p>
            </div>
            
            <div class="status-card">
                <h3>Configuration</h3>
                <div class="status-item">
                    <span>API Key Configured:</span>
                    <span class="badge">${health.api_key_configured ? 'Yes' : 'No'}</span>
                </div>
            </div>
            
            <div class="status-card">
                <h3>Available Features</h3>
                ${Object.entries(health.features || {}).map(([feature, enabled]) => `
                    <div class="status-item">
                        <span>${feature.replace(/_/g, ' ').toUpperCase()}:</span>
                        <span class="badge" style="background: ${enabled ? '#4CAF50' : '#f44336'}">
                            ${enabled ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>
                `).join('')}
            </div>
        </body>
        </html>
    `;
}

function deactivate() {
    console.log('👋 AI Code Reviewer Extension deactivated');
}

// Enhanced Tree Data Provider
class CodeHealthTreeDataProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.analysisData = null;
    }

    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }

    updateAnalysisData(data) {
        this.analysisData = data;
        this.refresh();
    }

    getTreeItem(element) {
        return element;
    }

    getChildren(element) {
        if (!element) {
            const items = [
                new CodeHealthItem('🔍 Analyze Current File', 'Analyze the currently open file', vscode.TreeItemCollapsibleState.None, 'code-health.analyzeFile'),
                new CodeHealthItem('📁 Upload & Analyze File', 'Select and analyze any file', vscode.TreeItemCollapsibleState.None, 'code-health.uploadAndAnalyze'),
                new CodeHealthItem('🤖 Smart Auto-Fix', 'Perform iterative, multi-pass fixing', vscode.TreeItemCollapsibleState.None, 'code-health.startSmartFix'),
                new CodeHealthItem('🎯 Selective Fix', 'Choose which issues to fix', vscode.TreeItemCollapsibleState.None, 'code-health.startSelectiveFix')
            ];

            // Add analysis results if available
            if (this.analysisData) {
                items.push(
                    new CodeHealthItem(
                        `📊 Results: ${this.analysisData.code_score.toFixed(1)}/100`,
                        `${this.analysisData.total_issues} issues found`,
                        vscode.TreeItemCollapsibleState.Collapsed
                    )
                );
            }

            items.push(
                new CodeHealthItem('⚙️ Advanced', 'Advanced options', vscode.TreeItemCollapsibleState.Collapsed),
                new CodeHealthItem('ℹ️ Instructions', 'How to setup the AI backend', vscode.TreeItemCollapsibleState.Collapsed)
            );

            return items;
        } else if (element.label.includes('Results:')) {
            if (!this.analysisData) return [];

            const items = [];
            const severityCounts = this.analysisData.severity_counts || {};

            if (severityCounts.critical > 0) {
                items.push(new CodeHealthItem(`🔴 Critical: ${severityCounts.critical}`, '', vscode.TreeItemCollapsibleState.None));
            }
            if (severityCounts.high > 0) {
                items.push(new CodeHealthItem(`🟠 High: ${severityCounts.high}`, '', vscode.TreeItemCollapsibleState.None));
            }
            if (severityCounts.medium > 0) {
                items.push(new CodeHealthItem(`🟡 Medium: ${severityCounts.medium}`, '', vscode.TreeItemCollapsibleState.None));
            }
            if (severityCounts.low > 0) {
                items.push(new CodeHealthItem(`🟢 Low: ${severityCounts.low}`, '', vscode.TreeItemCollapsibleState.None));
            }

            if (this.analysisData.ast_enhanced_count > 0) {
                items.push(new CodeHealthItem(`🧬 AST Enhanced: ${this.analysisData.ast_enhanced_count}`, '', vscode.TreeItemCollapsibleState.None));
            }

            return items;
        } else if (element.label.includes('Advanced')) {
            return [
                new CodeHealthItem('🔄 Toggle Auto-Analyze', 'Enable/disable auto-analyze on save', vscode.TreeItemCollapsibleState.None, 'code-health.toggleAutoAnalyze'),
                new CodeHealthItem('⚙️ Analyze with Options', 'Analyze with custom options', vscode.TreeItemCollapsibleState.None, 'code-health.analyzeWithOptions'),
                new CodeHealthItem('📊 Cache Statistics', 'View backend cache stats', vscode.TreeItemCollapsibleState.None, 'code-health.cacheStats'),
                new CodeHealthItem('🗑️ Clear Cache', 'Clear backend cache', vscode.TreeItemCollapsibleState.None, 'code-health.clearCache'),
                new CodeHealthItem('📤 Export Results', 'Export analysis results', vscode.TreeItemCollapsibleState.None, 'code-health.exportResults'),
                new CodeHealthItem('❤️ Backend Status', 'Check backend health', vscode.TreeItemCollapsibleState.None, 'code-health.showStatus')
            ];
        } else if (element.label.includes('Instructions')) {
            return [
                new CodeHealthItem('1. Get Gemini API Key', 'From Google AI Studio', vscode.TreeItemCollapsibleState.None),
                new CodeHealthItem('2. Set GEMINI_API_KEY env variable', '', vscode.TreeItemCollapsibleState.None),
                new CodeHealthItem('3. Install: pip install -r requirements.txt', '', vscode.TreeItemCollapsibleState.None),
                new CodeHealthItem('4. Run: python start_api.py', '', vscode.TreeItemCollapsibleState.None),
                new CodeHealthItem('5. Test at: localhost:8000/health', '', vscode.TreeItemCollapsibleState.None)
            ];
        }
        return [];
    }
}

class CodeHealthItem extends vscode.TreeItem {
    constructor(label, tooltip, collapsibleState, commandId) {
        super(label, collapsibleState);
        this.tooltip = tooltip;
        this.description = tooltip;

        if (commandId) {
            this.command = {
                command: commandId,
                title: label,
                arguments: [this]
            };
        }

        // Set icons
        if (label.includes('Analyze Current')) {
            this.iconPath = new vscode.ThemeIcon('search');
        } else if (label.includes('Upload')) {
            this.iconPath = new vscode.ThemeIcon('cloud-upload');
        } else if (label.includes('Fix Code')) {
            this.iconPath = new vscode.ThemeIcon('tools');
        } else if (label.includes('Instructions')) {
            this.iconPath = new vscode.ThemeIcon('info');
        } else if (label.includes('Settings')) {
            this.iconPath = new vscode.ThemeIcon('gear');
        } else {
            this.iconPath = new vscode.ThemeIcon('circle-filled');
        }
    }
}

module.exports = {
    activate,
    deactivate
};
