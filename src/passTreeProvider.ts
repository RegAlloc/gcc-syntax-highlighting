import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

type TreeElementType = 'root' | 'group' | 'subgroup' | 'file';
type PassCategory = 'GIMPLE Passes' | 'IPA Passes' | 'RTL Passes' | 'DOT Files' | 'GIMPLE Graphs' | 'IPA Graphs' | 'RTL Graphs';

export class PassItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly type: TreeElementType,
        public readonly uri?: vscode.Uri,
        public readonly rootName?: string,
        public readonly passNumber?: number,
        public readonly descriptionText?: string
    ) {
        let state = vscode.TreeItemCollapsibleState.None;

        if (type === 'root') {
            state = vscode.TreeItemCollapsibleState.Collapsed;
        } else if (type === 'group' || type === 'subgroup') {
            // Groups start collapsed to keep UI clean
            state = vscode.TreeItemCollapsibleState.Collapsed; 
        }

        super(label, state);
        
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
        } else if (label === 'DOT Files') {
            this.iconPath = new vscode.ThemeIcon('graph');
        } else {
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

    // --- FILTER DIALOG ---
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

        // 2. MAIN GROUPS
        if (element.type === 'root') {
            return this.getSmartCategories(element.label);
        }

        // 3. DOT SUBGROUPS (Smart & Filtered)
        if (element.label === 'DOT Files' && element.rootName) {
            // FIX: Call the smart detector for sub-groups instead of returning static list
            return this.getDotSubgroups(element.rootName);
        }

        // 4. FILES (Standard Passes)
        if (element.type === 'group' && element.rootName) {
            return this.getPassFiles(element.rootName, element.label as any, false);
        }

        // 5. GRAPH FILES (Inside Subgroups)
        if (element.type === 'subgroup' && element.rootName) {
            let category: string = '';
            if (element.label === 'GIMPLE') category = 'GIMPLE Passes';
            if (element.label === 'IPA') category = 'IPA Passes';
            if (element.label === 'RTL') category = 'RTL Passes';
            
            return this.getPassFiles(element.rootName, category, true);
        }

        return [];
    }

    private async getSmartCategories(baseName: string): Promise<PassItem[]> {
        if (!this.currentDir) return [];
        const files = await fs.promises.readdir(this.currentDir);
        
        let hasGimple = false, hasIpa = false, hasRtl = false;
        // Flags to track if we have ANY valid dot files visible under current filter
        let showDotFolder = false;
        let hasGimpleDot = false, hasIpaDot = false, hasRtlDot = false;

        const typeRegex = /^.+\.\d{3}([tri])\..+$/;

        for (const f of files) {
            if (!f.startsWith(baseName)) continue;
            
            const match = typeRegex.exec(f);
            if (match) {
                const type = match[1];
                const isDot = f.endsWith('.dot');

                if (isDot) {
                    if (type === 't') hasGimpleDot = true;
                    if (type === 'i') hasIpaDot = true;
                    if (type === 'r') hasRtlDot = true;
                } else {
                    if (type === 't') hasGimple = true;
                    if (type === 'i') hasIpa = true;
                    if (type === 'r') hasRtl = true;
                }
            }
        }

        const items: PassItem[] = [];
        
        // Standard Dumps
        if (this.visibleCategories.has('GIMPLE') && hasGimple) {
            items.push(new PassItem('GIMPLE Passes', 'group', undefined, baseName));
        }
        if (this.visibleCategories.has('IPA') && hasIpa) {
            items.push(new PassItem('IPA Passes', 'group', undefined, baseName));
        }
        if (this.visibleCategories.has('RTL') && hasRtl) {
            items.push(new PassItem('RTL Passes', 'group', undefined, baseName));
        }

        // Check if we should show "DOT Files" parent folder
        // It should show ONLY if there is at least one Dot category that is BOTH existing AND visible
        if ((hasGimpleDot && this.visibleCategories.has('GIMPLE')) ||
            (hasIpaDot && this.visibleCategories.has('IPA')) ||
            (hasRtlDot && this.visibleCategories.has('RTL'))) {
            items.push(new PassItem('DOT Files', 'group', undefined, baseName));
        }

        return items;
    }

    // --- NEW: Detect and Filter DOT Subgroups ---
    private async getDotSubgroups(baseName: string): Promise<PassItem[]> {
        if (!this.currentDir) return [];
        const files = await fs.promises.readdir(this.currentDir);

        let hasGimpleDot = false;
        let hasIpaDot = false;
        let hasRtlDot = false;

        // Regex for DOT files: name.123[tri].pass.dot
        const dotRegex = /^.+\.\d{3}([tri])\..+\.dot$/;

        for (const f of files) {
            if (!f.startsWith(baseName)) continue;
            
            const match = dotRegex.exec(f);
            if (match) {
                const type = match[1];
                if (type === 't') hasGimpleDot = true;
                if (type === 'i') hasIpaDot = true;
                if (type === 'r') hasRtlDot = true;
            }
        }

        const items: PassItem[] = [];

        // Only add the subgroup if:
        // 1. Files actually exist (hasXDot)
        // 2. User hasn't filtered it out (visibleCategories.has)
        
        if (hasGimpleDot && this.visibleCategories.has('GIMPLE')) {
            items.push(new PassItem('GIMPLE', 'subgroup', undefined, baseName));
        }
        if (hasIpaDot && this.visibleCategories.has('IPA')) {
            items.push(new PassItem('IPA', 'subgroup', undefined, baseName));
        }
        if (hasRtlDot && this.visibleCategories.has('RTL')) {
            items.push(new PassItem('RTL', 'subgroup', undefined, baseName));
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

    private async getPassFiles(baseName: string, category: string, isDot: boolean): Promise<PassItem[]> {
        if (!this.currentDir) return [];
        const files = await fs.promises.readdir(this.currentDir);
        const passFiles: PassItem[] = [];

        let targetChar = '';
        if (category.includes('GIMPLE')) targetChar = 't';
        else if (category.includes('IPA')) targetChar = 'i';
        else if (category.includes('RTL')) targetChar = 'r';

        const regex = /^(.+)\.(\d{3})([tri])\.(.+)$/;

        for (const f of files) {
            if (!f.startsWith(baseName)) continue;

            if (isDot) {
                if (!f.endsWith('.dot')) continue;
            } else {
                if (f.endsWith('.dot')) continue;
            }

            const match = regex.exec(f);
            if (match) {
                const [_, fBase, numStr, type, passName] = match;
                
                if (fBase === baseName && type === targetChar) {
                    // Remove .dot suffix from label for cleaner display
                    let label = passName;
                    if (isDot && label.endsWith('.dot')) {
                        label = label.substring(0, label.length - 4); 
                    }

                    passFiles.push(new PassItem(
                        isDot ? label : passName,
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