import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface PassInfo {
    name: string;
    fullName: string;
    number: number;
    type: 'tree' | 'rtl';
    path: string;
    cleanContent: Set<string>; // The meaningful lines (ignoring logs)
    churnColor: string;
    churnPercent: number;
}

export class GccPipelineProvider {
    public static readonly viewType = 'gcc.pipelineView';

    public async show(editor: vscode.TextEditor, extensionUri: vscode.Uri) {
        const doc = editor.document;
        const currentUri = doc.uri;
        const currentDir = path.dirname(currentUri.fsPath);
        const sourceFileName = path.basename(currentUri.fsPath);

        // 1. Find and Analyze Dumps
        const dumps = await this.analyzeDumps(currentDir, sourceFileName);

        if (dumps.length === 0) {
            const item = await vscode.window.showErrorMessage(
                `No GCC dumps found for '${sourceFileName}'.`,
                "How to Fix?", "Close"
            );
            if (item === "How to Fix?") {
                vscode.window.showInformationMessage(
                    `Compile with:  gcc -fdump-tree-all -fdump-rtl-all ${sourceFileName}`
                );
            }
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            GccPipelineProvider.viewType,
            `Pipeline: ${sourceFileName}`,
            vscode.ViewColumn.Two,
            { enableScripts: true }
        );

        panel.webview.html = this.getHtml(dumps, sourceFileName);

        panel.webview.onDidReceiveMessage(message => {
            if (message.command === 'openPass') {
                const uri = vscode.Uri.file(message.path);
                vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.One, preview: true });
            }
        });
    }

    private async analyzeDumps(dir: string, sourceName: string): Promise<PassInfo[]> {
        let files: string[] = [];
        try {
            files = await fs.promises.readdir(dir);
        } catch (e) {
            return [];
        }

        const regex = new RegExp(`^${escapeRegExp(sourceName)}\\.(\\d+)([tr])\\.([a-zA-Z0-9_]+)$`);
        let validFiles: PassInfo[] = [];

        // 1. Parse Files and Content
        for (const f of files) {
            const match = regex.exec(f);
            if (match) {
                const fullPath = path.join(dir, f);
                const type = match[2] === 't' ? 'tree' : 'rtl';
                
                // --- SMART READ ---
                // We read the file to filter out logs immediately.
                // This is heavier than fs.stat, but essential for accuracy.
                const cleanLines = await this.getCleanLines(fullPath, type);

                validFiles.push({
                    name: match[3],
                    fullName: f,
                    number: parseInt(match[1]),
                    type: type,
                    path: fullPath,
                    cleanContent: cleanLines,
                    churnColor: '#95a5a6', // Default
                    churnPercent: 0
                });
            }
        }

        // 2. Sort Chronologically (Respect the Pass Number)
        validFiles = validFiles.sort((a, b) => a.number - b.number);

        // 3. Calculate Churn based on Clean Content
        return this.calculateSmartChurn(validFiles);
    }

    // --- THE FILTER LOGIC ---
    private async getCleanLines(filePath: string, type: 'tree' | 'rtl'): Promise<Set<string>> {
        try {
            const data = await fs.promises.readFile(filePath, 'utf-8');
            const lines = data.split('\n');
            const meaningfulSet = new Set<string>();

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                if (type === 'rtl') {
                    // RTL HEURISTIC:
                    // Valid RTL instructions ALWAYS start with '('.
                    // Logs like "Splitting mode..." do not.
                    if (trimmed.startsWith('(')) {
                        meaningfulSet.add(trimmed);
                    }
                } else {
                    // TREE HEURISTIC:
                    // GIMPLE is C-like. We exclude lines starting with ";;" (dump comments)
                    // or lines that look like pure noise.
                    if (!trimmed.startsWith(';;') && !trimmed.startsWith('//')) {
                        meaningfulSet.add(trimmed);
                    }
                }
            }
            return meaningfulSet;
        } catch (e) {
            return new Set();
        }
    }

    private calculateSmartChurn(passes: PassInfo[]): PassInfo[] {
        if (passes.length > 0) {
            passes[0].churnColor = '#2ecc71';
            passes[0].churnPercent = 100;
        }

        for (let i = 1; i < passes.length; i++) {
            const prev = passes[i - 1];
            const curr = passes[i];

            // --- SET DIFFERENCE CALCULATION ---
            // Churn = (Unique lines in Prev) + (Unique lines in Curr)
            // If an instruction changed, it appears as 1 remove + 1 add.
            
            let diffCount = 0;
            
            // 1. Count items in Curr not in Prev (Added/Modified)
            for (const line of curr.cleanContent) {
                if (!prev.cleanContent.has(line)) diffCount++;
            }
            
            // 2. Count items in Prev not in Curr (Removed/Modified)
            // (Optional optimization: Just counting adds might be enough for a heatmap, 
            // but strict diff is better)
            for (const line of prev.cleanContent) {
                if (!curr.cleanContent.has(line)) diffCount++;
            }

            const totalLines = Math.max(prev.cleanContent.size, 1);
            const percent = (diffCount / totalLines) * 100;

            curr.churnPercent = percent;

            // Strict Color Grading
            if (percent === 0) {
                curr.churnColor = '#7f8c8d'; // Gray (Literal Zero Change)
            } else if (percent < 5) {
                curr.churnColor = '#2ecc71'; // Green (Tiny tweaks)
            } else if (percent < 20) {
                curr.churnColor = '#f1c40f'; // Yellow (Moderate)
            } else if (percent < 40) {
                curr.churnColor = '#ff9966'; // Orange (Significant)
            } else {
                curr.churnColor = '#cc3300'; // Red (Major Transformation)
            }
        }
        return passes;
    }

    private getHtml(passes: PassInfo[], title: string) {
        // Logic to split Tree vs RTL visually
        let htmlContent = '';
        let lastType = '';

        passes.forEach((p, index) => {
            if (p.type !== lastType) {
                if (lastType !== '') {
                    htmlContent += `<div class="separator"><div class="line"></div><span>${p.type.toUpperCase()} PIPELINE STARTS</span><div class="line"></div></div>`;
                } else {
                    htmlContent += `<div class="separator start"><span>${p.type.toUpperCase()} PIPELINE</span></div>`;
                }
                lastType = p.type;
            }

            htmlContent += `
                <div class="pass-card" onclick="openPass('${p.path.replace(/\\/g, '\\\\')}')" title="Churn: ${p.churnPercent.toFixed(1)}%">
                    <span class="pass-type">${p.type}</span>
                    <span class="pass-name">${p.name}</span>
                    <span class="pass-id">#${p.number}</span>
                    <div class="status-bar" style="background-color: ${p.churnColor};"></div>
                </div>
                ${(index < passes.length - 1 && passes[index+1].type === p.type) ? '<div class="arrow">➜</div>' : ''}
            `;
        });

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <style>
                    body { 
                        font-family: 'Segoe UI', sans-serif; 
                        padding: 20px; 
                        background-color: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                        padding-top: 60px;
                    }
                    /* ... (Same CSS as previous) ... */
                    .legend { position: fixed; top: 20px; right: 20px; background: #fff; color: #000; padding: 8px 12px; border-radius: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); font-size: 12px; z-index: 1000; display: flex; gap: 15px; font-weight: bold; }
                    .legend-item { display: flex; align-items: center; gap: 6px; }
                    .dot { width: 10px; height: 10px; border-radius: 2px; }
                    .pipeline { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
                    .separator { width: 100%; display: flex; align-items: center; margin: 30px 0 15px 0; color: #888; font-weight: bold; font-size: 12px; letter-spacing: 1px; }
                    .separator.start { margin-top: 0; }
                    .separator .line { flex: 1; height: 1px; background: #444; margin: 0 15px; }
                    .pass-card { width: 130px; height: 80px; background: #252526; border: 1px solid #333; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; position: relative; transition: all 0.2s; flex-shrink: 0; }
                    .pass-card:hover { border-color: #fff; transform: translateY(-2px); }
                    .pass-type { font-size: 9px; color: #888; text-transform: uppercase; }
                    .pass-name { font-weight: bold; font-size: 13px; margin: 4px 0; text-align: center; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 90%; }
                    .pass-id { font-size: 10px; opacity: 0.6; }
                    .status-bar { width: 100%; height: 5px; position: absolute; bottom: 0; border-radius: 0 0 5px 5px; }
                    .arrow { color: #555; font-size: 16px; }
                </style>
            </head>
            <body>
                <div class="legend">
                    <div class="legend-item"><div class="dot" style="background:#7f8c8d"></div> 0%</div>
                    <div class="legend-item"><div class="dot" style="background:#2ecc71"></div> < 5%</div>
                    <div class="legend-item"><div class="dot" style="background:#f1c40f"></div> 5-20%</div>
                    <div class="legend-item"><div class="dot" style="background:#ff9966"></div> 20-40%</div>
                    <div class="legend-item"><div class="dot" style="background:#cc3300"></div> > 40%</div>
                </div>
                <h2>Optimizer Pipeline: ${title}</h2>
                <div class="pipeline">
                    ${htmlContent}
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    function openPass(path) { vscode.postMessage({ command: 'openPass', path: path }); }
                </script>
            </body>
            </html>
        `;
    }
}

function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}