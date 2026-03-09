
## Feature: Portafolio (rename from Enrutador)

### What we're building

A complete **Portafolio** module replacing the current placeholder "Enrutador" page. It has two sub-sections:

**1. Oferta** — Catalog of products and services with dynamic offer categories (Productos, Servicios + user-created categories like Eventos, Convocatorias, Misiones). Each offer item has a name, description, category, type (Product/Service), dates, and any other relevant metadata. Categories work exactly like verticals: auto-created inline from the form.

**2. Pipeline** — A Kanban board attached to each offer. When an offer is created, its pipeline is created automatically. The pipeline has fully customizable stages (name, color, icon). Companies are added to pipeline stages from the CRM (bulk or individual) or from inside the Pipeline view itself.

---

### Database Schema (new tables)

```text
portfolio_offer_categories   ← Dynamic categories (name, color)
portfolio_offers             ← Each product/service offer
  - id, name, description, type (product|service), category_id
  - created_at, start_date, end_date

pipeline_stages              ← Custom Kanban columns per offer
  - id, offer_id, name, color, icon, display_order

pipeline_entries             ← Company placed in a stage
  - id, offer_id, stage_id, company_id, notes, created_at
```

---

### Pages & Components

```text
RENAME  src/pages/Enrutador.tsx → src/pages/Portafolio.tsx
  ├── Sub-tabs: "Oferta" | "Pipeline"
  │
  ├── OFERTA TAB
  │   ├── OfferCategoryManager (inline creation, like verticals)
  │   ├── OfferCard (product or service card with category badge)
  │   └── OfferFormDialog (create/edit offer + auto-creates pipeline)
  │
  └── PIPELINE TAB
      ├── OfferSelector (dropdown to pick which offer's pipeline to view)
      ├── PipelineBoard (Kanban with draggable columns)
      │   ├── PipelineStageColumn (stage header: name + color + icon)
      │   └── PipelineCompanyCard (mini company card with link to CRM)
      ├── StageManagerDialog (create/edit/reorder/delete stages)
      └── AddCompaniesToPipelineDialog (multi-select from CRM companies)

CREATE  src/contexts/PortfolioContext.tsx     ← data fetching & mutations
CREATE  src/types/portfolio.ts                ← TS interfaces

MODIFY  src/components/Layout.tsx             ← rename nav item + icon change (Layers)
MODIFY  src/App.tsx                           ← rename route /portafolio
MODIFY  src/components/crm/CompanyCard.tsx    ← "Agregar a Pipeline" button
MODIFY  src/components/crm/CompanyProfile.tsx ← "Agregar a Pipeline" action
```

---

### Key UX decisions

- **Offer → Pipeline is 1:1**: Creating an offer auto-creates its pipeline with a default stage "Sin estado". The pipeline tab just lets you pick which offer's board to view.
- **Adding companies**: Both from the CRM (individual card action + bulk selection from Index) and from the Pipeline tab's "+ Agregar empresas" button.
- **Stage customization**: Color picker (preset palette) + icon picker (subset of lucide icons) + rename + delete (moves companies to first stage). Drag to reorder.
- **No kanban drag for companies yet** (complex, deferred) — companies move between stages via a dropdown on each company card in the board.
- **Category creation** inline in the OfferForm with a "+" button, same UX as vertical creation.

---

### Implementation order

1. DB migration (4 new tables + RLS)
2. `src/types/portfolio.ts`
3. `src/contexts/PortfolioContext.tsx`
4. Oferta tab components + page scaffold
5. Pipeline tab components
6. CRM integration (add-to-pipeline from company card/profile)
7. Layout + routing rename
