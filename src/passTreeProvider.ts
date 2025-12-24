import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

type TreeElementType = 'root' | 'group' | 'file';
type PassCategory = 'GIMPLE Passes' | 'IPA Passes' | 'RTL Passes';

export class PassItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly type: TreeElementType,
        public readonly uri?: vscode.Uri,
        public readonly rootName?: string,
        public readonly passNumber?: number,
        public readonly descriptionText?: string
    ) {
        // 1. Determine Collapsible State
        let state = vscode.TreeItemCollapsibleState.None;

        if (type === 'root') {
            // Testcase folders (abc.c) start Collapsed (standard behavior)
            // or Expanded if you want them open by default. Let's keep them Collapsed until you click.
            state = vscode.TreeItemCollapsibleState.Collapsed;
        } else if (type === 'group') {
            // --- THE FIX ---
            // Categories (GIMPLE/IPA/RTL) now start COLLAPSED.
            // They will only show their files when you explicitly click them.
            state = vscode.TreeItemCollapsibleState.Collapsed; 
        }

        super(label, state);
        
        // 2. Configure Item Properties
        if (type === 'file') {
            this.resourceUri = uri;
            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [uri]
            };
            this.description = descriptionText;
            this.iconPath = vscode.ThemeIcon.File;
        } else if (type === 'root') {
            this.iconPath = new vscode.ThemeIcon('symbol-class'); 
            this.description = "Source File";
        } else {
            // Group Icons
            this.iconPath = new vscode.ThemeIcon('list-tree');
        }
    }
}

export class GccPassTreeProvider implements vscode.TreeDataProvider<PassItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<PassItem | undefined | null | void> = new vscode.EventEmitter<PassItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PassItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private currentDir: string | null = null;
    
    // Default: All categories are visible
    private visibleCategories = new Set<string>(['GIMPLE', 'IPA', 'RTL']);

    constructor() {
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                this.currentDir = path.dirname(editor.document.uri.fsPath);
                this.refresh();
            }
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    // --- FILTER DIALOG (ROBUST) ---
    public promptFilter(): Promise<void> {
        return new Promise((resolve) => {
            const quickPick = vscode.window.createQuickPick();
            quickPick.canSelectMany = true;
            quickPick.placeholder = "Select Pass Categories to Display";

            const items: vscode.QuickPickItem[] = [
                { label: 'GIMPLE', description: 'Show GIMPLE (.t) passes' },
                { label: 'IPA', description: 'Show IPA (.i) passes' },
                { label: 'RTL', description: 'Show RTL (.r) passes' }
            ];

            quickPick.items = items;
            quickPick.selectedItems = items.filter(item => this.visibleCategories.has(item.label));

            quickPick.onDidAccept(() => {
                const selection = quickPick.selectedItems;
                this.visibleCategories.clear();
                selection.forEach(item => this.visibleCategories.add(item.label));
                this.refresh();
                quickPick.hide();
                resolve();
            });

            quickPick.onDidHide(() => {
                quickPick.dispose();
                resolve();
            });

            quickPick.show();
        });
    }

    getTreeItem(element: PassItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PassItem): Promise<PassItem[]> {
        if (!this.currentDir && vscode.window.activeTextEditor) {
            this.currentDir = path.dirname(vscode.window.activeTextEditor.document.uri.fsPath);
        }
        if (!this.currentDir) return [];

        // 1. ROOT
        if (!element) {
            return this.getTestcaseRoots();
        }

        // 2. GROUPS
        if (element.type === 'root') {
            return this.getSmartCategories(element.label);
        }

        // 3. FILES
        if (element.type === 'group' && element.rootName) {
            return this.getPassFiles(element.rootName, element.label as PassCategory);
        }

        return [];
    }

    private async getSmartCategories(baseName: string): Promise<PassItem[]> {
        if (!this.currentDir) return [];
        const files = await fs.promises.readdir(this.currentDir);
        
        let hasGimple = false;
        let hasIpa = false;
        let hasRtl = false;
        const typeRegex = /^.+\.\d{3}([tri])\..+$/;

        for (const f of files) {
            if (!f.startsWith(baseName)) continue;
            const match = typeRegex.exec(f);
            if (match) {
                const type = match[1];
                if (type === 't') hasGimple = true;
                if (type === 'i') hasIpa = true;
                if (type === 'r') hasRtl = true;
            }
            if (hasGimple && hasIpa && hasRtl) break;
        }

        const items: PassItem[] = [];
        if (this.visibleCategories.has('GIMPLE') && hasGimple) {
            items.push(new PassItem('GIMPLE Passes', 'group', undefined, baseName));
        }
        if (this.visibleCategories.has('IPA') && hasIpa) {
            items.push(new PassItem('IPA Passes', 'group', undefined, baseName));
        }
        if (this.visibleCategories.has('RTL') && hasRtl) {
            items.push(new PassItem('RTL Passes', 'group', undefined, baseName));
        }
        return items;
    }

    private async getTestcaseRoots(): Promise<PassItem[]> {
        if (!this.currentDir) return [];
        try {
            const files = await fs.promises.readdir(this.currentDir);
            const baseNames = new Set<string>();
            const dumpRegex = /^(.+)\.(\d{3})([tri])\.(.+)$/;
            for (const f of files) {
                const match = dumpRegex.exec(f);
                if (match) baseNames.add(match[1]);
            }
            return Array.from(baseNames).sort().map(name => new PassItem(name, 'root'));
        } catch (e) {
            return [];
        }
    }

    private async getPassFiles(baseName: string, category: PassCategory): Promise<PassItem[]> {
        if (!this.currentDir) return [];
        const files = await fs.promises.readdir(this.currentDir);
        const passFiles: PassItem[] = [];

        let targetChar = '';
        if (category === 'GIMPLE Passes') targetChar = 't';
        else if (category === 'IPA Passes') targetChar = 'i';
        else if (category === 'RTL Passes') targetChar = 'r';

        const regex = /^(.+)\.(\d{3})([tri])\.(.+)$/;

        for (const f of files) {
            if (!f.startsWith(baseName)) continue;
            const match = regex.exec(f);
            if (match) {
                const [_, fBase, numStr, type, passName] = match;
                if (fBase === baseName && type === targetChar) {
                    passFiles.push(new PassItem(
                        passName,
                        'file',
                        vscode.Uri.file(path.join(this.currentDir, f)),
                        baseName,
                        parseInt(numStr, 10),
                        `Pass ${numStr}`
                    ));
                }
            }
        }
        return passFiles.sort((a, b) => (a.passNumber || 0) - (b.passNumber || 0));
    }
}