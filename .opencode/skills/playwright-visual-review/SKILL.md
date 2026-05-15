---
name: playwright-visual-review
description: Automates visual regression testing via Playwright. Compares screenshots against baselines, runs DOM diffs, accessibility checks, and classifies visual changes. Posts structured results to GitHub.
license: MIT
compatibility: opencode
metadata:
  audience: playwright-agent
  workflow: visual-qa
---
## Core Purpose

Detect visual regressions in web UIs before they reach production. Compare screenshots, DOM structure, and accessibility against known-good baselines.

## Workflow

### 1. Baseline Check
- Does a baseline screenshot exist for this route/viewport?
- NO → Capture baseline, mark as NEW, exit with NEEDS_HUMAN_REVIEW
- YES → Proceed to comparison

### 2. Capture Current State
- Render page at configured viewports (default: 1280x720, 375x812)
- Take full-page screenshot
- Capture DOM snapshot (simplified HTML structure)
- Extract accessibility tree
- Run axe-core for WCAG violations

### 3. Diff Analysis
- **Pixel Diff:** pixelmatch with configurable threshold (default: 0.1%)
- **DOM Diff:** structural comparison (added/removed/changed elements)
- **Text Diff:** visible text content comparison
- **A11y Diff:** accessibility tree changes

### 4. Classification

| Class | Criteria | Action |
|-------|----------|--------|
| REGRESSION | Previously passing, now visually different | BLOCK merge |
| IMPROVEMENT | Previously broken, now matches baseline | APPROVE |
| NEW_BASELINE | No baseline exists for this view | NEEDS REVIEW |
| COSMETIC | Pixel diff < 0.5%, no DOM change | WARNING only |
| A11Y_REGRESSION | New accessibility violations | BLOCK merge |

### 5. Report Generation
Generate structured report at `.opencode/reports/visual-qa/<timestamp>.json`:
```json
{
  "timestamp": "ISO8601",
  "commit": "<sha>",
  "route": "/path",
  "viewport": "1280x720",
  "classification": "REGRESSION|IMPROVEMENT|...",
  "pixel_diff_percent": 0.0,
  "dom_changes": 0,
  "a11y_violations": [],
  "screenshot_diff_path": "<path>",
  "recommendation": "block|warn|approve|review"
}
```

### 6. GitHub Integration
Post structured comment to PR/Issue with:
- Classification badge
- Side-by-side screenshot comparison (if regression)
- Accessibility violation summary
- Recommendation

## Accessibility Standards (WCAG 2.1 AA)
- Color contrast: 4.5:1 (normal text), 3:1 (large text)
- All interactive elements keyboard accessible
- All images have alt text
- Form inputs have associated labels
- Heading hierarchy is logical
- ARIA attributes are valid

## Performance (Slow Hardware Mode)
- Single viewport: 1280x720
- Disable animations (prefers-reduced-motion)
- Wait for network idle (timeout: 30s)
- Skip video recording
- Limit to 5 screenshots per run
