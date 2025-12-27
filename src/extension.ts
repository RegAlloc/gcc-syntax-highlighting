/*
 * Copyright (C) 2025 Kishan Parmar
 *
 * This file is part of GCC Workbench.
 *
 * GCC Workbench is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * GCC Workbench is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with GCC Workbench.  If not, see <https://www.gnu.org/licenses/>.
 */

import * as path from 'path';
import * as vscode from 'vscode';

import { GccFocusProvider } from './focusProvider';
import { GccGraphProvider } from './graphProvider';
import { GCCMdLinkProvider } from './linkProvider';
import { GccMdCache } from './mdCache';
import { GccMdHoverProvider } from './mdHoverProvider';
import { GccMdReferenceProvider } from './mdReferenceProvider';
import { GccMdSymbolProvider } from './mdSymbolProvider';
import { GccPassDiffProvider } from './passDiffProvider';
import { GccPassSurferProvider } from './passSurferProvider';
import { GccPassTreeProvider } from './passTreeProvider';
import { RtlDefCache } from './rtlCache';

const mdCache = new GccMdCache();
const rtlCache = new RtlDefCache();
const diffProvider = new GccPassDiffProvider();
const focusProvider = new GccFocusProvider();
const graphProvider = new GccGraphProvider();
const surferProvider = new GccPassSurferProvider();

// Track which folders we have already indexed to avoid spamming re-index on every tab switch
const initializedBackends = new Set<string>();

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
    let targetLanguage: string | undefined;

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
  const mdSelector: vscode.DocumentSelector = { scheme: 'file', language: 'gcc-md' };
  const dumpSelector: vscode.DocumentSelector = [
    { scheme: 'file', language: 'gcc-rtl' },
    { scheme: 'file', language: 'gcc-gimple' }, // Added gimple support for hover
    { scheme: 'file', language: 'gcc-md' }
  ];

  // 4. Startup Logic (Run immediately when window loads)
  if (vscode.window.activeTextEditor) {
    const editor = vscode.window.activeTextEditor;
    const doc = editor.document;

    // A. Detect Language
    await ensureDumpLanguage(doc);

    // B. Index MD File (The missing piece!)
    if (doc.languageId === 'gcc-md') {
      const dir = path.dirname(doc.uri.fsPath);
      if (!initializedBackends.has(dir)) {
        initializedBackends.add(dir);
        // console.log("Indexing GCC Backend on Startup: " + dir);
        mdCache.forceReindex(doc.uri);
      }
    }

    // C. Restore Focus UI
    focusProvider.restoreState(editor);
  }

  // 5. Event Listeners (Tab Switching)
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
        vscode.commands.executeCommand('setContext', 'gcc-dump.focusModeActive', false);
      }
    }));

  // 6. Providers
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

  // 7. Commands

  // Helper Commands
  context.subscriptions.push(vscode.commands.registerCommand(
    'gcc-md.openFilePermanent', (uri: vscode.Uri) => {
      vscode.window.showTextDocument(uri, { preview: false });
    }));

  // Tree View Commands
  context.subscriptions.push(vscode.commands.registerCommand(
    'gcc-dump.refreshPasses', () => treeProvider.refresh()));
  context.subscriptions.push(vscode.commands.registerCommand(
    'gcc-dump.filterPasses', () => treeProvider.promptFilter()));

  // Focus Mode (Toggle) - The "Eye" Button
  // We register TWO commands for the same logic to handle the toggle UI state
  context.subscriptions.push(
    vscode.commands.registerCommand('gcc-dump.toggleFocus', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor)
        focusProvider.toggleFocusMode(editor);
    }));
  context.subscriptions.push(
    vscode.commands.registerCommand('gcc-dump.toggleFocus_on', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor)
        focusProvider.toggleFocusMode(editor);
    }));

  // Graph Launcher
  context.subscriptions.push(
    vscode.commands.registerCommand('gcc-dump.openDotFile', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor)
        graphProvider.openDotFile(editor);
    }));

  // Pass Surfer
  context.subscriptions.push(
    vscode.commands.registerCommand('gcc-dump.nextPass', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor)
        surferProvider.navigate(editor, 'next');
    }));
  context.subscriptions.push(
    vscode.commands.registerCommand('gcc-dump.prevPass', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor)
        surferProvider.navigate(editor, 'prev');
    }));

  // Time Travel (Diff)
  context.subscriptions.push(vscode.commands.registerCommand(
    'gcc-dump.comparePreviousPass', async () => {
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
}

export function deactivate() { }