import * as path from 'path';
import * as vscode from 'vscode';

import {GccFocusProvider} from './focusProvider';
import {GccGraphProvider} from './graphProvider';
import {GCCMdLinkProvider} from './linkProvider';
import {GccMdCache} from './mdCache';
import {GccMdHoverProvider} from './mdHoverProvider';
import {GccMdReferenceProvider} from './mdReferenceProvider';
import {GccMdSymbolProvider} from './mdSymbolProvider';
import {GccPassDiffProvider} from './passDiffProvider';
import {GccPassSurferProvider} from './passSurferProvider';
import {GccPassTreeProvider} from './passTreeProvider';
import {RtlDefCache} from './rtlCache';
import { GccPipelineProvider } from './pipelineProvider';

const mdCache = new GccMdCache();
const rtlCache = new RtlDefCache();
const diffProvider = new GccPassDiffProvider();
const focusProvider = new GccFocusProvider();
const graphProvider = new GccGraphProvider();
const surferProvider = new GccPassSurferProvider();
const initializedBackends = new Set<string>();
const pipelineProvider = new GccPipelineProvider();

export async function activate(context: vscode.ExtensionContext) {

  // 1. Helper: Auto-detect GCC Dump Language
  // Checks for .t (GIMPLE), .r (RTL), .i (IPA)
  const ensureDumpLanguage = async (doc: vscode.TextDocument) => {
    if (doc.uri.scheme !== 'file')
      return;
    const fileName = path.basename(doc.uri.fsPath);
    // Robust Regex: Matches 1 or more digits (\d+)
    const dumpRegex = /^(.+)\.(\d+)([tri])\.([^.]+)$/;
    const match = dumpRegex.exec(fileName);
    if (!match)
      return;

    const type = match[3];
    let targetLanguage: string|undefined;

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
  const mdSelector:
      vscode.DocumentSelector = {scheme : 'file', language : 'gcc-md'};
  const dumpSelector: vscode.DocumentSelector = [
    {scheme : 'file', language : 'gcc-rtl'},
    {scheme : 'file', language : 'gcc-md'}
  ];

  // 4. Document Watchers (Language Detection)
  if (vscode.window.activeTextEditor) {
    await ensureDumpLanguage(vscode.window.activeTextEditor.document);
    focusProvider.restoreState(vscode.window.activeTextEditor);
  }

  context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(async editor => {
        if (editor) {
          await ensureDumpLanguage(editor.document);

          // Lazy Indexing for MD files
          if (editor.document.languageId === 'gcc-md') {
            const dir = path.dirname(editor.document.uri.fsPath);
            if (!initializedBackends.has(dir)) {
              initializedBackends.add(dir);
              vscode.window.setStatusBarMessage(
                  `Indexing GCC Backend: ${path.basename(dir)}...`, 2000);
              mdCache.forceReindex(editor.document.uri);
            }
          }
          // Restore Focus Mode UI State
          focusProvider.restoreState(editor);
        } else {
          vscode.commands.executeCommand('setContext', 'gcc-md.focusModeActive',
                                         false);
        }
      }));

  // 5. Providers & Commands
  const treeProvider = new GccPassTreeProvider();
  vscode.window.registerTreeDataProvider('gcc-dump-explorer', treeProvider);

  // MD Specific
  context.subscriptions.push(vscode.languages.registerDefinitionProvider(
      mdSelector, new GccMdSymbolProvider(mdCache)));
  context.subscriptions.push(vscode.languages.registerReferenceProvider(
      mdSelector, new GccMdReferenceProvider(mdCache)));
  context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(
      mdSelector, new GCCMdLinkProvider()));

  // Generic (RTL + GIMPLE + MD)
  context.subscriptions.push(vscode.languages.registerHoverProvider(
      dumpSelector, new GccMdHoverProvider(mdCache, rtlCache)));

  // Commands
  context.subscriptions.push(vscode.commands.registerCommand(
      'gcc-md.openFilePermanent', (uri: vscode.Uri) => {
        vscode.window.showTextDocument(uri, {preview : false});
      }));
  context.subscriptions.push(vscode.commands.registerCommand(
      'gcc-md.refreshPasses', () => treeProvider.refresh()));
  context.subscriptions.push(vscode.commands.registerCommand(
      'gcc-md.filterPasses', () => treeProvider.promptFilter()));

  // Focus Mode
  context.subscriptions.push(
      vscode.commands.registerCommand('gcc-md.toggleFocus', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor)
          focusProvider.toggleFocusMode(editor);
      }));

  // Graph Launcher
  context.subscriptions.push(
      vscode.commands.registerCommand('gcc-md.openDotFile', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor)
          graphProvider.openDotFile(editor);
      }));

  // Pass Surfer
  context.subscriptions.push(
      vscode.commands.registerCommand('gcc-md.nextPass', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor)
          surferProvider.navigate(editor, 'next');
      }));
  context.subscriptions.push(
      vscode.commands.registerCommand('gcc-md.prevPass', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor)
          surferProvider.navigate(editor, 'prev');
      }));

  // Time Travel (Diff)
  context.subscriptions.push(vscode.commands.registerCommand(
      'gcc-md.comparePreviousPass', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          await diffProvider.compareWithPrevious(editor.document.uri);
        } else {
          vscode.window.showErrorMessage("Open a GCC dump file first.");
        }
      }));

  // File Watcher for MD files
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.md');
  context.subscriptions.push(
      watcher.onDidChange((uri) => mdCache.indexFile(uri)));
  context.subscriptions.push(
      watcher.onDidCreate((uri) => mdCache.indexFile(uri)));
  context.subscriptions.push(watcher);

  context.subscriptions.push(vscode.commands.registerCommand('gcc-md.showPipeline', () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        pipelineProvider.show(editor, context.extensionUri);
    } else {
        vscode.window.showErrorMessage("Open a C/C++ file first.");
    }
}));
}

export function deactivate() {}