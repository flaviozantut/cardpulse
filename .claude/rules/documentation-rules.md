---
description: Documentation standards for markdown and config files
globs: "**/*.md, **/*.toml, **/*.yml, **/*.yaml, .env*"
---

# Documentation rules

## README.md
- Must contain: project description, quick setup, environment variables, how to run tests, how to deploy
- Update whenever an endpoint, env var, or dependency is added
- Use code blocks with specified language (```bash, ```rust, ```sql)

## Rust doc comments (`///`)
- Every public struct/enum/trait/function has a doc comment
- First paragraph: WHAT it does (one sentence)
- Second paragraph (optional): HOW it works or relevant details
- `# Examples` section for functions with non-obvious behavior
- `# Errors` section for functions returning Result
- `# Panics` section if the function can panic (ideally never in production)

## Inline comments (`//`)
- Used ONLY to explain the "why", never the "what"
- If code needs a comment explaining what it does, refactor the code
- Exception: regexes and bitwise operations — always comment these

## CHANGELOG
- Maintain a CHANGELOG.md following Keep a Changelog format
- Sections: Added, Changed, Fixed, Removed
- Group by semantic version
