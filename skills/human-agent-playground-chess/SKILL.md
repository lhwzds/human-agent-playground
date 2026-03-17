---
name: human-agent-playground-chess
description: Use this skill when you need Chess rule knowledge for Human Agent Playground sessions, including coordinates, SAN, special moves, and move-quality reasoning.
---

# Human Agent Playground Chess

Use this skill when the task needs Chess-specific rule knowledge. This skill explains the game itself. It does not replace the MCP workflow skill.

For session control, legal-move checks, and shared-play turn loops, use the companion MCP skill at [../human-agent-playground-mcp/SKILL.md](../human-agent-playground-mcp/SKILL.md).

## What this skill covers

- board orientation and coordinates
- piece movement and captures
- check, checkmate, stalemate, and draws
- castling, en passant, and promotion
- SAN and simple coordinate notation used in this project
- reasoning expectations for agent-generated Chess moves

## Board orientation and coordinates

- Files run from `a` to `h` from White's left to right.
- Ranks run from `1` to `8` from White's side upward.
- White starts on ranks `1` and `2`.
- Black starts on ranks `7` and `8`.
- A move like `e2 -> e4` means the piece leaves `e2` and lands on `e4`.

## Piece movement

- King: one square in any direction.
- Queen: any number of squares along ranks, files, or diagonals.
- Rook: any number of squares along ranks or files.
- Bishop: any number of squares along diagonals.
- Knight: an `L` shape, jumping over pieces.
- Pawn:
  - moves forward one square
  - from its starting rank may move forward two squares if clear
  - captures one square diagonally forward
  - promotes on the last rank

## Special rules

### Castling

- Castling moves the king two squares toward a rook and places that rook on the square the king crossed.
- It is legal only if:
  - neither the king nor that rook has moved
  - the squares between them are empty
  - the king is not currently in check
  - the king does not cross or land on an attacked square

### En passant

- En passant is only available immediately after a pawn advances two squares and lands beside an enemy pawn.
- The enemy pawn may capture it as if it had moved only one square.
- If the capture is not taken on the next move, the right disappears.

### Promotion

- A pawn reaching the last rank must promote.
- In this project, move payloads may include a `promotion` field when needed.
- Usual promotion targets are queen, rook, bishop, or knight.

## Game-ending conditions

- Check: the king is under attack.
- Checkmate: the side to move is in check and has no legal move.
- Stalemate: the side to move is not in check but has no legal move.
- Draws may also come from repetition, insufficient material, or other server-supported termination logic.

## Notation in this playground

- Legal move and play payloads use coordinate fields such as:
  - `{ "from": "e2", "to": "e4" }`
- Move details may also include SAN such as:
  - `Nf3`
  - `Qxd5`
  - `O-O`
- SAN is useful for summaries, but legality must always come from the server's legal-move tool or API response.

## Agent reasoning rules for Chess

- Always base the move on the current live position, not on an opening script alone.
- Prefer legal move data from the server over memory.
- Explain why the move is good now:
  - king safety
  - center control
  - development
  - tactical gain
  - threat prevention
- Do not describe a long forced line unless the current position truly justifies it.
- Do not claim a move is legal without checking the current legal-move source.

## Practical reminders

- White moves first.
- If it is not your turn, do not invent a move.
- When the position changes, recompute your plan from the new board state.
- If SAN and coordinate notation seem inconsistent, trust the server state and legal moves first.
