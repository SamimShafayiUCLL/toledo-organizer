# v0.7: pinned courses + sidebar order (user requests from Reddit)

## Pinned courses ("Vastgepind" / "Pinned")
- `state.pinned`: ordered array of course keys (unique strings, max 50), persisted and exported.
- A pinned course is shown only in a "Vastgepind" block at the top of Structuur view, outside every group (its group stays stored, so unpinning puts it back).
- Pin/unpin via a pin button on every course row (visible on hover, always visible when pinned); in edit mode also by dragging a course into / out of the block. Order inside the block via drag or up/down.
- Smart sorting ignores pinned courses. Search filters the block like any group.
- The block is hidden when empty, except in edit mode (empty drop target).

## Sidebar order
- `state.dashboard.order`: permutation of `["tasks", "upcoming", "feed"]`, default in that order.
- Settings > Dashboard: the three cards listed with up/down buttons; the sidebar re-renders immediately.
