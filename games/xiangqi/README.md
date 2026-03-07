# Xiangqi Game Package

This package contains the Xiangqi rules adapter for Human Agent Playground.

The long-term contract is:

- each game lives in its own folder
- each game exposes its own rules, state, move schema, and metadata
- the platform server and MCP layer switch between games through a catalog and registry

Right now Xiangqi is the first concrete implementation.
