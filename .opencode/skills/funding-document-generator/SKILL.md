---
name: funding-document-generator
description: Generates structured funding proposals (Förderanträge) from project data. Extracts milestones, budget items, impact metrics, and sustainability plans from the codebase and documentation for civic-tech grant applications.
license: MIT
compatibility: opencode
metadata:
  audience: documentation-agent
  workflow: funding
  domain: civic-tech
---
## Core Purpose

Generate professional funding proposals for civic-tech and non-profit software projects. Extract project data from code, docs, and issues to populate standardized funding templates.

## Data Sources

### Required Inputs (extracted from project)
- **Project description:** From README.md and AGENTS.md
- **Feature list:** From specs/ directory and GitHub Milestones
- **Tech stack:** From package.json, Cargo.toml, etc.
- **Team/Contributors:** From CONTRIBUTORS.md, GitHub contributors
- **License:** From LICENSE file
- **Community metrics:** From GitHub stars, forks, issues, contributors

### Generated Sections

#### 1. Executive Summary (Zusammenfassung)
- Project mission and social impact
- Problem being solved
- Target audience / beneficiaries
- Unique value proposition

#### 2. Project Description (Projektbeschreibung)
- Detailed feature breakdown
- Architecture overview (from ADRs)
- Technology choices with justification
- Development methodology (Spec-Driven / Agile)

#### 3. Work Plan (Arbeitsplan)
- Milestones extracted from GitHub Milestones
- Timeline with dependencies
- Deliverables per milestone
- Risk assessment and mitigation

#### 4. Budget (Kosten- und Finanzierungsplan)
- Personnel costs (developer hours × rate)
- Infrastructure costs (hosting, domains, tools)
- External services (APIs, SaaS)
- Training and documentation
- Contingency (10-15%)

#### 5. Impact Measurement (Wirkungsmessung)
- Quantitative metrics (users, animals served, shelters onboarded)
- Qualitative impact (user testimonials, case studies)
- Sustainability plan (post-funding operations)
- Open-source community growth

#### 6. DSGVO/Compliance (Datenschutz)
- Data protection concept
- Consent management system
- Data minimization strategy
- Audit trail documentation

## Templates
Use `.opencode/templates/funding-proposal-template.md` for structure.

## Validation
- All budget numbers must be traceable to data source
- All milestones must map to GitHub Milestones
- No fabricated impact numbers — cite source or mark as "[ESTIMATE]"

## Prohibited
- Fabricating impact metrics
- Overpromising deliverables not in specification
- Claiming community size without data
- Generating entirely fictional budget lines
