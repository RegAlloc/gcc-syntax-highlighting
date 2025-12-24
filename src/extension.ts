import * as vscode from 'vscode';
import * as path from 'path';
import { GccMdCache } from './mdCache';
import { RtlDefCache } from './rtlCache'; // Import
import { GccMdSymbolProvider } from './mdSymbolProvider';
import { GccMdHoverProvider } from './mdHoverProvider';
import { GccMdReferenceProvider } from './mdReferenceProvider';
import { GCCMdLinkProvider } from './linkProvider';
import { GccPassDiffProvider } from './passDiffProvider';
import { GccPassTreeProvider } from './passTreeProvider';
import { GccFocusProvider } from './focusProvider'; // <--- 1. IMPORT THIS

const mdCache = new GccMdCache();
const rtlCache = new RtlDefCache(); // Instantiate

const initializedBackends = new Set<string>();
const diffProvider = new GccPassDiffProvider();

export async function activate(context: vscode.ExtensionContext) {
    // 1. Initialize RTL Definitions (Once)
    await rtlCache.initialize(context);

    // 2. Selectors for MD and Dump files
    // Assuming dump files might be .rtl, .expand, .vregs, etc. or just plain text
    const mdSelector: vscode.DocumentSelector = { scheme: 'file', language: 'gcc-md' };
    
    // We register the SAME hover provider for any file that looks like a dump
    const dumpSelector: vscode.DocumentSelector = [
        { scheme: 'file', language: 'gcc-rtl' },
        { scheme: 'file', language: 'gcc-md' } // Also cover MD files
    ];

    // ... (Keep existing MD Cache initialization logic) ...
    const ensureBackendIndexed = async (doc: vscode.TextDocument) => {
        if (doc.languageId !== 'gcc-md') return;
        const dir = path.dirname(doc.uri.fsPath);
        if (!initializedBackends.has(dir)) {
            initializedBackends.add(dir);
            vscode.window.setStatusBarMessage(`Indexing GCC Backend: ${path.basename(dir)}...`, 2000);
            await mdCache.forceReindex(doc.uri);
        }
    };
    const ensureDumpLanguage = async (doc: vscode.TextDocument) => {
        if (doc.uri.scheme !== 'file') return;

        const fileName = path.basename(doc.uri.fsPath);
        // Matches: name.123t.pass (Detects 't', 'r', or 'i')
        const dumpRegex = /^(.+)\.(\d{3})([tri])\.([^.]+)$/;
        const match = dumpRegex.exec(fileName);
        if (!match) return;

        const type = match[3];
        let targetLanguage: string | undefined;
        
        if (type === 'r') targetLanguage = 'gcc-rtl';
        else if (type === 't' || type === 'i') targetLanguage = 'gcc-gimple';

        if (targetLanguage && doc.languageId !== targetLanguage) {
            await vscode.languages.setTextDocumentLanguage(doc, targetLanguage);
        }
    };

    const treeProvider = new GccPassTreeProvider();
    vscode.window.registerTreeDataProvider('gcc-dump-explorer', treeProvider);

    if (vscode.window.activeTextEditor) {
        await ensureBackendIndexed(vscode.window.activeTextEditor.document);
    }
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) ensureBackendIndexed(editor.document);
    }));

    // Watchers
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.md');
    context.subscriptions.push(watcher.onDidChange((uri) => mdCache.indexFile(uri)));
    context.subscriptions.push(watcher.onDidCreate((uri) => mdCache.indexFile(uri)));
    context.subscriptions.push(watcher);
    const focusProvider = new GccFocusProvider();

   context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(async editor => {
        if (editor) {
            await ensureBackendIndexed(editor.document);
            await ensureDumpLanguage(editor.document);
            
            // CRITICAL: Restore decorations AND update the button icon state
            focusProvider.restoreState(editor); 
        } else {
            // If no editor is active, disable the button state
            vscode.commands.executeCommand('setContext', 'gcc-md.focusModeActive', false);
        }
    })); 

    // Commands
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.openFilePermanent', (uri: vscode.Uri) => {
        vscode.window.showTextDocument(uri, { preview: false });
    }));

    // Providers
    // NOTE: Symbol and Reference providers only make sense for MD files usually
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(mdSelector, new GccMdSymbolProvider(mdCache)));
    context.subscriptions.push(vscode.languages.registerReferenceProvider(mdSelector, new GccMdReferenceProvider(mdCache)));
    context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(mdSelector, new GCCMdLinkProvider()));

    // NOTE: Hover Provider is registered for BOTH MD and Dumps
    // We pass both caches to it
    context.subscriptions.push(vscode.languages.registerHoverProvider(dumpSelector, new GccMdHoverProvider(mdCache, rtlCache)));
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.refreshPasses', () => treeProvider.refresh()));
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.filterPasses', () => treeProvider.promptFilter()));

    // REGISTER THE TIME TRAVEL COMMAND
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.comparePreviousPass', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            await diffProvider.compareWithPrevious(editor.document.uri);
        } else {
            vscode.window.showErrorMessage("Open a GCC dump file first.");
        }
    }));
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                focusProvider.restoreState(editor);
            }
        })
    );
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.toggleFocus', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) focusProvider.toggleFocusMode(editor);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.toggleFocus_on', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) focusProvider.toggleFocusMode(editor);
    }));
}

export function deactivate() {}