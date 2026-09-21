# EVA — Product Architecture, Distribution & Launch Specification

## Product direction

EVA must be developed as a production-grade developer AI platform, not only as a college demonstration.

The college major project is the first major milestone of the same architecture that can later become a public developer product.

Target:

```text
Developer
  ↓
Terminal installation
  ↓
Secure first-run setup
  ↓
Explicit permission approval
  ↓
EVA creates its own controlled workspace
  ↓
AI provider/model setup
  ↓
Environment health check
  ↓
EVA becomes the developer's AI operating assistant
```

Supported operating systems:

- macOS
- Linux

Explicitly unsupported:

- Windows

Windows must be detected and rejected cleanly rather than partially installed.

---

# 1. Product positioning

EVA is:

> A private AI operating layer for developers that understands natural language, plans work, coordinates AI coding agents, controls the development environment, executes tools, verifies results, and keeps the developer in control.

EVA is not merely a chatbot, voice transcription app, shell wrapper, macro recorder, or Claude Code launcher.

Core loop:

```text
Human
 ↓
Voice / Text / CLI
 ↓
Intent
 ↓
Context
 ↓
Planning
 ↓
AI Model Selection
 ↓
Policy / Permissions
 ↓
Tools
 ↓
Execution
 ↓
Observation
 ↓
Verification
 ↓
Memory / Audit
 ↓
Human
```

# 2. Major college-project scope

The academic project should demonstrate real systems engineering.

## AI

- LLM orchestration
- multi-model planning
- structured tool calling
- intent resolution
- agent loops
- context management
- memory
- vision
- evaluation

## Software engineering

- modular architecture
- APIs
- package/distribution system
- testing
- CI/CD
- versioning
- logging
- documentation

## Systems engineering

- process management
- terminal automation
- application discovery
- environment inspection
- OS interaction

## Cybersecurity

- authentication
- authorization
- secure secret storage
- encrypted communication
- least privilege
- prompt-injection defenses
- command-injection defenses
- audit trails
- secure update mechanisms

## HCI

- voice interaction
- conversational context
- approval flows
- task status
- understandable failures

# 3. Platform strategy

## macOS

Primary platform.

Target Apple Silicon first; Intel compatibility should be added only when it does not compromise the architecture.

Public macOS artifacts should use Apple-supported code signing, Hardened Runtime, and notarization.

## Linux

Support a defined set of tested mainstream distributions first rather than claiming universal Linux support.

Potential artifacts:

```text
tar.gz
.deb
.rpm
AppImage
package-manager distribution
```

The core agent must still work in terminal/headless environments.

## Windows

Not supported.

The installer must detect Windows and stop with a clear message. It must not leave a partially installed system.

# 4. Installation experience

EVA should be installable from a terminal command.

The production installer must:

1. detect operating system
2. detect CPU architecture
3. resolve the desired release
4. download the correct artifact
5. verify cryptographic integrity/signature
6. install only after verification succeeds
7. create required user directories
8. register services only when needed and with user awareness
9. launch first-run setup

Do not design the installer around blindly executing unverified remote shell content.

Preferred flow:

```text
download
 ↓
verify signature/checksum
 ↓
install
```

# 5. Distribution channels

The release system should eventually support:

```text
official installer
direct signed release
package-manager distribution
```

The official release page should publish:

- release artifacts
- checksums
- signatures
- versions
- release notes
- supported platform/architecture matrix

# 6. Installable architecture

Separate the product into:

```text
EVA CLI / Voice UI
        ↓
EVA Agent Runtime
        ↓
EVA AI Router
        ↓
EVA Policy Engine
        ↓
EVA Tool Bus
        ↓
OS / Browser / Terminal / Coding Agents
```

Additional services:

```text
Memory
Storage
Audit
Update Manager
Health System
Provider Manager
Phone Communication
```

# 7. EVA home directory

During first-run setup, EVA must create a private application workspace using normal per-user locations for the host OS.

Conceptually:

```text
EVA_HOME/
├── config/
├── logs/
├── sessions/
├── plans/
├── memory/
├── cache/
├── artifacts/
├── tasks/
├── audit/
├── providers/
├── state/
├── backups/
└── workspace/
```

The implementation must map this to platform-appropriate user-data locations.

Keep credentials separate from normal files, logs, plans, and memory.

# 8. Data retention

Every stored category needs a retention policy.

Example:

```text
cache       → short-lived
screenshots → minimized
logs        → configurable
memory      → persistent until deleted
tasks       → user-controlled
audit       → security-retention policy
credentials → secure OS credential storage
```

Provide a way to inspect and clear EVA data where appropriate.

# 9. First-run setup

First run:

```text
OS detection
 ↓
Architecture detection
 ↓
Installation verification
 ↓
Directory creation
 ↓
Permission explanation
 ↓
Permission requests
 ↓
AI provider setup
 ↓
Model health check
 ↓
Tool discovery
 ↓
System health check
 ↓
Initial configuration
 ↓
Ready
```

Users must understand why each sensitive permission is requested.

# 10. Permission architecture

Use capability-based permissions:

```text
SYSTEM_INFO
APPLICATION_CONTROL
TERMINAL_EXECUTION
FILESYSTEM_READ
FILESYSTEM_WRITE
SCREEN_CAPTURE
INPUT_CONTROL
BROWSER_CONTROL
NETWORK_ACCESS
AI_PROVIDER_ACCESS
CREDENTIAL_ACCESS
EXTERNAL_COMMUNICATION
```

States:

```text
requested
granted
denied
temporary
revoked
```

Do not use a single unrestricted "allow everything" permission.

# 11. AI provider architecture

Do not hard-code EVA around one AI vendor.

Create an abstract provider layer supporting capabilities such as:

```text
chat
streaming
structured output
tool calling
vision
embeddings
health check
```

Provider categories may include:

```text
fast model
reasoning model
coding model
vision model
speech-to-text
text-to-speech
embedding model
local model
specialized agent
```

# 12. AI router

Create an AI Router that selects models using:

```text
task type
capabilities
reasoning complexity
privacy requirement
context size
latency
cost
availability
user preference
verification requirements
```

Example:

```text
simple interaction → fast model
complex plan        → reasoning model
coding task          → coding agent/model
screen task          → vision model
sensitive task       → local model when capable
```

Do not choose models using benchmark score alone.

# 13. Multi-model planning

For complex tasks:

```text
User goal
 ↓
Planner A
Planner B
Planner C
 ↓
Candidate plans
 ↓
Plan evaluator
 ↓
Best plan
```

Score:

```text
goal accuracy
safety
reliability
environment compatibility
verification quality
reversibility
complexity
latency
cost
```

For important tasks, consider multiple independent plans rather than trusting one model.

# 14. AI model registry

Maintain metadata:

```text
provider
model
capabilities
context size
vision support
tool-calling support
cost class
latency class
privacy class
availability
```

Never store provider secrets in this registry.

# 15. AI credentials

Never store API keys in:

- source code
- Git
- logs
- plans
- memory
- screenshots
- ordinary configuration files

Use secure platform credential storage and redact secrets from diagnostics.

# 16. EVA roles

Initial roles:

```text
GENERAL_ASSISTANT
SENIOR_SOFTWARE_DEVELOPER
SOFTWARE_ARCHITECT
SECURITY_ENGINEER
QA_ENGINEER
DEVOPS_ENGINEER
PRODUCT_MANAGER
PROJECT_MANAGER
BUSINESS_PLANNER
RESEARCHER
SYSTEM_OPERATOR
CODE_REVIEWER
```

Roles change reasoning objectives and preferred workflows, never the global security policy.

# 17. Senior developer role

Optimize for:

- codebase inspection
- architecture
- implementation
- tests
- debugging
- security
- performance
- maintainability
- deployment

When coordinating coding agents, inspect context first and generate a professional implementation prompt.

# 18. Senior planner role

Planner mode should produce:

```text
Objective
Current situation
Constraints
Assumptions
Options
Recommendation
Rationale
Phases
Dependencies
Risks
Resources
Milestones
Success metrics
Contingencies
```

Planner mode remains advisory unless execution is explicitly requested.

# 19. Coding-agent coordination

Treat Claude Code and other coding agents as tools/providers inside EVA.

Workflow:

```text
Inspect repository
 ↓
Understand goal
 ↓
Choose coding agent
 ↓
Generate technical prompt
 ↓
Start/attach coding session
 ↓
Monitor
 ↓
Inspect results
 ↓
Test
 ↓
Verify
 ↓
Recover/escalate
```

Do not blindly forward the user's raw sentence.

# 20. Professional developer prompts

A prompt generated for a coding agent should include, where relevant:

```text
objective
repository context
architecture
relevant files
requirements
constraints
security requirements
testing requirements
acceptance criteria
definition of done
```

# 21. CLI-first product

Core command family:

```bash
eva
eva setup
eva doctor
eva status
eva ask
eva run
eva plan
eva permissions
eva models
eva devices
eva logs
eva config
eva update
eva uninstall
```

The exact names can evolve, but the CLI remains foundational.

# 22. Terminal intelligence

Every terminal operation must resolve:

```text
command
working directory
shell
environment
permissions
timeout
expected output
verification
```

Never blindly execute arbitrary model-generated shell strings. Prefer validated structured tools.

# 23. Project discovery

EVA may index permitted development projects and store lightweight metadata:

```text
project name
path
technology
Git repository
branch
last activity
preferred tools
```

Do not unnecessarily index private project content.

# 24. Environment awareness

When permitted, understand:

```text
OS
architecture
shell
installed apps
available runtimes
package managers
development tools
running services
active project
available AI agents
```

Read-only discovery is the default.

# 25. Health system

Provide:

```bash
eva doctor
```

Check:

```text
installation
permissions
AI providers
network
storage
terminal
Git
coding agents
browser
screen access
configuration
update state
```

Report `PASS`, `WARN`, or `FAIL` with actionable remediation.

# 26. Secure update architecture

```text
Check release metadata
 ↓
Verify metadata
 ↓
Download update
 ↓
Verify signature/integrity
 ↓
Stage
 ↓
Backup relevant state
 ↓
Install
 ↓
Health check
 ↓
Rollback if needed
```

Never install an unverified update.

# 27. Versioning and release channels

Use semantic versioning:

```text
MAJOR.MINOR.PATCH
```

Release channels:

```text
stable
beta
nightly
```

Stable is the default.

# 28. Supply-chain security

Public releases should provide:

```text
checksums
signatures
release provenance
SBOM
dependency audit
vulnerability scanning
build metadata
```

Protect signing credentials. Evaluate Sigstore/Cosign or an equivalent artifact-signing system for cross-platform releases.

# 29. CI/CD

Every change:

```text
checkout
 ↓
install dependencies
 ↓
lint
 ↓
typecheck
 ↓
unit tests
 ↓
integration tests
 ↓
security checks
 ↓
build
```

Release:

```text
build
 ↓
test
 ↓
package
 ↓
sign
 ↓
publish
 ↓
verify
 ↓
release notes
```

# 30. macOS distribution

For public macOS distribution:

- sign executables
- use Developer ID distribution where appropriate
- enable Hardened Runtime
- use only necessary entitlements
- notarize releases
- test Gatekeeper behavior

# 31. Linux distribution

Start with a limited set of tested Linux targets rather than claiming every distribution.

Possible formats:

```text
tar.gz
.deb
.rpm
AppImage
package-manager distribution
```

The core agent should also function in terminal/headless environments.

# 32. Phone architecture

The phone should provide:

```text
voice
task status
approvals
notifications
device management
security
history
```

The primary execution environment remains the host machine.

# 33. Task workspace

Every significant task receives an ID.

Example:

```text
tasks/
└── task-<id>/
    ├── task.json
    ├── plan.md
    ├── events.jsonl
    ├── outputs/
    ├── artifacts/
    └── summary.md
```

# 34. Plan storage

Significant plans are human-readable artifacts:

```text
plans/
└── <date>-<task-name>/
    ├── plan.md
    ├── decisions.md
    ├── risks.md
    └── status.json
```

# 35. Logging and audit

Use structured logs:

```text
DEBUG
INFO
WARN
ERROR
SECURITY
AUDIT
```

Audit important events:

```text
session
device
task
requested action
authorization
approval
execution
verification
failure
recovery
```

Distinguish `REQUESTED`, `AUTHORIZED`, `EXECUTED`, and `VERIFIED`.

# 36. Privacy

Prefer local processing where practical.

Minimize transmission of:

- screenshots
- source code
- private files
- credentials
- personal conversations

When cloud AI is used, expose provider, model, data being sent, and reason for sending it where practical.

# 37. Offline/degraded mode

Expose:

```text
ONLINE
DEGRADED
OFFLINE
```

When cloud AI is unavailable, retain local capabilities such as CLI, diagnostics, local tools, configured local models, and health checks.

Never pretend an unavailable model completed a task.

# 38. Security threat model

Explicitly test:

```text
prompt injection
malicious AI output
malicious webpages
malicious repositories
malicious files
compromised integrations
stolen credentials
stolen phone
session replay
local malicious processes
supply-chain attacks
tampered releases
privilege escalation
command injection
path traversal
data exfiltration
```

The AI model is never the final authorization authority.

# 39. User trust model

The user should be able to determine:

```text
What is EVA doing?
Why?
Which tool?
What permission?
Which AI model?
What data is being transmitted?
What changed?
What happened?
Can it be undone?
```

# 40. College demonstration

Demonstrate in a controlled environment:

```text
terminal installation
first-run setup
permission system
AI provider setup
health check
voice
project discovery
planning
multi-model plan evaluation
developer mode
Claude Code orchestration
terminal operation
verification
logs
plans
failure recovery
security rejection
```

Use controlled test projects and safe fake credentials.

# 41. Public product roadmap

## Stage A — College MVP

- CLI
- secure installer
- macOS
- Linux
- AI provider abstraction
- terminal
- project discovery
- planning
- Claude Code integration
- logs
- plans
- permissions
- health checks

## Stage B — Developer Beta

- voice
- browser
- desktop automation
- phone interface
- memory
- multi-agent planning
- advanced verification
- secure updates

## Stage C — Public Developer Product

- broad integrations
- local models
- plugin ecosystem
- advanced workflows
- team configuration
- stronger observability
- richer security controls

# 42. Plugin/tool ecosystem

Long-term plugins should declare:

```text
name
version
capabilities
permissions
inputs
outputs
security requirements
verification strategy
```

Plugins must not automatically receive unrestricted access.

# 43. Reliability philosophy

Do not promise that EVA will never fail.

Design it so failure is:

```text
detected
bounded
safe
logged
recoverable where possible
visible
diagnosable
```

When state or authorization is uncertain:

```text
SAFE STOP
```

# 44. Public-release gate

Do not launch publicly until:

- supported-platform installation works
- Windows is cleanly rejected
- release artifacts are verified
- macOS releases are signed/notarized
- secrets use secure storage
- permissions work
- dangerous actions require approval
- logging/audit work
- tasks are inspectable
- results are verified
- failure recovery is tested
- update verification works
- rollback works
- documentation exists
- CI is green
- no known critical security issue remains

# 45. AI coding-agent directive

The coding agent must treat this document as the product and distribution specification.

Before every major change:

1. inspect the repository
2. inspect architecture
3. inspect build/package system
4. inspect agent/tool system
5. inspect security controls
6. inspect tests
7. identify the current phase
8. propose the smallest safe change
9. implement
10. test
11. verify
12. document

Do not rebuild EVA blindly.

Do not remove working functionality without replacement and regression testing.

Do not create platform-specific hacks that damage the shared architecture.

Build a real product that can evolve from the college major project into a public developer platform.

# 46. Final product standard

EVA must ultimately be:

- installable from terminal
- focused on macOS and Linux
- explicitly unsupported on Windows
- self-contained
- permission-driven
- secure by default
- AI-provider agnostic
- multi-model capable
- able to coordinate coding agents
- able to plan
- able to execute tools
- able to verify results
- able to recover safely
- able to maintain structured plans, logs, memory, and audit data
- professionally packaged
- updateable
- auditable
- testable
- extensible
- trustworthy

The objective is not the most impressive demo. The objective is a system developers can install, understand, trust, and use every day.
