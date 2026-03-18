# Contributing to Private MCP

Thanks for your interest in Private MCP! This is a personal project that I've open-sourced so others can deploy their own private thought capture system on AWS. Contributions are welcome.

## Getting Started

1. Fork the repo and clone your fork
2. Follow the setup instructions in [DEVELOPER.md](DEVELOPER.md)
3. Create a feature branch from `main`

## Development

```bash
npm install
npm run build       # TypeScript compile
npm run synth       # Validate CDK templates
```

Read [ARCHITECTURE.md](ARCHITECTURE.md) for how the system fits together before making changes.

## Guidelines

- **Keep Lambdas self-contained.** Each Lambda has its own `functions/` and `utils/` directories. No shared code across Lambdas.
- **CDK conventions.** Never hardcode stack outputs. Pass between stacks via props. Tag all resources.
- **S3 Vectors gotchas.** Filter out empty arrays before `PutVectors` calls. Use both `vector-bucket/` and `bucket/` ARN prefixes.
- **TypeScript.** The project uses TypeScript throughout — CDK, Lambdas, and types.
- **No secrets.** Never commit `.env` files, API keys, account IDs, or other deployment-specific values.

## Submitting Changes

1. Keep PRs focused — one feature or fix per PR
2. Include a clear description of what changed and why
3. Make sure `npm run build` and `npm run synth` pass
4. Test against your own AWS account if the change touches infrastructure

## Reporting Issues

Open an issue describing the problem, expected behavior, and steps to reproduce. Include your CDK and Node.js versions if relevant.

## License

By contributing, you agree that your contributions will be licensed under the same [MIT License](LICENSE) that covers this project.
