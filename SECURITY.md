# Security policy

## Supported versions

Security fixes target the current default branch. Update to its latest revision before checking whether an issue still reproduces.

## Reporting a vulnerability

Do not publish exploitable vulnerabilities or secrets in a public issue. Use the repository's **Security → Report a vulnerability** option when private vulnerability reporting is enabled. Otherwise use a private contact listed on the maintainer's GitHub profile, or GitHub's private reporting tools. A response time is not guaranteed.

Include the affected revision, reproduction steps, impact and a minimal proof of concept. Do not access other users' data, disrupt services or include real credentials.

The simulator runs locally in the browser and stores preferences in local storage. Exported telemetry describes a driving session; inspect it before sharing. Third-party dependencies and development tooling remain part of the security surface.
