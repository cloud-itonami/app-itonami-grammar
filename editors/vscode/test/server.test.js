"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { test } = require("node:test");

function frameReader(stream) {
  let buffer = Buffer.alloc(0);
  const frames = [];
  const waiters = [];

  stream.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const separator = buffer.indexOf("\r\n\r\n");
      if (separator < 0) return;
      const headers = buffer.subarray(0, separator).toString("ascii");
      const length = Number(headers.match(/Content-Length:\s*(\d+)/i)?.[1]);
      if (!Number.isInteger(length) || buffer.length < separator + 4 + length) return;
      const body = buffer.subarray(separator + 4, separator + 4 + length).toString("utf8");
      buffer = buffer.subarray(separator + 4 + length);
      const frame = JSON.parse(body);
      const waiter = waiters.shift();
      if (waiter) waiter(frame);
      else frames.push(frame);
    }
  });

  return {
    read(timeoutMs = 3000) {
      if (frames.length) return Promise.resolve(frames.shift());
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timed out waiting for an LSP frame.")), timeoutMs);
        waiters.push((frame) => {
          clearTimeout(timeout);
          resolve(frame);
        });
      });
    },
  };
}

function send(stream, message) {
  const body = JSON.stringify(message);
  stream.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

async function readUntil(reader, predicate) {
  while (true) {
    const frame = await reader.read();
    if (predicate(frame)) return frame;
  }
}

test("stdio server publishes exact diagnostics and clears them on close", async (t) => {
  const serverPath = path.join(__dirname, "..", "server", "server.js");
  const child = spawn(process.execPath, [serverPath], { stdio: ["pipe", "pipe", "pipe"] });
  const reader = frameReader(child.stdout);
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const closed = new Promise((resolve) => child.once("close", resolve));
  t.after(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  });

  send(child.stdin, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { processId: process.pid, rootUri: null, capabilities: {} },
  });
  const initialized = await readUntil(reader, (frame) => frame.id === 1);
  assert.equal(initialized.result.capabilities.textDocumentSync.change, 1);
  send(child.stdin, { jsonrpc: "2.0", method: "initialized", params: {} });

  const uri = "memfs:/review.kotoba";
  send(child.stdin, {
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri,
        languageId: "kotoba",
        version: 1,
        text: "(+ 1 2)\n; (load-string hidden)\n\"(load-string hidden)\"",
      },
    },
  });
  const clean = await readUntil(reader, (frame) => frame.method === "textDocument/publishDiagnostics");
  assert.deepEqual(clean.params.diagnostics, []);

  send(child.stdin, {
    jsonrpc: "2.0",
    method: "textDocument/didChange",
    params: {
      textDocument: { uri, version: 2 },
      contentChanges: [{ text: "(load-string x)\n([)]\n\"unterminated" }],
    },
  });
  const broken = await readUntil(reader, (frame) => frame.method === "textDocument/publishDiagnostics");
  const codes = broken.params.diagnostics.map((diagnostic) => diagnostic.code);
  assert.equal(codes.filter((code) => code === "grammar/forbidden-head").length, 1);
  assert.equal(codes.filter((code) => code === "delimiter/mismatched-close").length, 2);
  assert.equal(codes.filter((code) => code === "string/unclosed").length, 1);
  assert.equal(stderr, "");

  send(child.stdin, {
    jsonrpc: "2.0",
    method: "textDocument/didClose",
    params: { textDocument: { uri } },
  });
  const cleared = await readUntil(reader, (frame) => frame.method === "textDocument/publishDiagnostics");
  assert.deepEqual(cleared.params.diagnostics, []);

  send(child.stdin, { jsonrpc: "2.0", id: 2, method: "shutdown", params: null });
  await readUntil(reader, (frame) => frame.id === 2);
  send(child.stdin, { jsonrpc: "2.0", method: "exit", params: null });
  child.stdin.end();
  assert.equal(await closed, 0, stderr);
});
