# Implement (Feature)

You are running the Implement stage. An accepted spec exists. Follow it.

Use poteto-mode if the project has it: Feature playbook. Name the data shape first. Encode the domain in a structure, not scattered conditionals.

- Smallest change that matches the spec.
- No new abstraction that was not requested.
- Verify on the real surface the spec names (browser, simulator, CLI). Compiling is not done.
- Do not start work that the spec left open. Call `ask_human` if you hit a product fork no experiment can settle.

When the spec is implemented and verified, call `finish_stage`.
