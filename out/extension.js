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
exports.activate = activate;
exports.deactivate = deactivate;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const focusProvider_1 = require("./focusProvider");
const graphProvider_1 = require("./graphProvider");
const linkProvider_1 = require("./linkProvider");
const mdCache_1 = require("./mdCache");
const mdHoverProvider_1 = require("./mdHoverProvider");
const mdReferenceProvider_1 = require("./mdReferenceProvider");
const mdSymbolProvider_1 = require("./mdSymbolProvider");
const passDiffProvider_1 = require("./passDiffProvider");
const passSurferProvider_1 = require("./passSurferProvider");
const passTreeProvider_1 = require("./passTreeProvider");
const rtlCache_1 = require("./rtlCache");
const pipelineProvider_1 = require("./pipelineProvider");
const mdCache = new mdCache_1.GccMdCache();
const rtlCache = new rtlCache_1.RtlDefCache();
const diffProvider = new passDiffProvider_1.GccPassDiffProvider();
const focusProvider = new focusProvider_1.GccFocusProvider();
const graphProvider = new graphProvider_1.GccGraphProvider();
const surferProvider = new passSurferProvider_1.GccPassSurferProvider();
const initializedBackends = new Set();
const pipelineProvider = new pipelineProvider_1.GccPipelineProvider();
async function activate(context) {
    // 1. Helper: Auto-detect GCC Dump Language
    // Checks for .t (GIMPLE), .r (RTL), .i (IPA)
    const ensureDumpLanguage = async (doc) => {
        if (doc.uri.scheme !== 'file')
            return;
        const fileName = path.basename(doc.uri.fsPath);
        // Robust Regex: Matches 1 or more digits (\d+)
        const dumpRegex = /^(.+)\.(\d+)([tri])\.([^.]+)$/;
        const match = dumpRegex.exec(fileName);
        if (!match)
            return;
        const type = match[3];
        let targetLanguage;
        if (type === 'r')
            targetLanguage = 'gcc-rtl';
        else if (type === 't' || type === 'i')
            targetLanguage = 'gcc-gimple';
        if (targetLanguage && doc.languageId !== targetLanguage) {
            await vscode.languages.setTextDocumentLanguage(doc, targetLanguage);
        }
    };
    // 2. Initialize Caches
    await rtlCache.initialize(context);
    // 3. Selectors
    // CRITICAL FIX: Added 'gcc-gimple' so hover/links work in tree dumps too
    const mdSelector = { scheme: 'file', language: 'gcc-md' };
    const dumpSelector = [
        { scheme: 'file', language: 'gcc-rtl' },
        { scheme: 'file', language: 'gcc-md' }
    ];
    // 4. Document Watchers (Language Detection)
    if (vscode.window.activeTextEditor) {
        await ensureDumpLanguage(vscode.window.activeTextEditor.document);
        focusProvider.restoreState(vscode.window.activeTextEditor);
    }
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        if (editor) {
            await ensureDumpLanguage(editor.document);
            // Lazy Indexing for MD files
            if (editor.document.languageId === 'gcc-md') {
                const dir = path.dirname(editor.document.uri.fsPath);
                if (!initializedBackends.has(dir)) {
                    initializedBackends.add(dir);
                    vscode.window.setStatusBarMessage(`Indexing GCC Backend: ${path.basename(dir)}...`, 2000);
                    mdCache.forceReindex(editor.document.uri);
                }
            }
            // Restore Focus Mode UI State
            focusProvider.restoreState(editor);
        }
        else {
            vscode.commands.executeCommand('setContext', 'gcc-md.focusModeActive', false);
        }
    }));
    // 5. Providers & Commands
    const treeProvider = new passTreeProvider_1.GccPassTreeProvider();
    vscode.window.registerTreeDataProvider('gcc-dump-explorer', treeProvider);
    // MD Specific
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(mdSelector, new mdSymbolProvider_1.GccMdSymbolProvider(mdCache)));
    context.subscriptions.push(vscode.languages.registerReferenceProvider(mdSelector, new mdReferenceProvider_1.GccMdReferenceProvider(mdCache)));
    context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(mdSelector, new linkProvider_1.GCCMdLinkProvider()));
    // Generic (RTL + GIMPLE + MD)
    context.subscriptions.push(vscode.languages.registerHoverProvider(dumpSelector, new mdHoverProvider_1.GccMdHoverProvider(mdCache, rtlCache)));
    // Commands
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.openFilePermanent', (uri) => {
        vscode.window.showTextDocument(uri, { preview: false });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.refreshPasses', () => treeProvider.refresh()));
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.filterPasses', () => treeProvider.promptFilter()));
    // Focus Mode
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.toggleFocus', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor)
            focusProvider.toggleFocusMode(editor);
    }));
    // Graph Launcher
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.openDotFile', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor)
            graphProvider.openDotFile(editor);
    }));
    // Pass Surfer
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.nextPass', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor)
            surferProvider.navigate(editor, 'next');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.prevPass', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor)
            surferProvider.navigate(editor, 'prev');
    }));
    // Time Travel (Diff)
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.comparePreviousPass', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            await diffProvider.compareWithPrevious(editor.document.uri);
        }
        else {
            vscode.window.showErrorMessage("Open a GCC dump file first.");
        }
    }));
    // File Watcher for MD files
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.md');
    context.subscriptions.push(watcher.onDidChange((uri) => mdCache.indexFile(uri)));
    context.subscriptions.push(watcher.onDidCreate((uri) => mdCache.indexFile(uri)));
    context.subscriptions.push(watcher);
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.showPipeline', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            pipelineProvider.show(editor, context.extensionUri);
        }
        else {
            vscode.window.showErrorMessage("Open a C/C++ file first.");
        }
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map