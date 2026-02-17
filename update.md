# Update date by date

- 2026-02-11
  - Update naming convention of each lnage map node -> refference parrent/file node id [x]
  - Add new parsing method for create table as select  [x]
  - Wrap method extend_table -> basically another create for table without select [x]: Integrate with the old parse_sql

- 2026-02-13:
  - Add new delete metjpd for delete from table [x]

- 2026-02-17
  - New tracking column lineage on frontend only trace to the current col's downstream. [x]
  - New attribute to minimize table lineage -> only keep the first query and its downstream tables [x]

  - Fix bug on delete files
  - New config class for configuration?
  - New reader class for reading from source?
