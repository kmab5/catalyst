# core

Owner: Agent A. Import shared and engine dependencies; never server, web or cli. Implements 04 Architecture through 08 API, 11 Health and 12 Configuration in [the specification](../../plan/docs/README.md).

The parser uses web-tree-sitter 0.22.6 with tree-sitter-wasms 0.1.13. Run the structural fixture tests when updating either package to verify the grammar ABI.
