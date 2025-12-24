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
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const mdCache_1 = require("./mdCache");
const rtlCache_1 = require("./rtlCache"); // Import
const mdSymbolProvider_1 = require("./mdSymbolProvider");
const mdHoverProvider_1 = require("./mdHoverProvider");
const mdReferenceProvider_1 = require("./mdReferenceProvider");
const linkProvider_1 = require("./linkProvider");
const passDiffProvider_1 = require("./passDiffProvider");
const passTreeProvider_1 = require("./passTreeProvider");
const focusProvider_1 = require("./focusProvider"); // <--- 1. IMPORT THIS
const mdCache = new mdCache_1.GccMdCache();
const rtlCache = new rtlCache_1.RtlDefCache(); // Instantiate
const initializedBackends = new Set();
const diffProvider = new passDiffProvider_1.GccPassDiffProvider();
async function activate(context) {
    // 1. Initialize RTL Definitions (Once)
    await rtlCache.initialize(context);
    // 2. Selectors for MD and Dump files
    // Assuming dump files might be .rtl, .expand, .vregs, etc. or just plain text
    const mdSelector = { scheme: 'file', language: 'gcc-md' };
    // We register the SAME hover provider for any file that looks like a dump
    const dumpSelector = [
        { scheme: 'file', language: 'gcc-rtl' },
        { scheme: 'file', language: 'gcc-md' } // Also cover MD files
    ];
    // ... (Keep existing MD Cache initialization logic) ...
    const ensureBackendIndexed = async (doc) => {
        if (doc.languageId !== 'gcc-md')
            return;
        const dir = path.dirname(doc.uri.fsPath);
        if (!initializedBackends.has(dir)) {
            initializedBackends.add(dir);
            vscode.window.setStatusBarMessage(`Indexing GCC Backend: ${path.basename(dir)}...`, 2000);
            await mdCache.forceReindex(doc.uri);
        }
    };
    const ensureDumpLanguage = async (doc) => {
        if (doc.uri.scheme !== 'file')
            return;
        const fileName = path.basename(doc.uri.fsPath);
        // Matches: name.123t.pass (Detects 't', 'r', or 'i')
        const dumpRegex = /^(.+)\.(\d{3})([tri])\.([^.]+)$/;
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
    const treeProvider = new passTreeProvider_1.GccPassTreeProvider();
    vscode.window.registerTreeDataProvider('gcc-dump-explorer', treeProvider);
    if (vscode.window.activeTextEditor) {
        await ensureBackendIndexed(vscode.window.activeTextEditor.document);
    }
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor)
            ensureBackendIndexed(editor.document);
    }));
    // Watchers
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.md');
    context.subscriptions.push(watcher.onDidChange((uri) => mdCache.indexFile(uri)));
    context.subscriptions.push(watcher.onDidCreate((uri) => mdCache.indexFile(uri)));
    context.subscriptions.push(watcher);
    const focusProvider = new focusProvider_1.GccFocusProvider();
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        if (editor) {
            await ensureBackendIndexed(editor.document);
            await ensureDumpLanguage(editor.document);
            // CRITICAL: Restore decorations AND update the button icon state
            focusProvider.restoreState(editor);
        }
        else {
            // If no editor is active, disable the button state
            vscode.commands.executeCommand('setContext', 'gcc-md.focusModeActive', false);
        }
    }));
    // Commands
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.openFilePermanent', (uri) => {
        vscode.window.showTextDocument(uri, { preview: false });
    }));
    // Providers
    // NOTE: Symbol and Reference providers only make sense for MD files usually
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(mdSelector, new mdSymbolProvider_1.GccMdSymbolProvider(mdCache)));
    context.subscriptions.push(vscode.languages.registerReferenceProvider(mdSelector, new mdReferenceProvider_1.GccMdReferenceProvider(mdCache)));
    context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(mdSelector, new linkProvider_1.GCCMdLinkProvider()));
    // NOTE: Hover Provider is registered for BOTH MD and Dumps
    // We pass both caches to it
    context.subscriptions.push(vscode.languages.registerHoverProvider(dumpSelector, new mdHoverProvider_1.GccMdHoverProvider(mdCache, rtlCache)));
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.refreshPasses', () => treeProvider.refresh()));
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.filterPasses', () => treeProvider.promptFilter()));
    // REGISTER THE TIME TRAVEL COMMAND
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.comparePreviousPass', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            await diffProvider.compareWithPrevious(editor.document.uri);
        }
        else {
            vscode.window.showErrorMessage("Open a GCC dump file first.");
        }
    }));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            focusProvider.restoreState(editor);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.toggleFocus', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor)
            focusProvider.toggleFocusMode(editor);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.toggleFocus_on', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor)
            focusProvider.toggleFocusMode(editor);
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map