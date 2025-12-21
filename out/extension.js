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
const vscode = __importStar(require("vscode"));
const linkProvider_1 = require("./linkProvider");
const symbolDefinitionProvider_1 = require("./symbolDefinitionProvider");
function activate(context) {
    const selector = { scheme: 'file', language: 'gcc-md' };
    // 1. Register a custom command to open files permanently
    const openCommand = vscode.commands.registerCommand('gcc-md.openFilePermanent', (uri) => {
        vscode.window.showTextDocument(uri, {
            preview: false, // This ensures it opens in a new, permanent tab
            preserveFocus: false
        });
    });
    context.subscriptions.push(openCommand);
    // 2. Register the Link Provider
    context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(selector, new linkProvider_1.GCCMdLinkProvider()));
    // 3. Register the Symbol Provider (for C++ blocks)
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(selector, new symbolDefinitionProvider_1.GccSymbolDefinitionProvider()));
}
//# sourceMappingURL=extension.js.map