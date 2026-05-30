# PFM Chapter 3 Diagram Package

This directory contains report-ready diagram material for the Personal Finance
Manager (PFM) project. The content was prepared from the current React,
Capacitor, FastAPI, Supabase, NVIDIA NIM, and Render configuration in the
repository.

## Contents

- `03_SYSTEM_ANALYSIS_AND_DESIGN_DIAGRAMS.md` contains concise TU BCA diagram
  design rules, the placement of figures in Chapter 3, captions, and short
  diagram explanations.
- `sources/*.puml` contains editable PlantUML sources for UML and design
  figures.
- `sources/includes/tu_minimal_style.puml` contains the shared monochrome,
  no-fill, orthogonal report style used by the PlantUML diagrams.
- `sources/04_activity_diagram.dot`, `sources/07_dfd_level_0.dot`, and
  `sources/08_dfd_level_1.dot` contain Graphviz sources for compact,
  readable activity and data-flow figures.
- `rendered/` contains the exported figure images for insertion in the report.
  PNG previews beside source files may also be produced by local validation;
  use the figures in `rendered/` for submission.

## Rendering

PlantUML is used because it supports standard UML symbols for use cases,
classes, messages, activities, components, and deployment nodes. Render all
sources to SVG using:

```bash
java -Djava.awt.headless=true -jar plantuml.jar -tsvg -o ../rendered docs/diagrams/sources/*.puml
java -Djava.awt.headless=true -jar plantuml.jar -tpng -o ../rendered/png docs/diagrams/sources/*.puml
dot -Tsvg docs/diagrams/sources/04_activity_diagram.dot -o docs/diagrams/rendered/04_activity_diagram.svg
dot -Tpng docs/diagrams/sources/04_activity_diagram.dot -o docs/diagrams/rendered/png/04_activity_diagram.png
dot -Tsvg docs/diagrams/sources/07_dfd_level_0.dot -o docs/diagrams/rendered/07_dfd_level_0.svg
dot -Tpng docs/diagrams/sources/07_dfd_level_0.dot -o docs/diagrams/rendered/png/07_dfd_level_0.png
dot -Tsvg docs/diagrams/sources/08_dfd_level_1.dot -o docs/diagrams/rendered/08_dfd_level_1.svg
dot -Tpng docs/diagrams/sources/08_dfd_level_1.dot -o docs/diagrams/rendered/png/08_dfd_level_1.png
```

PNG files are suitable for Word-based report preparation. SVG or PDF is
preferable where the report tool supports it, because text and relationship
lines remain sharp.

## Important Schema Note

No SQL migration or exported Supabase schema is present in this repository.
Table names, fields, and relationships in the ER and schema figures are
therefore derived from current frontend queries and inserts. Before final
submission, compare the database schema diagram with the live Supabase table
definitions and row-level security configuration.
