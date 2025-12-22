import * as vscode from 'vscode';
import * as path from 'path'; // Added missing import
import { GccMdCache } from './mdCache';
import { GccMdSymbolProvider } from './mdSymbolProvider';
import { GccMdHoverProvider } from './mdHoverProvider';
import { GccMdReferenceProvider } from './mdReferenceProvider';
import { GCCMdLinkProvider } from './linkProvider';

const cache = new GccMdCache();
let currentBackendDir: string | undefined = undefined;

export async function activate(context: vscode.ExtensionContext) {
    const selector: vscode.DocumentSelector = { scheme: 'file', language: 'gcc-md' };

    // Function to handle backend switching
    const updateCacheForActiveEditor = async (editor: vscode.TextEditor | undefined) => {
        if (!editor || editor.document.languageId !== 'gcc-md') return;
        
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
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => updateCacheForActiveEditor(editor))
    );

    // Watch for file changes to keep cache fresh
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.md');
    // use onDidChange and onDidCreate (onDidSave doesn't exist)
    context.subscriptions.push(watcher.onDidChange((uri: vscode.Uri) => cache.indexFile(uri)));
    context.subscriptions.push(watcher.onDidCreate((uri: vscode.Uri) => cache.indexFile(uri)));
    context.subscriptions.push(watcher);

    // Command for permanent links
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.openFilePermanent', (uri: vscode.Uri) => {
        vscode.window.showTextDocument(uri, { preview: false });
    }));

    // Register all providers with the cache
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(selector, new GccMdSymbolProvider(cache)));
    context.subscriptions.push(vscode.languages.registerHoverProvider(selector, new GccMdHoverProvider(cache)));
    context.subscriptions.push(vscode.languages.registerReferenceProvider(selector, new GccMdReferenceProvider(cache)));
    context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(selector, new GCCMdLinkProvider()));
}

export function deactivate() {
    cache.clear();
}