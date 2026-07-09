-- Company legal identifiers printed on the contract header/footer.
alter table agencies add column if not exists legal_name    text;
alter table agencies add column if not exists address       text;
alter table agencies add column if not exists ice           text;
alter table agencies add column if not exists rc            text;
alter table agencies add column if not exists patente       text;
alter table agencies add column if not exists rib           text;
alter table agencies add column if not exists company_phone text;
