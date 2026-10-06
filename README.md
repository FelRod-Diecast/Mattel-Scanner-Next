# Mattel Scanner Next

A new Chrome/Edge MV3 Mattel Creations scanner built as the reference implementation for a future 24/7 Railway scanner.

## Goals

- Discover Mattel products reliably.
- Verify product-page state instead of trusting catalog availability alone.
- Track persistent product and event state across scans and browser restarts.
- Detect new products, upcoming launches, launches, restocks, and sellouts without notification spam.
- Use event-specific notification identities so the same event alerts once while a genuinely new event can alert again.
- Send Discord notifications only after the event is successfully delivered.
- Keep the scanner logic portable so the proven engine can later run on Railway.

## Development rule

This repository is independent of the existing MattelBotV2 and existing browser extensions. Those projects are reference/test oracles and are not modified as part of this build.
