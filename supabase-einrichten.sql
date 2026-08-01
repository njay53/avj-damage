-- ===================================================================
-- Schadenmanager — Tabellen fuer Supabase
--
-- Diese Datei darf beliebig oft ausgefuehrt werden. Jede Anweisung
-- prueft vorher, ob es das schon gibt. Es gehen also keine Daten
-- verloren, egal ob das Projekt neu ist oder schon laeuft.
--
-- Ablauf: Supabase -> SQL Editor -> New query -> alles einfuegen -> Run.
-- Kommen spaeter neue Felder dazu, aendert sich nur diese Datei, und du
-- fuegst sie einfach nochmal komplett ein.
--
-- Enthaelt keine Kundendaten.
-- ===================================================================

-- ------------------------------------------------------------- Tabellen

-- Kategorien des Fuhrparks, frei pflegbar in den Einstellungen
create table if not exists public.categories (
  id          text primary key,
  name        text not null default '',
  sort        integer not null default 0,
  deleted     boolean not null default false,
  updated_at  bigint  not null default 0
);

-- Fahrzeuge
create table if not exists public.vehicles (
  id          text primary key,
  name        text not null default '',
  plate       text not null default '',
  deleted     boolean not null default false,
  updated_at  bigint  not null default 0
);

-- Schaeden und Zustandsaufnahmen (ein Datensatz je Eintrag, mit Bilderliste)
create table if not exists public.damages (
  id          text primary key,
  vehicle_id  text not null,
  images      jsonb   not null default '[]'::jsonb,
  description text not null default '',
  date        text not null default '',
  deleted     boolean not null default false,
  updated_at  bigint  not null default 0
);

-- Eingefrorene Schadensstaende
create table if not exists public.snapshots (
  id            text primary key,
  code          text not null default '',
  vehicle_id    text not null default '',
  vehicle_name  text not null default '',
  vehicle_plate text not null default '',
  reference     text not null default '',
  created_at    bigint not null default 0,
  damages       jsonb  not null default '[]'::jsonb,
  deleted       boolean not null default false,
  updated_at    bigint  not null default 0
);

-- ------------------------------------------------------------- Spalten
-- Alles, was nach der ersten Fassung dazugekommen ist. "if not exists"
-- heisst: vorhandene Spalten bleiben unangetastet, samt Inhalt.

-- category_id = Kennung der Kategorie (leer = ohne Zuordnung)
-- hidden      = aus der Uebersicht ausgeblendet (Langzeitmieten)
-- zustand     = fuehrt dieses Fahrzeug Zustandsaufnahmen?
-- vin         = Fahrgestellnummer, optional
-- photo       = kleines Fahrzeugbild fuer die Uebersicht (Base64, max. 640 px)
alter table public.vehicles add column if not exists category_id text    not null default '';
alter table public.vehicles add column if not exists hidden      boolean not null default false;
alter table public.vehicles add column if not exists zustand     boolean not null default false;
alter table public.vehicles add column if not exists vin         text    not null default '';
alter table public.vehicles add column if not exists photo       text    not null default '';

-- count      = wie viele Schaeden dieser Eintrag umfasst (ein Foto, drei Kratzer)
-- date_mode  = exact | unknown | stock
-- created_at = wann erfasst wurde (immer gesetzt, zaehlt als Nachweis)
-- area       = Bereich am Fahrzeug bzw. Motiv der Aufnahme
-- kind       = schaden | zustand (Zustandsaufnahmen zaehlen nicht als Schaden)
-- km         = Kilometerstand bei einer Zustandsaufnahme, optional
-- anlass     = uebergabe | rueckgabe | zwischen | uebernahme | sonstiges
alter table public.damages add column if not exists count       integer not null default 1;
alter table public.damages add column if not exists date_mode   text    not null default 'exact';
alter table public.damages add column if not exists created_at  bigint  not null default 0;
alter table public.damages add column if not exists area        text    not null default '';
alter table public.damages add column if not exists kind        text    not null default 'schaden';
alter table public.damages add column if not exists km          text    not null default '';
alter table public.damages add column if not exists anlass      text    not null default '';

-- Interne Angaben. Erscheinen auf keinem Kundendokument.
-- status     = offen | ausgebessert | repariert | bleibt
-- schaetzung = geschaetzte Schadenhoehe in Euro
-- zahlung    = was der Mieter tatsaechlich gezahlt hat
-- kosten     = was die Reparatur gekostet hat
-- vertragsnr = Mietvertragsnummer aus rentsoft, bewusst KEIN Kundenname
alter table public.damages add column if not exists status      text    not null default 'offen';
alter table public.damages add column if not exists schaetzung  numeric;
alter table public.damages add column if not exists zahlung     numeric;
alter table public.damages add column if not exists kosten      numeric;
alter table public.damages add column if not exists vertragsnr  text    not null default '';

-- nr          = durchlaufende Nummer je Fahrzeug bzw. je Schaden ("1.3")
-- archived    = Fahrzeug ist raus aus dem Bestand, Daten bleiben
-- hu          = naechste Hauptuntersuchung als Monat (JJJJ-MM), faellig zum Monatsende
-- deleted_at  = Zeitpunkt der Loeschung, steuert den Papierkorb
alter table public.vehicles add column if not exists nr          integer not null default 0;
alter table public.vehicles add column if not exists archived    boolean not null default false;
alter table public.vehicles add column if not exists hu          text    not null default '';
alter table public.damages  add column if not exists nr          integer not null default 0;
alter table public.damages  add column if not exists deleted_at  bigint  not null default 0;

-- regulierung = mieter | kasko | teilkasko | haftpflicht | selbst
-- erstattung  = was die Versicherung bzw. der Gegner gezahlt hat
alter table public.damages add column if not exists regulierung text    not null default 'mieter';
alter table public.damages add column if not exists erstattung  numeric;

-- ------------------------------------------------------------- Indizes
-- Der Abgleich fragt immer "was ist neuer als ...", das laeuft darueber.

create index if not exists idx_vehicles_updated   on public.vehicles   (updated_at);
create index if not exists idx_damages_updated    on public.damages    (updated_at);
create index if not exists idx_snapshots_updated  on public.snapshots  (updated_at);
create index if not exists idx_categories_updated on public.categories (updated_at);
create index if not exists idx_damages_vehicle    on public.damages    (vehicle_id);

-- ------------------------------------------------------------- Zugriffsschutz
-- Der wichtigste Block. Ohne ihn koennte jeder, der die Adresse der App
-- kennt, die Daten lesen — der oeffentliche Schluessel steht ja im
-- Browser. Mit ihm kommt nur durch, wer angemeldet ist.

alter table public.vehicles   enable row level security;
alter table public.damages    enable row level security;
alter table public.snapshots  enable row level security;
alter table public.categories enable row level security;

drop policy if exists "angemeldete duerfen alles" on public.vehicles;
drop policy if exists "angemeldete duerfen alles" on public.damages;
drop policy if exists "angemeldete duerfen alles" on public.snapshots;
drop policy if exists "angemeldete duerfen alles" on public.categories;

create policy "angemeldete duerfen alles" on public.vehicles
  for all to authenticated using (true) with check (true);
create policy "angemeldete duerfen alles" on public.damages
  for all to authenticated using (true) with check (true);
create policy "angemeldete duerfen alles" on public.snapshots
  for all to authenticated using (true) with check (true);
create policy "angemeldete duerfen alles" on public.categories
  for all to authenticated using (true) with check (true);
