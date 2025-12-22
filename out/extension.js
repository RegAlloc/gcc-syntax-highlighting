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
const path = __importStar(require("path")); // Added missing import
const mdCache_1 = require("./mdCache");
const mdSymbolProvider_1 = require("./mdSymbolProvider");
const mdHoverProvider_1 = require("./mdHoverProvider");
const mdReferenceProvider_1 = require("./mdReferenceProvider");
const linkProvider_1 = require("./linkProvider");
const cache = new mdCache_1.GccMdCache();
let currentBackendDir = undefined;
async function activate(context) {
    const selector = { scheme: 'file', language: 'gcc-md' };
    // Function to handle backend switching
    const updateCacheForActiveEditor = async (editor) => {
        if (!editor || editor.document.languageId !== 'gcc-md')
            return;
        const newDir = path.dirname(editor.document.uri.fsPath);
        if (newDir !== currentBackendDir) {
            currentBackendDir = newDir;
            // Clear and re-index for the new target (e.g., switching rs6000 -> aarch64)
            await cache.initialize(editor.document.uri);
        }
    };
    // Initialize on start
    await updateCacheForActiveEditor(vscode.window.activeTextEditor);
    // Listen for tab switches to change backend context
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => updateCacheForActiveEditor(editor)));
    // Watch for file changes to keep cache fresh
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.md');
    // use onDidChange and onDidCreate (onDidSave doesn't exist)
    context.subscriptions.push(watcher.onDidChange((uri) => cache.indexFile(uri)));
    context.subscriptions.push(watcher.onDidCreate((uri) => cache.indexFile(uri)));
    context.subscriptions.push(watcher);
    // Command for permanent links
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.openFilePermanent', (uri) => {
        vscode.window.showTextDocument(uri, { preview: false });
    }));
    // Register all providers with the cache
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(selector, new mdSymbolProvider_1.GccMdSymbolProvider(cache)));
    context.subscriptions.push(vscode.languages.registerHoverProvider(selector, new mdHoverProvider_1.GccMdHoverProvider(cache)));
    context.subscriptions.push(vscode.languages.registerReferenceProvider(selector, new mdReferenceProvider_1.GccMdReferenceProvider(cache)));
    context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(selector, new linkProvider_1.GCCMdLinkProvider()));
}
function deactivate() {
    cache.clear();
}
//# sourceMappingURL=extension.js.map