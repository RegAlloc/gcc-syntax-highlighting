import * as vscode from 'vscode';
import { GCCMdLinkProvider } from './linkProvider';

export function activate(context: vscode.ExtensionContext) {
    const selector: vscode.DocumentSelector = { scheme: 'file', language: 'gcc-md' };

    // 1. Register a custom command to open files permanently
    const openCommand = vscode.commands.registerCommand('gcc-md.openFilePermanent', (uri: vscode.Uri) => {
        vscode.window.showTextDocument(uri, {
            preview: false, // This ensures it opens in a new, permanent tab
            preserveFocus: false
        });
    });
    context.subscriptions.push(openCommand);

    // 2. Register the Link Provider
    context.subscriptions.push(
        vscode.languages.registerDocumentLinkProvider(selector, new GCCMdLinkProvider())
    );
}