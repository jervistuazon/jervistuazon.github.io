---
name: performance-audit
description: Review front-end performance risk areas and propose low-risk optimizations for web portfolio pages.
---

# Performance Audit

## Use When
- Investigating slow loads, jank, or heavy media usage.
- Preparing a performance optimization plan.

## Audit Checklist
- Media payload size and compression strategy.
- Render-blocking resources.
- Excessive layout shifts and long main-thread tasks.
- Animation smoothness and scroll responsiveness.

## Workflow
1. Inspect page structure and asset references.
2. Identify highest-cost assets and runtime hotspots.
3. Propose prioritized fixes with expected impact.
4. Keep recommendations separated from code changes unless requested.

## Verification
- Record exact files inspected.
- If changes are made, run project-specific checks before commit.
