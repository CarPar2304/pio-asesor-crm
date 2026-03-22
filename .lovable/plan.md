

## Plan: Taxonomy UI Redesign

### Issues Identified

1. **Sub-verticals bug**: Column 3 iterates all `subVerticals` with checkboxes, but the UX expects to show only those linked to the selected vertical. When no links exist yet, the list is empty - this is correct behavior but confusing. The real fix: show all sub-verticals with link/unlink capability.
2. **Performance**: `TaxonomyContext` depends on `useCRM().companies` for orphan detection, causing cascading re-renders on every company change. Will memoize and debounce.
3. **Multi-select checkboxes**: Current UI shows all verticals with checkboxes. User wants single-click selection showing only linked items, with move/unlink actions instead.

### Changes

#### 1. `CRMSettingsDialog.tsx` - Full Taxonomy Tab Redesign

**3-Column Flow with connector lines:**
- Add dashed SVG connector lines between columns (inspired by the n8n reference image)
- Columns 2 and 3 start hidden/collapsed, animate in (fade + slide) when a category/vertical is selected
- Use `animate-fade-in` and transition classes

**Single-selection model:**
- Remove checkboxes from verticals and sub-verticals columns
- Category click → show only linked verticals for that category
- Vertical click → show only linked sub-verticals for that vertical
- Add "Vincular existente" dropdown button to link an existing vertical/sub-vertical to the current branch
- Add "Mover a otra categoría/vertical" action per item via a small dropdown

**Move functionality:**
- Each vertical gets a "Mover" action → opens a small select to pick target category
- Each sub-vertical gets a "Mover" action → opens a small select to pick target vertical
- Moving = unlink from current parent + link to new parent

**Orphan section:**
- Move orphan alerts below the 3-column flow
- Wrap in a collapsible section (hidden by default) with toggle button: "Mostrar valores sin gestionar (N)"

#### 2. `TaxonomyContext.tsx` - Performance

- Memoize `orphanVerticals` and `orphanSubVerticals` more aggressively
- Remove unnecessary re-computation triggers
- Use `useMemo` with stable references for company field extraction

#### 3. Add `moveVerticalToCategory` and `moveSubVerticalToVertical` functions to TaxonomyContext

- `moveVerticalToCategory(verticalId, fromCategory, toCategory)`: unlink from old, link to new
- `moveSubVerticalToVertical(subVerticalId, fromVerticalId, toVerticalId)`: unlink from old, link to new

### Technical Details

- Flow connector lines: CSS pseudo-elements or inline SVG dashes between the 3 Card components
- Animations: `transition-all duration-300` on column visibility, `animate-fade-in` on content
- The "Vincular existente" button shows a filtered list of verticals/sub-verticals NOT already linked to the current parent
- Sub-vertical fix: when a vertical is selected, show its linked sub-verticals plus ability to add/link more

