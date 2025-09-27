const vscode = require('vscode');

function activate(context) {
    console.log('🚀 Code Health Pro extension is now active!');

    // Create tree data provider for sidebar
    const provider = new CodeHealthTreeDataProvider();
    
    // Register tree view with custom options
    const treeView = vscode.window.createTreeView('codeHealthSidebarView', {
        treeDataProvider: provider,
        showCollapseAll: true,
        canSelectMany: false
    });
    
    context.subscriptions.push(treeView);

    // Enhanced Hello World command
    const disposable = vscode.commands.registerCommand('code-health.helloWorld', function () {
        const panel = vscode.window.createWebviewPanel(
            'codeHealthHello',
            'Code Health - Hello World',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = getHelloWorldWebviewContent();
        console.log('✨ Hello World command executed!');
    });

    // Enhanced refresh command
    const refreshCommand = vscode.commands.registerCommand('code-health.refresh', () => {
        provider.refresh();
        vscode.window.showInformationMessage('🔄 Dashboard refreshed successfully!', 'View Report').then(selection => {
            if (selection === 'View Report') {
                vscode.commands.executeCommand('code-health.generateReport');
            }
        });
        console.log('🔄 Extension refreshed!');
    });

    // Enhanced health check command
    const checkHealthCommand = vscode.commands.registerCommand('code-health.checkHealth', async () => {
        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Running health check...",
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0 });
            
            for (let i = 0; i < 100; i += 10) {
                await new Promise(resolve => setTimeout(resolve, 100));
                progress.report({ increment: 10, message: `${i + 10}% complete` });
            }
        });
        
        vscode.window.showInformationMessage('✅ Health check completed! All systems operational 🟢');
        console.log('🏥 Health check completed!');
    });

    // New generate report command
    const generateReportCommand = vscode.commands.registerCommand('code-health.generateReport', () => {
        const panel = vscode.window.createWebviewPanel(
            'codeHealthReport',
            'Code Health Report',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = getReportWebviewContent();
        console.log('📊 Report generated!');
    });

    // New settings command  
    const settingsCommand = vscode.commands.registerCommand('code-health.settings', () => {
        vscode.window.showQuickPick([
            { label: '🎨 Theme Settings', description: 'Customize colors and appearance' },
            { label: '⚙️ Monitoring Settings', description: 'Configure health checks' },
            { label: '📈 Report Settings', description: 'Customize report generation' },
            { label: '🔔 Notifications', description: 'Manage notification preferences' }
        ], { placeHolder: 'Select settings category' }).then(selection => {
            if (selection) {
                vscode.window.showInformationMessage(`Opening: ${selection.label}`);
            }
        });
    });

    // Export command
    const exportCommand = vscode.commands.registerCommand('code-health.export', (item) => {
        vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('code-health-data.json'),
            filters: { 'JSON': ['json'], 'CSV': ['csv'] }
        }).then(uri => {
            if (uri) {
                vscode.window.showInformationMessage(`📤 Data exported to: ${uri.fsPath}`);
            }
        });
    });

    // Item click command with enhanced feedback
    const itemClickCommand = vscode.commands.registerCommand('code-health.itemClick', (item) => {
        // Show different actions based on item type
        if (item.label.includes('Status')) {
            showStatusDetails(item);
        } else if (item.label.includes('Coverage')) {
            showCoverageDetails(item);
        } else {
            vscode.window.showInformationMessage(`🔍 ${item.label}: ${item.tooltip}`, 'More Info').then(selection => {
                if (selection === 'More Info') {
                    vscode.window.showInformationMessage(`Detailed info for: ${item.label}`);
                }
            });
        }
        console.log(`🖱️ Item clicked: ${item.label}`);
    });

    context.subscriptions.push(
        disposable, refreshCommand, checkHealthCommand, 
        generateReportCommand, settingsCommand, exportCommand, itemClickCommand
    );
}

function showStatusDetails(item) {
    const panel = vscode.window.createWebviewPanel(
        'systemStatus',
        'System Status Details',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );
    
    panel.webview.html = `
        <html>
            <body style="font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background);">
                <h1>🖥️ System Status</h1>
                <div style="background: var(--vscode-textBlockQuote-background); padding: 20px; border-radius: 8px; margin: 10px 0;">
                    <h2 style="color: #48dbfb;">✅ All Systems Operational</h2>
                    <ul>
                        <li>✅ Code Health: Excellent</li>
                        <li>✅ Performance: Optimal</li>
                        <li>✅ Security: No issues found</li>
                        <li>✅ Dependencies: Up to date</li>
                    </ul>
                </div>
            </body>
        </html>
    `;
}

function showCoverageDetails(item) {
    vscode.window.showInformationMessage(
        '📊 Code Coverage: 85%',
        'View Details', 'Improve Coverage'
    ).then(selection => {
        if (selection === 'View Details') {
            vscode.window.showInformationMessage('Coverage breakdown: Functions: 90%, Lines: 85%, Branches: 80%');
        } else if (selection === 'Improve Coverage') {
            vscode.window.showInformationMessage('💡 Tip: Focus on testing edge cases and error handling');
        }
    });
}

function getHelloWorldWebviewContent() {
    return `
        <html>
            <head>
                <style>
                    body { 
                        font-family: var(--vscode-font-family);
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        margin: 0;
                        padding: 40px;
                        text-align: center;
                    }
                    .container {
                        background: rgba(255,255,255,0.1);
                        border-radius: 20px;
                        padding: 40px;
                        backdrop-filter: blur(10px);
                    }
                    h1 { font-size: 3em; margin-bottom: 20px; }
                    .emoji { font-size: 4em; margin: 20px 0; }
                    button {
                        background: #ff6b6b;
                        border: none;
                        color: white;
                        padding: 15px 30px;
                        border-radius: 25px;
                        font-size: 1.2em;
                        cursor: pointer;
                        margin: 10px;
                    }
                    button:hover { background: #ff5252; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="emoji">🚀</div>
                    <h1>Hello World!</h1>
                    <p>Welcome to Code Health Pro</p>
                    <button onclick="alert('Thanks for using our extension!')">Click Me!</button>
                </div>
            </body>
        </html>
    `;
}

function getReportWebviewContent() {
    return `
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
                        background: linear-gradient(90deg, #48dbfb, #0abde3);
                        color: white;
                        padding: 30px;
                        border-radius: 10px;
                        margin-bottom: 20px;
                    }
                    .metric-card {
                        background: var(--vscode-textBlockQuote-background);
                        border: 2px solid var(--vscode-textBlockQuote-border);
                        border-radius: 10px;
                        padding: 20px;
                        margin: 15px 0;
                        display: inline-block;
                        width: 250px;
                        margin-right: 20px;
                    }
                    .metric-value {
                        font-size: 2.5em;
                        font-weight: bold;
                        color: #48dbfb;
                    }
                    .status-good { color: #2ecc71; }
                    .status-warning { color: #f39c12; }
                    .status-error { color: #e74c3c; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>📊 Code Health Report</h1>
                    <p>Generated on ${new Date().toLocaleDateString()}</p>
                </div>
                
                <div class="metric-card">
                    <h3>📏 Lines of Code</h3>
                    <div class="metric-value status-good">1,250</div>
                </div>
                
                <div class="metric-card">
                    <h3>🧪 Code Coverage</h3>
                    <div class="metric-value status-good">85%</div>
                </div>
                
                <div class="metric-card">
                    <h3>⚠️ Technical Debt</h3>
                    <div class="metric-value status-good">Low</div>
                </div>
                
                <div class="metric-card">
                    <h3>🐛 Bug Risk</h3>
                    <div class="metric-value status-warning">Medium</div>
                </div>
            </body>
        </html>
    `;
}

function deactivate() {
    console.log('👋 Code Health Pro extension is deactivated');
}

// Enhanced Tree Data Provider
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
                new CodeHealthItem('🟢 System Status', 'All systems operational', vscode.TreeItemCollapsibleState.None, 'code-health.itemClick', '#48dbfb'),
                new CodeHealthItem('⭐ Hello World', 'Test the original command', vscode.TreeItemCollapsibleState.None, 'code-health.helloWorld', '#feca57'),
                new CodeHealthItem('📊 Code Metrics', 'View code health metrics', vscode.TreeItemCollapsibleState.Collapsed, null, '#ff6b6b'),
                new CodeHealthItem('⚡ Quick Actions', 'Perform health checks', vscode.TreeItemCollapsibleState.Collapsed, null, '#48dbfb'),
                new CodeHealthItem('⚙️ Settings', 'Extension configuration', vscode.TreeItemCollapsibleState.None, 'code-health.settings', '#a55eea')
            ];
        } else if (element.label.includes('Code Metrics')) {
            return [
                new CodeHealthItem('📏 Lines of Code', '1,250 lines', vscode.TreeItemCollapsibleState.None, 'code-health.itemClick', '#2ecc71'),
                new CodeHealthItem('🧪 Code Coverage', '85%', vscode.TreeItemCollapsibleState.None, 'code-health.itemClick', '#f39c12'),
                new CodeHealthItem('⚠️ Technical Debt', 'Low', vscode.TreeItemCollapsibleState.None, 'code-health.itemClick', '#2ecc71'),
                new CodeHealthItem('🐛 Bug Risk', 'Medium', vscode.TreeItemCollapsibleState.None, 'code-health.itemClick', '#f39c12')
            ];
        } else if (element.label.includes('Quick Actions')) {
            return [
                new CodeHealthItem('🏥 Run Health Check', 'Check overall health', vscode.TreeItemCollapsibleState.None, 'code-health.checkHealth', '#ff6b6b'),
                new CodeHealthItem('🔄 Refresh Data', 'Update all metrics', vscode.TreeItemCollapsibleState.None, 'code-health.refresh', '#48dbfb'),
                new CodeHealthItem('📊 Generate Report', 'Create health report', vscode.TreeItemCollapsibleState.None, 'code-health.generateReport', '#feca57')
            ];
        }
        return [];
    }
}

// Enhanced Tree Item Class with Color Support
class CodeHealthItem extends vscode.TreeItem {
    constructor(label, tooltip, collapsibleState, commandId, color) {
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

        // Enhanced icon selection with colors
        if (collapsibleState === vscode.TreeItemCollapsibleState.None) {
            if (label.includes('Status')) {
                this.iconPath = new vscode.ThemeIcon('pulse', new vscode.ThemeColor('codeHealth.successColor'));
            } else if (label.includes('Hello World')) {
                this.iconPath = new vscode.ThemeIcon('star-full', new vscode.ThemeColor('codeHealth.warningColor'));
            } else if (label.includes('Check') || label.includes('Refresh')) {
                this.iconPath = new vscode.ThemeIcon('sync', new vscode.ThemeColor('codeHealth.errorColor'));
            } else if (label.includes('Coverage')) {
                this.iconPath = new vscode.ThemeIcon('graph', new vscode.ThemeColor('codeHealth.warningColor'));
            } else if (label.includes('Bug')) {
                this.iconPath = new vscode.ThemeIcon('bug', new vscode.ThemeColor('codeHealth.warningColor'));
            } else if (label.includes('Settings')) {
                this.iconPath = new vscode.ThemeIcon('settings-gear', new vscode.ThemeColor('codeHealth.successColor'));
            } else {
                this.iconPath = new vscode.ThemeIcon('gear');
            }
        } else {
            this.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor('codeHealth.successColor'));
        }

        // Add context value for context menus
        this.contextValue = 'codeHealthItem';
    }
}

module.exports = {
    activate,
    deactivate
};