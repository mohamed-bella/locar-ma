-- Agency stamp / cachet image, auto-placed in the contract signature block.
alter table agencies add column if not exists stamp_url text;
