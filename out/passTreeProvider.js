"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GccPassTreeProvider = exports.PassItem = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class PassItem extends vscode.TreeItem {
    label;
    type;
    uri;
    rootName;
    passNumber;
    descriptionText;
    constructor(label, type, uri, rootName, passNumber, descriptionText) {
        // 1. Determine Collapsible State
        let state = vscode.TreeItemCollapsibleState.None;
        if (type === 'root') {
            // Testcase folders (abc.c) start Collapsed (standard behavior)
            // or Expanded if you want them open by default. Let's keep them Collapsed until you click.
            state = vscode.TreeItemCollapsibleState.Collapsed;
        }
        else if (type === 'group') {
            // --- THE FIX ---
            // Categories (GIMPLE/IPA/RTL) now start COLLAPSED.
            // They will only show their files when you explicitly click them.
            state = vscode.TreeItemCollapsibleState.Collapsed;
        }
        super(label, state);
        this.label = label;
        this.type = type;
        this.uri = uri;
        this.rootName = rootName;
        this.passNumber = passNumber;
        this.descriptionText = descriptionText;
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
        }
        else if (type === 'root') {
            this.iconPath = new vscode.ThemeIcon('symbol-class');
            this.description = "Source File";
        }
        else {
            // Group Icons
            this.iconPath = new vscode.ThemeIcon('list-tree');
        }
    }
}
exports.PassItem = PassItem;
class GccPassTreeProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    currentDir = null;
    // Default: All categories are visible
    visibleCategories = new Set(['GIMPLE', 'IPA', 'RTL']);
    constructor() {
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                this.currentDir = path.dirname(editor.document.uri.fsPath);
                this.refresh();
            }
        });
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    // --- FILTER DIALOG (ROBUST) ---
    promptFilter() {
        return new Promise((resolve) => {
            const quickPick = vscode.window.createQuickPick();
            quickPick.canSelectMany = true;
            quickPick.placeholder = "Select Pass Categories to Display";
            const items = [
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
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (!this.currentDir && vscode.window.activeTextEditor) {
            this.currentDir = path.dirname(vscode.window.activeTextEditor.document.uri.fsPath);
        }
        if (!this.currentDir)
            return [];
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
            return this.getPassFiles(element.rootName, element.label);
        }
        return [];
    }
    async getSmartCategories(baseName) {
        if (!this.currentDir)
            return [];
        const files = await fs.promises.readdir(this.currentDir);
        let hasGimple = false;
        let hasIpa = false;
        let hasRtl = false;
        const typeRegex = /^.+\.\d{3}([tri])\..+$/;
        for (const f of files) {
            if (!f.startsWith(baseName))
                continue;
            const match = typeRegex.exec(f);
            if (match) {
                const type = match[1];
                if (type === 't')
                    hasGimple = true;
                if (type === 'i')
                    hasIpa = true;
                if (type === 'r')
                    hasRtl = true;
            }
            if (hasGimple && hasIpa && hasRtl)
                break;
        }
        const items = [];
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
    async getTestcaseRoots() {
        if (!this.currentDir)
            return [];
        try {
            const files = await fs.promises.readdir(this.currentDir);
            const baseNames = new Set();
            const dumpRegex = /^(.+)\.(\d{3})([tri])\.(.+)$/;
            for (const f of files) {
                const match = dumpRegex.exec(f);
                if (match)
                    baseNames.add(match[1]);
            }
            return Array.from(baseNames).sort().map(name => new PassItem(name, 'root'));
        }
        catch (e) {
            return [];
        }
    }
    async getPassFiles(baseName, category) {
        if (!this.currentDir)
            return [];
        const files = await fs.promises.readdir(this.currentDir);
        const passFiles = [];
        let targetChar = '';
        if (category === 'GIMPLE Passes')
            targetChar = 't';
        else if (category === 'IPA Passes')
            targetChar = 'i';
        else if (category === 'RTL Passes')
            targetChar = 'r';
        const regex = /^(.+)\.(\d{3})([tri])\.(.+)$/;
        for (const f of files) {
            if (!f.startsWith(baseName))
                continue;
            const match = regex.exec(f);
            if (match) {
                const [_, fBase, numStr, type, passName] = match;
                if (fBase === baseName && type === targetChar) {
                    passFiles.push(new PassItem(passName, 'file', vscode.Uri.file(path.join(this.currentDir, f)), baseName, parseInt(numStr, 10), `Pass ${numStr}`));
                }
            }
        }
        return passFiles.sort((a, b) => (a.passNumber || 0) - (b.passNumber || 0));
    }
}
exports.GccPassTreeProvider = GccPassTreeProvider;
//# sourceMappingURL=passTreeProvider.js.map