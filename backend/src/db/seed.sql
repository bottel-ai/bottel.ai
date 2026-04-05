INSERT OR IGNORE INTO apps (id, name, slug, description, long_description, category, author, version, rating, reviews, installs, capabilities, size, verified) VALUES
('code-reviewer', 'Code Reviewer', 'code-reviewer', 'Reviews pull requests for bugs, style issues, and security vulnerabilities. Supports 20+ languages.', 'Code Reviewer is an advanced static analysis agent that combines deep code understanding with security best practices. It reviews your pull requests line-by-line, identifies potential bugs, suggests performance improvements, and flags security vulnerabilities before they reach production.

Supported languages: Python, JavaScript, TypeScript, Go, Rust, Java, C++, Ruby, PHP, Swift, Kotlin, and more.

Integrations: GitHub, GitLab, Bitbucket, Azure DevOps.', 'Productivity', 'bottel', '2.4.1', 4.9, 2847, 45200, '["code-review","security","best-practices"]', '12 MB', 1);

INSERT OR IGNORE INTO apps (id, name, slug, description, long_description, category, author, version, rating, reviews, installs, capabilities, size, verified) VALUES
('translator', 'Universal Translator', 'translator', 'Translates text between 95 languages with cultural context and tone preservation.', 'Universal Translator goes beyond word-for-word translation. It understands cultural nuance, preserves tone and intent, and handles domain-specific terminology for legal, medical, technical, and marketing content.

Features:
- 95 language pairs
- Context-aware translation
- Glossary support for custom terminology
- Batch translation for large documents
- API rate: 10,000 words/minute', 'Business', 'linguo.ai', '3.1.0', 4.7, 1923, 38100, '["translation","localization","nlp"]', '8 MB', 1);

INSERT OR IGNORE INTO apps (id, name, slug, description, long_description, category, author, version, rating, reviews, installs, capabilities, size, verified) VALUES
('security-scanner', 'SecureBot', 'security-scanner', 'Scans codebases for OWASP Top 10 vulnerabilities, secrets, and dependency risks.', 'SecureBot provides continuous security scanning for your entire codebase. It detects hardcoded secrets, SQL injection, XSS, CSRF, insecure dependencies, and more.

Features:
- OWASP Top 10 coverage
- Secret detection (API keys, passwords, tokens)
- Dependency vulnerability scanning
- SBOM generation
- CI/CD integration
- Compliance reporting (SOC2, HIPAA, PCI-DSS)', 'Utilities', 'shieldai', '1.8.3', 4.8, 1456, 29800, '["security","vulnerability-scanning","compliance"]', '15 MB', 1);

INSERT OR IGNORE INTO apps (id, name, slug, description, long_description, category, author, version, rating, reviews, installs, capabilities, size, verified) VALUES
('devops-pilot', 'DevOps Pilot', 'devops-pilot', 'Manages CI/CD pipelines, Docker containers, and Kubernetes deployments from natural language.', 'DevOps Pilot translates natural language instructions into infrastructure actions. Tell it what you want deployed and it generates Dockerfiles, Kubernetes manifests, GitHub Actions workflows, and Terraform configs.

Supports:
- Docker & Docker Compose
- Kubernetes (EKS, GKE, AKS)
- Terraform & Pulumi
- GitHub Actions, GitLab CI, CircleCI
- AWS, GCP, Azure', 'Utilities', 'infrabot', '2.0.0', 4.6, 987, 18500, '["devops","ci-cd","kubernetes","docker"]', '20 MB', 1);

INSERT OR IGNORE INTO apps (id, name, slug, description, long_description, category, author, version, rating, reviews, installs, capabilities, size, verified) VALUES
('data-analyst', 'DataBot', 'data-analyst', 'Analyzes datasets, generates SQL queries, creates visualizations, and produces reports.', 'DataBot connects to your databases and data warehouses to answer questions in natural language. Ask it anything about your data and it writes the SQL, runs the query, and presents the results.

Connectors:
- PostgreSQL, MySQL, SQLite
- BigQuery, Snowflake, Redshift
- CSV, Parquet, JSON files
- REST APIs', 'Education', 'analytix', '1.5.2', 4.5, 756, 14200, '["data-analysis","sql","visualization"]', '18 MB', 1);

INSERT OR IGNORE INTO apps (id, name, slug, description, long_description, category, author, version, rating, reviews, installs, capabilities, size, verified) VALUES
('test-writer', 'TestGen', 'test-writer', 'Generates comprehensive test suites from your source code. Unit, integration, and e2e tests.', 'TestGen reads your codebase and generates meaningful tests with high coverage. It understands your code''s intent and creates tests that catch real bugs, not just hit line numbers.

Frameworks: Jest, Vitest, Pytest, Go testing, JUnit, RSpec
Test types: Unit, Integration, E2E, Property-based, Snapshot', 'Productivity', 'bottel', '1.3.0', 4.4, 634, 12800, '["testing","code-generation","qa"]', '10 MB', 1);

INSERT OR IGNORE INTO apps (id, name, slug, description, long_description, category, author, version, rating, reviews, installs, capabilities, size, verified) VALUES
('doc-generator', 'DocBot', 'doc-generator', 'Generates API docs, README files, and technical documentation from your codebase.', 'DocBot scans your code and generates comprehensive documentation. It creates API references, guides, tutorials, and README files that stay in sync with your code.

Outputs: Markdown, HTML, OpenAPI/Swagger, JSDoc, Sphinx', 'Productivity', 'writecraft', '2.1.0', 4.3, 521, 9800, '["documentation","api-docs","writing"]', '7 MB', 0);

INSERT OR IGNORE INTO apps (id, name, slug, description, long_description, category, author, version, rating, reviews, installs, capabilities, size, verified) VALUES
('refactor-bot', 'Refactor Pro', 'refactor-bot', 'Refactors messy code into clean, maintainable patterns. Detects code smells automatically.', 'Refactor Pro identifies code smells, suggests refactoring patterns, and can automatically apply safe transformations. It respects your existing patterns and conventions.

Detects: Long methods, god classes, feature envy, duplicate code, dead code, complex conditionals', 'Productivity', 'cleancode', '1.0.5', 4.2, 412, 7600, '["refactoring","code-quality","best-practices"]', '9 MB', 0);

INSERT OR IGNORE INTO apps (id, name, slug, description, long_description, category, author, version, rating, reviews, installs, capabilities, size, verified) VALUES
('sql-wizard', 'SQL Wizard', 'sql-wizard', 'Converts natural language to optimized SQL. Supports PostgreSQL, MySQL, and SQLite.', 'SQL Wizard understands your schema and converts plain English questions into optimized SQL queries. It explains query plans and suggests index improvements.', 'Education', 'analytix', '1.2.0', 4.6, 689, 11300, '["sql","database","optimization"]', '6 MB', 1);

INSERT OR IGNORE INTO apps (id, name, slug, description, long_description, category, author, version, rating, reviews, installs, capabilities, size, verified) VALUES
('research-agent', 'DeepResearch', 'research-agent', 'Researches topics across papers, docs, and the web. Compiles structured reports.', 'DeepResearch performs multi-source research on any topic. It reads academic papers, documentation, articles, and synthesizes findings into structured reports with citations.', 'Education', 'scholaris', '1.1.0', 4.4, 445, 8900, '["research","summarization","citations"]', '11 MB', 1);

INSERT OR IGNORE INTO apps (id, name, slug, description, long_description, category, author, version, rating, reviews, installs, capabilities, size, verified) VALUES
('k8s-helper', 'KubeAssist', 'k8s-helper', 'Troubleshoots Kubernetes clusters, generates manifests, and monitors pod health.', 'KubeAssist is your Kubernetes co-pilot. It diagnoses pod failures, generates YAML manifests, manages helm charts, and provides real-time cluster health monitoring.', 'Utilities', 'infrabot', '1.4.0', 4.5, 534, 10100, '["kubernetes","devops","monitoring"]', '14 MB', 1);

INSERT OR IGNORE INTO apps (id, name, slug, description, long_description, category, author, version, rating, reviews, installs, capabilities, size, verified) VALUES
('copywriter', 'CopyBot', 'copywriter', 'Writes marketing copy, landing pages, emails, and social media posts.', 'CopyBot generates high-converting marketing copy tailored to your brand voice. It A/B tests headlines, writes email sequences, and creates social media content calendars.', 'Business', 'writecraft', '2.0.1', 4.3, 378, 7200, '["copywriting","marketing","content"]', '5 MB', 0);

INSERT OR IGNORE INTO apps (id, name, slug, description, long_description, category, author, version, rating, reviews, installs, capabilities, size, verified) VALUES
('vuln-hunter', 'VulnHunter', 'vuln-hunter', 'Actively probes your APIs and endpoints for security vulnerabilities.', 'VulnHunter performs active security testing against your APIs. It fuzzes endpoints, tests authentication flows, checks for injection attacks, and generates detailed vulnerability reports.', 'Utilities', 'shieldai', '1.2.0', 4.7, 623, 11800, '["penetration-testing","api-security","fuzzing"]', '22 MB', 1);

INSERT OR IGNORE INTO apps (id, name, slug, description, long_description, category, author, version, rating, reviews, installs, capabilities, size, verified) VALUES
('api-designer', 'API Architect', 'api-designer', 'Designs RESTful and GraphQL APIs from requirements. Generates OpenAPI specs.', 'API Architect takes your requirements and designs clean, consistent APIs following industry best practices. It generates OpenAPI 3.1 specs, GraphQL schemas, and mock servers.', 'Productivity', 'bottel', '1.0.0', 4.1, 234, 4500, '["api-design","openapi","graphql"]', '8 MB', 0);

INSERT OR IGNORE INTO apps (id, name, slug, description, long_description, category, author, version, rating, reviews, installs, capabilities, size, verified) VALUES
('fact-checker', 'FactCheck', 'fact-checker', 'Verifies claims against trusted sources. Flags misinformation with citations.', 'FactCheck cross-references claims against academic databases, news archives, and official sources. It provides confidence scores and full citation chains for every verification.', 'Education', 'scholaris', '1.0.2', 4.3, 312, 5600, '["fact-checking","verification","research"]', '9 MB', 1);
