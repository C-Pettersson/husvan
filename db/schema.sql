-- Husvan: first schema draft (Postgres 15+)
--
-- Principles (see CLAUDE.md):
--   * Fixed core, dynamic attributes in attribute_value.
--   * Every value has a source, document, confidence and changeset.
--   * Nothing is overwritten or deleted: valid_to closes a value,
--     replaced_on/replaced_by closes a component.
--   * Drafts from Claude are stored as JSON in changeset.proposal until
--     approved. Only then are rows written to the other tables.
--   * Identifiers are English. Display labels for data that grows at runtime
--     (component types, attributes) are stored per locale as
--     {"sv": "...", "en": "..."}; fixed values are translated in the web app.

create extension if not exists pgcrypto;

-- Static values per municipality ----------------------------------------------

create table municipality (
  code                    text primary key check (code ~ '^[0-9]{4}$'),  -- SCB municipality code
  name                    text not null,
  ground_snow_load_kn_m2  numeric,          -- snow zone value
  fgeo                    numeric,          -- geographic adjustment factor (BBR)
  dvut_c                  numeric,          -- design winter outdoor temperature
  cloudburst_map_url      text,
  tariff_changes          jsonb not null default '{}',  -- {"2026": {"water_sewage": 0.079, ...}} from Nils Holgersson
  updated_at              timestamptz not null default now()
);

-- Changesets: an approved draft becomes a changeset ---------------------------

create table changeset (
  id          uuid primary key default gen_random_uuid(),
  status      text not null default 'draft'
              check (status in ('draft', 'approved', 'rejected')),
  source      text not null check (source in ('user', 'claude', 'import')),
  proposal    jsonb,                    -- the draft's content before approval
  comment     text,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);

-- Houses: fixed core ----------------------------------------------------------

create table house (
  id                    uuid primary key default gen_random_uuid(),
  address               text not null,
  municipality_code     text references municipality,
  property_designation  text,             -- fastighetsbeteckning
  status                text not null default 'interested'
                        check (status in ('interested', 'viewing', 'bidding', 'declined', 'purchased', 'sold')),
  changeset_id          uuid not null references changeset,
  created_at            timestamptz not null default now()
);

-- Type library ----------------------------------------------------------------

create table component_type (
  type                   text primary key check (type ~ '^[a-z0-9_]+$'),
  label                  jsonb not null check (label ? 'sv'),  -- {"sv": "Golvvärme", "en": "Underfloor heating"}
  category               text not null,                       -- e.g. heating, ventilation, roof
  parent_type            text references component_type,      -- taxonomy, e.g. underfloor_heating under heating
  attribute_schema       jsonb not null default '{}',         -- key -> {label, datatype, unit, options}
  allowed_subcomponents  text[] not null default '{}',
  version                int not null default 1
);

-- Lifespan and cost, combined from several sources. Several rows per type are
-- allowed, one per source and variant.
create table lifespan (
  id                      uuid primary key default gen_random_uuid(),
  type                    text not null references component_type,
  variant                 jsonb not null default '{}',   -- e.g. {"medium": "water"}
  lifespan_min_years      int,
  lifespan_typical_years  int,
  lifespan_max_years      int,
  cost_sek                numeric,
  cost_unit               text check (cost_unit in ('each', 'm2', 'linear_m', 'house')),
  price_year              int,                           -- year the price refers to, for indexation
  source                  text not null,                 -- e.g. 'Handelsbanken', 'Planima', 'Villaägarna'
  source_url              text
);

-- Actors and documents --------------------------------------------------------

create table actor (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  org_number  text,
  roles       text[] not null default '{}',   -- installer, supplier, manufacturer, broker, inspector
  contact     jsonb not null default '{}'
);

create table document (
  id              uuid primary key default gen_random_uuid(),
  house_id        uuid references house,
  type            text not null check (type in ('listing', 'inspection', 'energy_certificate', 'invoice',
                                                'receipt', 'manual', 'warranty', 'drawing', 'photo', 'other')),
  filename        text,
  mime            text,
  sha256          text unique,       -- the same file is stored only once
  storage_path    text,              -- path to the original file
  full_text       text,
  interpretation  jsonb,             -- Claude's interpretation, stored unchanged
  document_date   date,
  amount_sek      numeric,
  actor_id        uuid references actor,
  changeset_id    uuid not null references changeset,
  created_at      timestamptz not null default now()
);

-- Components in a tree --------------------------------------------------------

create table component (
  id              uuid primary key default gen_random_uuid(),
  house_id        uuid not null references house,
  type            text not null references component_type,
  parent_id       uuid references component,
  name            text,                       -- e.g. 'W-3, kitchen, south'
  installed_on    date,
  replaced_on     date,
  replaced_by     uuid references component,
  removed_on      date,
  current_values  jsonb not null default '{}',  -- cache of current values for fast reads
  changeset_id    uuid not null references changeset,
  check (replaced_by is null or replaced_on is not null)
);

create index component_house_idx on component (house_id);
create index component_parent_idx on component (parent_id);

-- Dynamic values with source and history --------------------------------------

create table attribute_value (
  id              uuid primary key default gen_random_uuid(),
  house_id        uuid not null references house,
  component_id    uuid references component,       -- null = the value applies to the house
  key             text not null check (key ~ '^[a-z0-9_]+$'),
  value           jsonb not null,
  unit            text,
  source          text not null check (source in ('user', 'claude', 'inspection', 'import')),
  document_id     uuid references document,
  confidence      numeric check (confidence between 0 and 1),
  outside_schema  boolean not null default false,
  valid_from      timestamptz not null default now(),
  valid_to        timestamptz,                     -- null = still valid
  changeset_id    uuid not null references changeset,
  check (valid_to is null or valid_to > valid_from)
);

-- One current value per key and source. The user's value is chosen over
-- Claude's when reading.
create unique index attribute_value_current_idx
  on attribute_value (house_id,
                      coalesce(component_id, '00000000-0000-0000-0000-000000000000'::uuid),
                      key, source)
  where valid_to is null;

-- Links between components ----------------------------------------------------

create table component_relation (
  from_id       uuid not null references component,
  to_id         uuid not null references component,
  type          text not null check (type in ('controls', 'supplies', 'located_in')),
  changeset_id  uuid not null references changeset,
  primary key (from_id, to_id, type)
);

-- Events: what has happened to the house --------------------------------------

create table event (
  id                   uuid primary key default gen_random_uuid(),
  house_id             uuid not null references house,
  type                 text not null check (type in ('installation', 'service', 'repair', 'replacement',
                                                     'inspection', 'measurement', 'other')),
  occurred_on          date not null,
  cost_sek             numeric,
  actor_id             uuid references actor,
  document_id          uuid references document,
  description          text,
  improvement_expense  boolean not null default false,  -- förbättringsutgift (tax deductible on sale)
  changeset_id         uuid not null references changeset
);

-- A replacement points to both the old and the new component.
create table event_component (
  event_id      uuid not null references event,
  component_id  uuid not null references component,
  role          text not null default 'affected' check (role in ('affected', 'old', 'new')),
  primary key (event_id, component_id)
);

-- Work items: what needs to be or is planned to be done -----------------------

create table work_item (
  id            uuid primary key default gen_random_uuid(),
  house_id      uuid not null references house,
  component_id  uuid references component,
  description   text not null,
  year          int,
  cost_sek_min  numeric,
  cost_sek_max  numeric,
  source        text not null check (source in ('inspection', 'listing', 'lifespan', 'user')),
  document_id   uuid references document,
  status        text not null default 'planned'
                check (status in ('planned', 'decided', 'done', 'cancelled')),
  event_id      uuid references event,          -- when the work item is done
  changeset_id  uuid not null references changeset
);

-- Forecast assumptions. house_id null = default for all houses. ---------------
-- Keys: horizon_years, start_year, interest_rate, down_payment_sek,
-- electricity_price_sek_kwh, district_heating_price_sek_kwh, price_index.

create table assumption (
  id            uuid primary key default gen_random_uuid(),
  house_id      uuid references house,
  key           text not null check (key ~ '^[a-z0-9_]+$'),
  value         jsonb not null,
  valid_from    timestamptz not null default now(),
  valid_to      timestamptz,
  changeset_id  uuid not null references changeset
);

create unique index assumption_current_idx
  on assumption (coalesce(house_id, '00000000-0000-0000-0000-000000000000'::uuid), key)
  where valid_to is null;

-- Saved forecasts, to see how the assessment of a house changes ---------------

create table forecast (
  id             uuid primary key default gen_random_uuid(),
  house_id       uuid not null references house,
  calculated_at  timestamptz not null default now(),
  assumptions    jsonb not null,    -- the assumptions that were used
  result         jsonb not null     -- cost per year and item, total, range
);
