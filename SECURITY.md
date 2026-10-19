# Security policy

Toolwright's promise is that your data stays on your device, so we take security and privacy reports seriously.

## What to report

- Any way a tool could transmit user input or files to a server or third party.
- A weakness in the Content Security Policy or other security headers.
- Cross-site scripting (XSS) or HTML injection, for example via Markdown, SVG or QR content.
- Incorrect cryptographic behavior in the password, ID, hash or JWT tools (for example, biased or predictable randomness).
- Problems in the tool-request API: injection, authentication or rate-limit bypass, or leakage of stored data.
- Vulnerable dependencies that are actually reachable.

## How to report

Please **do not open a public issue** for vulnerabilities. Use GitHub's *"Report a vulnerability"* (private security advisory) on the repository's Security tab, or email the maintainers at the address on the repository profile. Include:

- A description and the impact.
- Steps to reproduce, or a proof of concept.
- Affected tool, browser and version if relevant.

We aim to acknowledge reports within 3 working days and to ship a fix or mitigation for confirmed issues as quickly as practical. We're happy to credit you in the release notes unless you'd rather stay anonymous.

## Scope notes

- Toolwright has no user accounts and stores no personal data. The only server-side data is the request board (idea text and a one-way hash of an anonymous browser code).
- A compromised device or malicious browser extension can read any web page; that is outside what a website can defend against.
- The cipher tools (ROT13, Caesar, Morse) are intentionally not secure and are labelled as such.

## Supported versions

We support the latest release on the `main` branch.
