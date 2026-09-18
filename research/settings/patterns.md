# Settings pattern (Factory Expo)

Adopted from ChatGPT Settings, v0 Usage & Billing, and iOS inset grouped lists. Termius colored icon tiles and Chat Smith uppercase section shouting were rejected as too loud for a control plane.

## Skeleton

1. One scroll. No tabs.
2. Grouped inset lists on the page background. Groups are fill-only (`backgroundElement`), radius 12 continuous, hairline separators inside, no outer border, no shadow.
3. Section titles 13/600 secondary, title case. Footer captions 13/400 secondary under the group.
4. Rows 52pt min, 16px inset, 17pt label, trailing 16pt secondary. SF Symbols 22pt, monochrome, one family. No chevrons on non-tappable rows.
5. Status is a trailing 8pt dot + Online/Offline, not a sentence in the title.
6. Usage is rows with a 4pt track, not bordered meter cards. Each signed-in provider is its own group.
7. Empty, loading, and error copy live inside the group they belong to.

## Factory mapping

- This machine first (can chats run).
- Then each provider's live limits, or one Usage group when none.
- Then the drawer Project, then tokens recorded on Sessions for that Project.

## Motion

Settings is opened often enough that entrances must not animate. Row press highlight only if a row becomes tappable. Progress bars do not animate on first paint.
