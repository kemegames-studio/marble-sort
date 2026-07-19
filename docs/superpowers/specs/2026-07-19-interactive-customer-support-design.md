# Interactive Customer Support Center

## Goal

Replace the current form-like support popup with a premium, responsive customer support center based on the supplied purple, cream, pink, gold, and green reference. Every visible control must perform a real action. Ticket history, conversation messages, ticket creation, and player replies use the configured Keme portal API; the game must not display fabricated sample tickets.

## Navigation States

The support center is one modal with three internal views.

### My Tickets

- Default view after support authentication completes.
- Shows live tickets ordered by most recently updated.
- Each card displays a short ticket reference, subject, description preview, update date, and normalized status.
- The complete card is a tap target and opens its ticket detail.
- Refresh retries authentication and reloads tickets.
- Load More retrieves the next page when the API reports additional tickets.
- An empty state offers a direct New Ticket action.

### Ticket Detail

- Loads `GET /api/v1/portal/tickets/:id` for the selected ticket.
- Shows ticket metadata, original description, and every player and support message in chronological order.
- Player and support messages use distinct chat-bubble alignment and labels.
- Open and Replied tickets expose a reply textarea and Send Reply button.
- Closed tickets show the full conversation read-only with a clear closed state.
- Back returns to the previous ticket-list position and refreshes the selected ticket summary.

### New Ticket

- Reuses the authenticated player and routed Marble Sort game.
- Collects category, subject, and description; priority defaults to normal and is not presented as a player-facing technical field.
- Subject requires at least 5 characters and description at least 10 characters.
- Successful submission opens the new ticket detail and refreshes ticket history.
- Failed submission preserves the draft and presents a retryable inline error.

## API Integration

- Login: `POST /api/v1/portal/auth/login`
- List tickets: `GET /api/v1/portal/tickets?page=:page&limit=10`
- Ticket detail and messages: `GET /api/v1/portal/tickets/:id`
- Create ticket: `POST /api/v1/portal/tickets`
- Reply: `POST /api/v1/portal/tickets/:id/messages`

Bearer authentication uses the existing persistent Marble Sort `gameUid`. Responses remain the source of truth. The UI normalizes Open, Replied, Resolved, and Closed labels but retains the backend status value for behavior.

## Failure And Offline Behavior

- Loading states use skeleton ticket rows or a compact spinner without blocking the Close control.
- API failures show a concise message with Retry.
- `support@kemegames.com` is always a real `mailto:` action.
- Existing loaded tickets remain visible if a later refresh fails.
- No ticket, message, or success state is synthesized locally.

## Visual And Interaction Design

- Recreate the supplied composition with a compact pink title banner, integrated close control, purple outer panel, gold trim, cream content surface, purple/gold tabs, and green primary CTAs.
- Use dynamic HTML and CSS rather than the supplied screenshot as a static background.
- Ticket cards, tabs, back, close, refresh, load more, create, send, and email actions receive pressed feedback and at least 44px tap targets.
- The modal scrolls internally and remains inside 320x568 and 393x852 Android viewports.
- Motion includes a short modal entrance, tab transition, and button press; reduced-motion users receive static transitions.

## Verification

- Mock Keme endpoints in browser QA for list, detail, creation, reply, pagination, empty, closed, loading, and failure states.
- Verify an old ticket opens and displays support replies.
- Verify an open ticket sends a reply and refreshes its conversation.
- Verify a closed ticket has no reply composer.
- Verify new-ticket validation, successful creation, and preserved draft on failure.
- Verify every visible control is actionable and all mobile layouts avoid clipping or corrupted text.
- Run existing game-engine and comprehensive UI suites, then create signed release APK/AAB artifacts with the next Play version code.
