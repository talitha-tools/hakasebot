# Home repo is public

GitHub-hosted runners are free only on public repos. A long Engine review burns a Free plan's private minutes. The Home repo is a runner, not a social project.

**Decision.** Home bootstrap creates a public repo. Bootstrap and installation refresh keep it public, and turn off GitHub issues, wiki, projects, discussions, and pull requests (`has_issues`, `has_wiki`, `has_projects`, `has_discussions`, `has_pull_requests`). Pull requests are off entirely, not merely limited to collaborators, so there is no external PR tab. Personal public repos cannot disable forking; that stays accepted.

Actions secrets stay secret. Prefs and sealed vault live in D1 (ADR-0023), not as public git files. We accept that workflow logs are public, including consumer repo names and anything a job prints.
