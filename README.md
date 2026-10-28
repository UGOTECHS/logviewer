# WPay Log Viewer

A static web app that analyses the Android logcat dumps uploaded by WPay POS terminals
(`com.xcr.singleapp.wpay`, the Xamarin.Android app). It isolates the app's own lines from the
device-wide dump, groups them by **boot segment → process instance (PID) → transaction**, and surfaces
the crashes and exceptions that only the system logs.

Everything runs in the browser. Log contents never leave the page; the only network calls are the
ones you trigger on the *Get logs* screen.

Live site: https://ugotechs.github.io/logviewer/ (published from `main` by GitHub Actions).

## Features

- **Get logs**: drop the terminal's `{serial}_{yyyy-MM-dd_HHmmss_fff}.zip` (or the raw `.txt`) anywhere in
  the app, load a file by URL, or enter a terminal serial and list / load its dumps from a log server.
  Several servers can be saved, each with its own base URL, header names and keys; keys are kept in the
  browser only when you ask for it.
- **Package picker**: every package found in the dump is listed with its process starts, crashes and
  app-tag lines; pick the app(s) you want to analyse and the tree is rebuilt without re-uploading.
- **Read logs**: tree of boot segments, app process instances and transactions / idle periods, with a
  filter box (pid, function, STAN, time…), status dots and a hide-idle switch; a breadcrumb of the
  current scope; a virtualized table of the lines (managed C#, native `LOGF`, dialogs, PAX SDK, Android
  runtime and system lines about the process) with level, family, tag and text / regex filters, echo
  hiding, relative time inside a transaction, and export of the visible lines. Search either filters the
  table or highlights matches in place with next / previous navigation (`n` / `p`, Enter). Any line can
  be opened with its ±25 raw neighbours, in its transaction, process, segment or the raw file.
- **Transactions**: start/end taken from the app's `ShellClient: transaction start | …` markers, with
  function, amount, entry mode, scheme, response code, STAN / RRN / auth id / masked card from the
  receipt, the `TRANS_STEP_TRACE` timings, a clickable milestone timeline, and a one-click plain-text
  summary for tickets.
- **Incidents**: `FATAL EXCEPTION` blocks (Mono exception type extracted), native tombstones, ANRs,
  `Killing …: crash`, process deaths, force-removed activities, low-memory kills, managed unhandled
  exceptions, `System.err` and PAX SDK exception traces; linked to the process and the transaction
  that was open, with the last dialog shown before the incident.
- **Overview** (the landing screen after a load): all transactions, incidents and process instances
  across the loaded files, sortable, filterable by result, CSV export. Identical incidents are grouped.

## Log format (what the parser relies on)

```
[2026-10-22 11:00:23].931 W/XWARN   ( 4616): vQA_1.3.25.7 ShellClient.cs:208 [FBTRACE] ShellClient: transaction start | merchant=1 eftProcessor=libWPAY function=PreAuth amount=1200
[2026-10-22 10:53:23].552 W/LOGF    ( 4616): |..\Gateway.c:462 | LoadGatewayLibrary ----
[2026-10-22 11:00:25].767 W/PAYMENTAPP_DIALOG( 4616): CloudBanking.ShellUI.RequestCardDialog
```

| family | tags | shape |
|---|---|---|
| managed | `XINFOR` `XWARN` `XERROR` | `v<version> <File.cs>:<line> <message>` |
| native | `LOGF` | `\|..\<File.cpp>:<line> \| <message>` |
| echo | `LOGF` from `TCP.cpp` | `PC-EFTPOS TX payload (App->POS) ASCII: Z0.<copy of a managed line>` (hidden by default) |
| dialog | `PAYMENTAPP_DIALOG` | dialog class name |
| step trace | `TRANS_STEP_TRACE` | `[<launch guid>] Index: n, …` timing line per transaction |
| sdk | `PaxSmartDevice` `Neptune` `PAXCARD` `IPP_DAL_TAG` `DLOG` | free text |
| runtime | any other tag of the app's pid | ART / SELinux / `AndroidRuntime` output |
| system | `ActivityManager` `ActivityTaskManager` `lowmemorykiller` lines naming the app | process start / kill / death |

A dump is a concatenation of reboots and dump windows that is not in time order. Boot segments start
at the ART marker `F/art_apex: Device is not fsverity-enabled.` or at a sustained backwards time jump;
PIDs are only unique inside one segment, so a process instance is *segment + pid*.

Transactions are bracketed by `ShellClient: transaction start |` … `transaction completed |` (host
answered) … `transaction end |` (always, unless the process died). Markers are matched on their text,
never on line numbers, so they survive code changes.

## Remote source

The log server API (from the "Logs" Postman collection):

| call | request |
|---|---|
| list the dumps of a terminal | `GET {base}api/files/{serial}` |
| download one dump | `GET {base}api/files/{serial}/{fileName}` |

Both carry the credentials in request headers. The default server profile sends `X-API-KEY` and
`X-API-SECRET`; a second profile sends `API-KEY` and `API-SECRET`; header names, base URL and keys are
editable per server under *server settings*. The list response is parsed leniently (a bare array or
`{files|items|data: […]}` of names or `{name, size, uploadedAt, url}` objects); the exact shape lives in
[`src/sources/remoteContract.ts`](src/sources/remoteContract.ts). The server must allow CORS from the
site's origin and those headers.

## Development

```bash
npm install
npm run dev        # http://localhost:5173/logviewer/
npm test           # parser unit tests (vitest)
npm run lint
npm run build      # type-check + static build into dist/
npm run bench -- /path/to/dump.txt [package]   # parse a local dump and print counts and timings
```

No log file of any kind is committed: real dumps may contain card-holder data in native lines, and the
`.gitignore` excludes `*.log`, `*.zip`, `*.txt` and `local/`. The parser tests use synthetic logcat excerpts
kept as string constants in `src/parser/__tests__/fixtures.ts`.

## Deployment

Pushes to `main` run lint, tests and build, then publish `dist/` to GitHub Pages. The repository's
Pages source must be set to "GitHub Actions" once. Set `VITE_BASE=/` to build for a root-hosted server.
