const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

// Backend API URL
const API_URL = 'http://localhost:5000';

function activate(context) {
    console.log('🚀 Code Health Analyzer is now active!');

    // Create tree data provider
    const provider = new CodeHealthTreeDataProvider();
    
    // Register tree view
    const treeView = vscode.window.createTreeView('codeHealthSidebarView', {
        treeDataProvider: provider,
        showCollapseAll: true
    });
    
    context.subscriptions.push(treeView);

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

        await analyzeCode(code, language, filename);
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
                await analyzeCode(code, language, filename);
                
            } catch (error) {
                vscode.window.showErrorMessage(`Error reading file: ${error.message}`);
            }
        }
    });

    // Command: Refresh
    const refreshCommand = vscode.commands.registerCommand('code-health.refresh', () => {
        provider.refresh();
        vscode.window.showInformationMessage('🔄 Code Health refreshed!');
    });

    context.subscriptions.push(analyzeFileCommand, uploadAnalyzeCommand, refreshCommand);
}

async function analyzeCode(code, language, filename) {
    // Show progress
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Analyzing code...",
        cancellable: false
    }, async (progress) => {
        progress.report({ increment: 0, message: 'Sending to AI analyzer...' });

        try {
            // Check if backend is running
            progress.report({ increment: 30, message: 'Connecting to backend...' });
            
            const response = await fetch(`${API_URL}/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    code: code,
                    language: language,
                    filename: filename
                })
            });

            progress.report({ increment: 70, message: 'Processing results...' });

            if (!response.ok) {
                throw new Error(`Backend error: ${response.status}`);
            }

            const result = await response.json();
            progress.report({ increment: 100 });

            // Show results
            showAnalysisResults(result);

        } catch (error) {
            if (error.code === 'ECONNREFUSED' || error.message.includes('fetch')) {
                vscode.window.showErrorMessage(
                    '❌ Backend server is not running! Please start the Python backend first.',
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

function showAnalysisResults(result) {
    if (!result.success) {
        vscode.window.showErrorMessage(`Analysis failed: ${result.error}`);
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        'codeAnalysisResults',
        `Analysis Results - ${result.filename}`,
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    panel.webview.html = getResultsHtml(result);
}

function getResultsHtml(result) {
    const issuesHtml = result.issues.map((issue, index) => `
        <div class="issue-card ${issue.severity.toLowerCase()}">
            <div class="issue-header">
                <span class="issue-number">#${index + 1}</span>
                <span class="issue-title">${issue.issue}</span>
                <span class="line-number">Line ${issue.line}</span>
                <span class="severity-badge ${issue.severity.toLowerCase()}">${issue.severity}</span>
                <span class="category-badge">${issue.category}</span>
            </div>
            <div class="issue-description">
                <strong>Description:</strong> ${issue.description}
            </div>
            <div class="issue-suggestion">
                <strong>💡 Suggestion:</strong> ${issue.suggestion}
            </div>
        </div>
    `).join('');

    // Generate severity chart
    const severityStats = result.severity_stats || {};
    const categoryStats = result.category_stats || {};

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
                .issue-description, .issue-suggestion {
                    color: var(--vscode-foreground);
                    line-height: 1.5;
                    margin-bottom: 10px;
                }
                .no-issues {
                    text-align: center;
                    padding: 40px;
                    color: #4CAF50;
                }
                .no-issues h2 {
                    color: #4CAF50;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🤖 AI Code Analysis Results</h1>
                <span class="ai-badge">✨ AI POWERED</span>
                <p><strong>File:</strong> ${result.filename}</p>
                <p><strong>Language:</strong> ${result.language}</p>
                <p><strong>AI Model:</strong> Google Gemini Pro</p>
            </div>

            <div class="summary">
                <div class="summary-card">
                    <div class="summary-number">${result.total_issues}</div>
                    <div>Total Issues</div>
                </div>
                <div class="summary-card">
                    <div class="summary-number">${severityStats.High || 0}</div>
                    <div>High Priority</div>
                </div>
                <div class="summary-card">
                    <div class="summary-number">${severityStats.Medium || 0}</div>
                    <div>Medium Priority</div>
                </div>
                <div class="summary-card">
                    <div class="summary-number">${severityStats.Low || 0}</div>
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
                        <div class="stats-title">📋 Issues by Category</div>
                        ${Object.entries(categoryStats).map(([category, count]) => `
                            <div class="stat-item">
                                <span>${category}:</span>
                                <span><strong>${count}</strong></span>
                            </div>
                        `).join('')}
                    </div>
                </div>
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
        </body>
        </html>
    `;
}

function showBackendInstructions() {
    const panel = vscode.window.createWebviewPanel(
        'backendInstructions',
        'Backend Setup Instructions',
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
                <h1>🐍 Python Backend Setup</h1>
                <p>Follow these steps to start the code analyzer backend</p>
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
                <h3>Step 3: Install Python</h3>
                <p>Make sure Python 3.7+ is installed on your system</p>
                <div class="code-block">python --version</div>
            </div>

            <div class="step">
                <h3>Step 4: Install Dependencies</h3>
                <p>Install required Python packages:</p>
                <div class="code-block">pip install Flask Flask-CORS google-generativeai</div>
            </div>

            <div class="step">
                <h3>Step 5: Run the AI Backend</h3>
                <p>Start the AI-powered Python server:</p>
                <div class="code-block">python code_analyzer.py</div>
                <p>You should see: "🤖 Starting AI Code Analyzer API..."</p>
            </div>

            <div class="step">
                <h3>Step 6: Test AI Connection</h3>
                <p>Visit: <strong>http://localhost:5000/test-ai</strong> to verify AI is working</p>
            </div>
        </body>
        </html>
    `;
}

function deactivate() {
    console.log('👋 Code Health Analyzer deactivated');
}

// Simple Tree Data Provider
class CodeHealthTreeDataProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element) {
        return element;
    }

    getChildren(element) {
        if (!element) {
            return [
                new CodeHealthItem('🔍 Analyze Current File', 'Analyze the currently open file', vscode.TreeItemCollapsibleState.None, 'code-health.analyzeFile'),
                new CodeHealthItem('📁 Upload & Analyze File', 'Select and analyze any file', vscode.TreeItemCollapsibleState.None, 'code-health.uploadAndAnalyze'),
                new CodeHealthItem('ℹ️ Instructions', 'How to setup the backend', vscode.TreeItemCollapsibleState.Collapsed),
                new CodeHealthItem('⚙️ Settings', 'Extension settings', vscode.TreeItemCollapsibleState.None)
            ];
        } else if (element.label.includes('Instructions')) {
            return [
                new CodeHealthItem('1. Get Gemini API Key', 'From Google AI Studio', vscode.TreeItemCollapsibleState.None),
                new CodeHealthItem('2. Set GEMINI_API_KEY env variable', '', vscode.TreeItemCollapsibleState.None),
                new CodeHealthItem('3. Install: pip install Flask Flask-CORS google-generativeai', '', vscode.TreeItemCollapsibleState.None),
                new CodeHealthItem('4. Run: python code_analyzer.py', '', vscode.TreeItemCollapsibleState.None),
                new CodeHealthItem('5. Test at: localhost:5000/test-ai', '', vscode.TreeItemCollapsibleState.None)
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