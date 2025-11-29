# Code Health Analyzer - AI-Powered Code Review Extension

🤖 A comprehensive VS Code extension that integrates with the AI Code Reviewer backend to provide real-time code analysis, security scanning, and automated fixes using Google Gemini AI.

## ✨ Features

### Core Analysis Features
- **🔍 Comprehensive Code Analysis** - Multi-agent AI analysis including:
  - Quality assessment with scoring
  - Security vulnerability detection
  - Code smell identification
  - Static analysis integration
  - AST (Abstract Syntax Tree) enhanced analysis

- **🔗 Hybrid Deduplication** - Advanced multi-stage deduplication:
  - Exact match detection
  - Structural AST comparison
  - Tool pattern matching
  - AI semantic analysis
  - Detailed statistics and reporting

- **🔧 Automated Code Fixing** - AI-powered issue resolution:
  - Fix all issues at once
  - Fix specific issues selectively
  - Preview changes before applying
  - Confidence-based suggestions

### Editor Integration
- **📍 Inline Diagnostics** - Issues shown directly in editor:
  - Color-coded severity levels (Critical, High, Medium, Low)
  - Hover for detailed descriptions
  - Quick fix actions
  - Jump to issue navigation

- **💡 Code Actions** - Quick fixes available via lightbulb:
  - Fix individual issues
  - View issue details
  - Apply suggestions instantly

- **📊 Status Bar Integration** - Real-time backend status:
  - Online/offline indicator
  - Auto-analyze status
  - Click for detailed health check

### Advanced Features
- **🔄 Auto-Analyze on Save** - Automatic analysis when files are saved
- **📈 Analysis History** - Track analysis over time (coming soon)
- **📤 Export Results** - Export to JSON, Markdown, or Text formats
- **🗂️ Cache Management** - View stats and clear backend cache
- **⚙️ Flexible Configuration** - Customize analysis behavior
- **🌳 Enhanced Tree View** - Visual breakdown of analysis results

## 🚀 Installation

### Prerequisites
1. **VS Code** version 1.104.0 or higher
2. **Python 3.8+** for the backend
3. **Google Gemini API Key** (free from [Google AI Studio](https://makersuite.google.com/app/apikey))

### Backend Setup

1. **Get Gemini API Key**
   ```bash
   # Visit: https://makersuite.google.com/app/apikey
   # Create a new API key
   ```

2. **Set Environment Variable**
   ```bash
   # Linux/Mac
   export GEMINI_API_KEY="your_api_key_here"
   
   # Windows (Command Prompt)
   set GEMINI_API_KEY=your_api_key_here
   
   # Windows (PowerShell)
   $env:GEMINI_API_KEY="your_api_key_here"
   ```

3. **Install Python Dependencies**
   ```bash
   cd ai_code_review_system
   pip install -r requirements.txt
   ```

4. **Start Backend Server**
   ```bash
   python start_api.py
   ```
   
   The backend will start at `http://localhost:8000`

5. **Verify Backend**
   - Health check: http://localhost:8000/health
   - API docs: http://localhost:8000/docs

### Extension Installation

1. **From VSIX** (if packaged):
   ```bash
   code --install-extension code-health-analyzer-1.0.0.vsix
   ```

2. **From Source**:
   ```bash
   cd code-health
   npm install -g vsce
   vsce package
   code --install-extension code-health-analyzer-1.0.0.vsix
   ```

## 📖 Usage

### Quick Start

1. **Open a code file** in VS Code
2. **Right-click** in the editor → Select "Analyze Current File"
3. **View results** in the webview panel
4. **Fix issues** by clicking "Fix Issues" button

### Commands

Access via Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- `Code Health: Analyze Current File` - Analyze the active file
- `Code Health: Upload & Analyze File` - Select and analyze any file
- `Code Health: Fix Code Issues` - Auto-fix detected issues
- `Code Health: Toggle Auto-Analyze on Save` - Enable/disable auto-analysis
- `Code Health: Analyze with Options` - Choose analysis type
- `Code Health: Show Backend Status` - Check backend health
- `Code Health: View Cache Statistics` - View backend cache stats
- `Code Health: Clear Backend Cache` - Clear cached analyses
- `Code Health: Export Analysis Results` - Export to file
- `Code Health: Refresh` - Refresh extension state

### Sidebar View

The **Code Health Analyzer** sidebar shows:
- Quick action buttons
- Analysis results breakdown
- Severity counts
- AST enhancement stats
- Advanced options
- Setup instructions

### Inline Diagnostics

Issues appear directly in your code:
- **Red squiggles** - Critical/High severity
- **Yellow squiggles** - Medium severity
- **Blue squiggles** - Low severity
- **Hover** to see description and suggestion
- **Click lightbulb** for quick fixes

## ⚙️ Configuration

Configure via VS Code Settings (`Ctrl+,` / `Cmd+,`):

```json
{
  // Backend API URL
  "codeHealth.backendUrl": "http://localhost:8000",
  
  // Auto-analyze on save
  "codeHealth.autoAnalyzeOnSave": false,
  
  // Enable hybrid deduplication
  "codeHealth.enableHybridDeduplication": true,
  
  // Show deduplication statistics
  "codeHealth.showDeduplicationStats": true,
  
  // Show inline diagnostics
  "codeHealth.showInlineDiagnostics": true,
  
  // Maximum inline issues
  "codeHealth.maxIssuesInline": 100
}
```

### Configuration Options

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `backendUrl` | string | `http://localhost:8000` | Backend API URL |
| `autoAnalyzeOnSave` | boolean | `false` | Auto-analyze when saving files |
| `enableHybridDeduplication` | boolean | `true` | Use advanced deduplication |
| `showDeduplicationStats` | boolean | `true` | Display deduplication metrics |
| `showInlineDiagnostics` | boolean | `true` | Show issues in editor |
| `maxIssuesInline` | number | `100` | Max inline diagnostic count |

## 🎯 Analysis Types

### Standard Analysis
Default comprehensive analysis with all features enabled.

### With Deduplication Stats
Includes detailed statistics about issue deduplication:
- Original vs. final issue count
- Reduction percentage
- Merge operations
- Stage-by-stage breakdown

### Without Deduplication
Basic analysis without deduplication (faster, may show duplicate issues).

## 📊 Understanding Results

### Code Quality Score
- **90-100**: Excellent code quality
- **75-89**: Good code quality
- **60-74**: Fair code quality
- **Below 60**: Needs improvement

### Issue Severity Levels
- **🔴 Critical**: Security vulnerabilities, critical bugs
- **🟠 High**: Major issues affecting functionality
- **🟡 Medium**: Code quality and maintainability issues
- **🟢 Low**: Minor improvements and suggestions

### Analysis Breakdown
- **AI Analysis**: Issues found by AI agents
- **Static Analysis**: Issues from static analyzers
- **Hybrid Deduplicated**: Merged duplicate issues
- **AST Analysis**: Issues enhanced with AST context

## 🔧 Troubleshooting

### Backend Not Responding
1. Check if backend is running: `http://localhost:8000/health`
2. Verify GEMINI_API_KEY is set
3. Check backend logs for errors
4. Restart backend server

### No Issues Detected
1. Ensure file has actual code (not empty)
2. Check supported languages
3. Try "Analyze with Options" → "Without Deduplication"

### Diagnostics Not Showing
1. Check `codeHealth.showInlineDiagnostics` setting
2. Verify file path is correct
3. Try closing and reopening the file

### Performance Issues
1. Reduce `maxIssuesInline` setting
2. Disable auto-analyze on save
3. Clear backend cache

## 🌐 Supported Languages

- Python
- JavaScript
- TypeScript
- Java
- C/C++
- PHP
- Ruby
- Go
- And more...

## 📝 Release Notes

### 1.0.0

Initial release with comprehensive features:
- Multi-agent AI code analysis
- Hybrid deduplication system
- AST-enhanced analysis
- Inline diagnostics
- Code actions and quick fixes
- Auto-analyze on save
- Export functionality
- Cache management
- Status bar integration
- Enhanced tree view

## 📧 Support

For issues and questions:
- Open an issue on GitHub
- Check the troubleshooting section
- Review backend logs

## 🎉 Acknowledgments

- Google Gemini AI for powering the analysis
- VS Code team for the excellent extension API
- Open source community for tools and libraries

---

**Made with ❤️ for better code quality**
