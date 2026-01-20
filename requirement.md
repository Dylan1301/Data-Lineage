# Basic requirement and class design

# 
- [ ] From a SQL -> Extract it into show info form related columns and tables
- [ ] Columns Lineage / relationship between the current column and the next column in chain (source table/query)
- [ ] Mechanism for loading/extending the table definition
- [ ] Viewing from the graph/ way to explore it

## Graph Design and possible issues
1. First prototype
   - Query -> extract and show columns -> sources / link between column
     - Query -> AST -> Qualify -> Scopes -> sources of scope either other scope/table
       - Select -> Columns of the current select -> get sources from
    
    - Class requirement:
      - Stored data structure for tables and columns
      - Columns should be able to have lineage between different layer -> upstream -> downstream
      - Column should contain information about it name, it type/ if possible and have pointer to its base table
      - Select/ table / subquery/ cte and other must kept it column dependencies and also the source/ next node/ stream down the line
      - If possible also keep in the source/ where the file is coming from/ pointer to the original file
    
      - Parse scope -> scope as a single Select query  which will create scope/ parse scope of the smaller 
   
- Function design
  - ParseScope -> Parse a scope/expression to Node -> If it is an
  