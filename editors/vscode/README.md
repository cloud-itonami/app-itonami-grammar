# Kotoba for VS Code

Syntax highlighting and a local language server for `.kotoba`, using the same
grammar this repository generates for GitHub Linguist.

It also scopes the heads Kotoba refuses. `(atom x)`, `(eval x)`, `(swap! …)` —
the `:forbidden-heads` in `resources/kotoba/lang/guest-grammar.edn` — get
`invalid.illegal.forbidden-head.kotoba` rather than the plain function-call
scope Clojure's grammar would give them. Every theme renders that as an error,
so the no-ambient-authority invariant shows up while you type instead of when
the compiler fails closed on it.

## Awai themes

The extension includes **Kotoba Awai Light** and **Kotoba Awai Dark**. The light
theme uses Awai's Aka (`#bc002d`), Ao (`#1e50a2`), Shiro (`#ffffff`) and Kuro
(`#14110f`), with Sumi and deep tones mixed from those four. The dark theme
keeps the same roles and lightens the foreground tones against Kuro. Blue marks
forms and structure; red marks forbidden forms and host operations; comments
and delimiters use Sumi. Both files are generated from the shared
[`themes/kotoba-awai.json`](../../themes/kotoba-awai.json) token map, which also
drives the Kotoba site's syntax colors.

Choose the theme through **Preferences: Color Theme**. Installing the language
extension does not change the user's existing editor-wide theme.

## Language server

The extension starts `server/server.js` as a local stdio language server. It
uses the bundled TextMate grammar's forbidden-head rule, so the diagnostic list
does not carry a second copy of the forbidden vocabulary. It currently reports
forbidden Kotoba forms, unmatched or unclosed delimiters, and unterminated
strings as the document opens or changes. The server keeps document state in
memory and does not make network requests.

To start the server directly from the repository root:

```bash
npm install --prefix editors/vscode
node editors/vscode/server/server.js
```

The process reads and writes LSP `Content-Length` frames on stdin/stdout; use
stderr for any launch diagnostics. This first server does not yet provide
completion, go-to-definition, or compiler-backed diagnostics. Amu consumes
`.kotoba` source, so the same language ID and grammar cover files checked by
Amu; there is no separate `.amu` source language.

## GitHub language display

The VS Code extension's language server applies only inside the editor. It
does not make GitHub display Kotoba. GitHub reads
`lib/linguist/languages.yml`, not an editor extension, and Kotoba is not in it
yet — see [Linguist status](../../README.md#linguist-status) for the measured
gap and why `.gitattributes` cannot stand in.

Current LSP support is deliberately small: forbidden-form, delimiter, and
unterminated-string diagnostics on open/change/close. Completion,
go-to-definition, hover, formatting, and compiler-backed diagnostics are not
implemented yet. Grammar highlighting remains available independently of the
language server.

## Install from the Marketplace

Search for `Kotoba` in VS Code Extensions, or run:

```text
ext install kotoba-lang.kotoba
```

[Open the Visual Studio Marketplace listing](https://marketplace.visualstudio.com/items?itemName=kotoba-lang.kotoba)

## Install from source

```bash
kbb --backend sci tools/gen-vscode-grammar.cljk     # from the repository root
npm install --prefix editors/vscode
ln -s "$PWD/editors/vscode" ~/.vscode/extensions/kotoba
```

Reload the window. `.kotoba` files report `kotoba` in the language picker and
start the language server. Select a Kotoba Awai theme from **Preferences: Color
Theme** when you want the included palette.

## The grammar here is generated

`syntaxes/kotoba.tmLanguage.json` is a copy — VS Code resolves
`contributes.grammars[].path` inside the extension folder, so it cannot point
at the one in the repository root. `tools/gen-vscode-grammar.cljk --check`
refuses to let the copy drift, and checks two things a copy check would not:

- the `scopeName` in `package.json` against the one inside the grammar. A typo
  there produces an extension that installs, activates, opens `.kotoba` files
  and highlights nothing, because VS Code looks the grammar up by scope and
  finds no match. No error is raised anywhere.
- the declared extensions against `linguist/languages.yml.entry`, so the editor
  and the pending Linguist submission cannot disagree about which files are
  Kotoba.

Do not edit anything in `syntaxes/` here. Edit the EDN authority, regenerate.

## Support

Please report highlighting bugs and false-positive forbidden heads in the
[grammar issue tracker](https://github.com/kotoba-lang/grammar/issues).
