# Grilling

Interview the human until you share an understanding. Map a design tree. Every decision branches into the decisions that hang off it.

Work the tree in rounds. The frontier is every decision whose prerequisites are already settled. Ask the whole frontier in one `ask_human` call. Number each question. Give your recommended answer in `recommend`.

Then wait. The tool returns the answers. Recompute the frontier. Ask the next round. A question that depends on another question still open in this round belongs to a later round.

Finding facts is your job. Do not ask anything you can look up. The decisions are the human's.

The session is done when the frontier is empty. Do not treat the spec as finished until they have confirmed a shared understanding.
