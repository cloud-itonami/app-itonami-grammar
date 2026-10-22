"use strict";

const path = require("path");
const { LanguageClient, TransportKind } = require("vscode-languageclient/node");

let client;

function activate(context) {
  const serverModule = context.asAbsolutePath(path.join("server", "server.js"));
  const serverOptions = {
    command: process.execPath,
    args: [serverModule],
    transport: TransportKind.stdio,
  };
  const clientOptions = {
    documentSelector: [{ language: "kotoba" }],
    outputChannelName: "Kotoba Language Server",
  };

  client = new LanguageClient(
    "kotoba",
    "Kotoba Language Server",
    serverOptions,
    clientOptions,
  );
  context.subscriptions.push(client);
  void client.start();
}

async function deactivate() {
  if (client) {
    await client.stop();
  }
}

module.exports = { activate, deactivate };
