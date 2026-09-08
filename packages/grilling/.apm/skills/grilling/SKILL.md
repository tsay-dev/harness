---
name: grilling
description: Interview the user exhaustively about a plan or design. Use when a plan should be stress-tested before building, or when a 'grill'-style trigger phrase is used (e.g. "計画を詰めて", "grill me").
---

Interview me exhaustively about every aspect of this plan until we reach a shared understanding. Walk each branch of the design tree, resolving the dependencies between decisions one at a time.

Ask via the `AskUserQuestion` tool (question mode) rather than in plain text. Put the answer you recommend first and append `(Recommended)` to its label. Even when the discrete options are not obvious, offer the likely answers as options — free-form input is always available through the "Other" field.

Ask one question at a time, and wait for the answer to each before moving on. Firing several questions at once creates confusion.

When a question could be answered by examining the codebase, examine the codebase instead of asking.
