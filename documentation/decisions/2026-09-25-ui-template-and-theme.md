# MyTool UI theme decision — 2026-09-25

## Decision
- Apply the new responsive/density template to MyTool screens, starting with Customers.
- Preserve the current MyTool palette. The Obsidian Telemetry reference is used for layout, hierarchy, spacing, responsive behavior, and component discipline only; its dark palette is not adopted.
- UI work must not modify Supabase schema, RPCs, customer identity rules, debt calculations, or other data logic unless a separate task explicitly requires it.

## Customer screen baseline
- Mobile list prioritizes customer identity/username and debt; secondary details stay hidden until the customer is opened.
- Customer details use the existing detail view rather than expanding every row.
- Desktop can use a master/detail workspace while mobile remains list -> detail.
- Hidden/inactive customers remain recoverable through the existing status filter; hiding is not deletion.

## Future theme selector
Prepare components around semantic CSS tokens (surface, text, muted, line, accent, success/warning/danger) so a future **Settings > Theme** selector can change palettes without page-specific rewrites.

The future selector should:
1. Default to the current MyTool theme.
2. Store only a theme identifier/preference, not duplicate business data.
3. Apply globally through shared theme tokens.
4. Allow additional palettes later (including a dark theme) without changing screen logic.
5. Keep contrast/accessibility checks as a requirement before a theme is enabled.

No theme selector is exposed in the UI in this change; this document records the architectural decision first.
