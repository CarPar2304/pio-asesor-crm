
## Plan: Features 2, 4 and 5

### What we're building

**2. Sales chart in company profile** — A Recharts bar chart showing sales evolution by year, placed above the existing metrics table in each company's profile page.

**4. Global tasks view** — A new `/tareas` page in the navigation listing all tasks across all companies, with tabs to filter by All / Pending / Overdue / Completed, and an inline "Mark complete" button.

**5. Excel export** — An "Exportar" button in the CRM toolbar that downloads the currently-filtered companies as an `.xlsx` file (all fields + sales by year + primary contact).

---

### Files to create / modify

```text
CREATE  src/components/crm/SalesChart.tsx      ← Recharts BarChart component
CREATE  src/pages/Tasks.tsx                    ← Global tasks page
CREATE  src/lib/exportExcel.ts                 ← xlsx export utility
MODIFY  src/components/crm/CompanyProfile.tsx  ← Inject SalesChart above the table
MODIFY  src/App.tsx                            ← Add /tareas route
MODIFY  src/components/Layout.tsx              ← Add "Tareas" nav item
MODIFY  src/pages/Index.tsx                    ← Add Exportar tab (index 5)
```

---

### Implementation details

**SalesChart** (`recharts` already installed)
- `ResponsiveContainer` + `BarChart` with one `Bar` for COP sales per year.
- Custom `Tooltip` formatting values with `formatCOP`.
- A second `Line` (or colored bar fill) can encode YoY sign (green/red) per bar.
- Placed between the summary metric cards and the year-by-year table.

**Tasks page** (`/tareas`)
- Reads `companies` from `useCRM()` and flattens all `company.tasks`.
- Four counters at top: Total, Pendientes, Vencidas (pending + dueDate < today), Completadas.
- Tab selector for filter; sorted by due date ascending.
- Each row: company name (clickable → navigates to `/empresa/:id`), task title, due date badge (red if overdue), inline "Completar" button calling `updateTask`.
- Nav item added to `Layout.tsx` with `CheckSquare` icon.

**Excel export** (`xlsx` already installed)
- `exportCompaniesToExcel(companies, activeYear)` in `src/lib/exportExcel.ts`.
- Builds flat rows: trade/legal name, NIT, category, vertical, city, activity, website, exports USD, one column per sales year (auto-detected), avg YoY %, last YoY %, primary contact name/role/email/phone/gender.
- `xlsx.utils.json_to_sheet` → `book_append_sheet` → `writeFile` triggers browser download.
- New tab in `ExpandableTabs` at index 5 (`Download` icon, title "Exportar").
