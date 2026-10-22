#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  createConnection,
  DiagnosticSeverity,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} = require("vscode-languageserver/node");
const { TextDocument } = require("vscode-languageserver-textdocument");

const grammarPath = path.join(__dirname, "..", "syntaxes", "kotoba.tmLanguage.json");

function loadForbiddenPattern() {
  const grammar = JSON.parse(fs.readFileSync(grammarPath, "utf8"));
  const entry = (grammar.patterns || []).find(
    (pattern) => pattern.name === "invalid.illegal.forbidden-head.kotoba",
  );
  if (!entry || typeof entry.match !== "string") {
    throw new Error(`Kotoba grammar has no forbidden-head rule: ${grammarPath}`);
  }
  return new RegExp(entry.match, "g");
}

const forbiddenPattern = loadForbiddenPattern();
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

function diagnostic(document, start, end, code, message) {
  return {
    range: {
      start: document.positionAt(start),
      end: document.positionAt(end),
    },
    severity: DiagnosticSeverity.Error,
    code,
    source: "kotoba",
    message,
  };
}

function analyze(document) {
  const source = document.getText();
  const diagnostics = [];
  const masked = source.split("");
  const stack = [];
  const matchingOpen = { ")": "(", "]": "[", "}": "{" };
  let inString = false;
  let escaped = false;
  let stringStart = -1;
  let inComment = false;

  for (let i = 0; i < source.length; i += 1) {
    const character = source[i];

    if (inComment) {
      if (character === "\n" || character === "\r") inComment = false;
      else masked[i] = " ";
      continue;
    }

    if (inString) {
      masked[i] = " ";
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
        stringStart = -1;
      }
      continue;
    }

    if (character === ";") {
      masked[i] = " ";
      inComment = true;
    } else if (character === '"') {
      masked[i] = " ";
      inString = true;
      stringStart = i;
    } else if (character === "(" || character === "[" || character === "{") {
      stack.push({ character, offset: i });
    } else if (character === ")" || character === "]" || character === "}") {
      const open = stack.pop();
      if (!open) {
        diagnostics.push(diagnostic(
          document, i, i + 1, "delimiter/unmatched-close",
          `Unmatched closing delimiter ${character}.`,
        ));
      } else if (open.character !== matchingOpen[character]) {
        diagnostics.push(diagnostic(
          document, i, i + 1, "delimiter/mismatched-close",
          `Closing delimiter ${character} does not match ${open.character}.`,
        ));
      }
    }
  }

  if (inString) {
    diagnostics.push(diagnostic(
      document, stringStart, stringStart + 1, "string/unclosed",
      "Unterminated string literal.",
    ));
  }
  for (const open of stack) {
    diagnostics.push(diagnostic(
      document, open.offset, open.offset + 1, "delimiter/unclosed-open",
      `Unclosed delimiter ${open.character}.`,
    ));
  }

  const codeOnly = masked.join("");
  forbiddenPattern.lastIndex = 0;
  let match;
  while ((match = forbiddenPattern.exec(codeOnly)) !== null) {
    diagnostics.push(diagnostic(
      document, match.index, match.index + match[0].length,
      "grammar/forbidden-head",
      `Forbidden Kotoba form: ${match[0]}.`,
    ));
    if (match[0].length === 0) forbiddenPattern.lastIndex += 1;
  }

  diagnostics.sort((left, right) =>
    left.range.start.line - right.range.start.line ||
    left.range.start.character - right.range.start.character,
  );
  return diagnostics;
}

function publishDiagnostics(document) {
  connection.sendDiagnostics({
    uri: document.uri,
    diagnostics: analyze(document),
  });
}

connection.onInitialize(() => ({
  capabilities: {
    textDocumentSync: {
      openClose: true,
      change: TextDocumentSyncKind.Full,
    },
  },
  serverInfo: { name: "Kotoba Language Server", version: "0.2.0" },
}));

documents.onDidOpen(({ document }) => publishDiagnostics(document));
documents.onDidChangeContent(({ document }) => publishDiagnostics(document));
documents.onDidClose(({ document }) => {
  connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
});

documents.listen(connection);
connection.listen();
