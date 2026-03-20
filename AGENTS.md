# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository implements an x402 (HTTP 402 payment protocol) monetization layer for AWS CloudFront and Lambda@Edge. The intended architecture intercepts HTTP requests at the CloudFront edge, verifies x402 payment tokens via Lambda@Edge, and gates access to backend origins.

Reference: [Monetize Any HTTP Application with x402 and CloudFront + Lambda@Edge](https://builder.aws.com/content/38fLQk6zKRfLnaUNzcLPsUexUlZ/monetize-any-http-application-with-x402-and-cloudfront-lambdaedge)

## Commands

All commands run from the `cdk/` directory:

```bash
# Install dependencies
bun install

# Build TypeScript
npm run build

# Watch mode
npm run watch

# Lint & format (Biome)
npm run format

# Run all tests
npm run test

# Run a single test file
npx jest test/cdk.test.ts

# CDK operations
npx cdk synth       # Generate CloudFormation template
npx cdk diff        # Diff against deployed stack
npx cdk deploy      # Deploy to AWS
```

## Architecture

```
Client HTTP Request
    ↓
Amazon CloudFront
    ↓
Lambda@Edge (viewer-request) ← cdk/functions/lambda-edge/
    │  Validates x402 payment token in Authorization header
    │  Returns HTTP 402 + payment requirements if missing/invalid
    ↓
Origin (API Gateway / ALB / Lambda)
    ↓
Lambda Demo Function ← cdk/functions/lambda-demo/
```

### Key Directories

- `cdk/lib/cdk-stack.ts` — Main CDK Stack. Define all AWS resources here (CloudFront, Lambda@Edge, API Gateway, etc.)
- `cdk/functions/lambda-edge/` — Lambda@Edge handlers for CloudFront viewer/origin events
- `cdk/functions/lambda-demo/` — Demo origin Lambda showing payment-gated endpoints
- `cdk/bin/cdk.ts` — CDK app entry point; creates the `CdkStack`

### x402 Payment Flow

1. Client sends request without payment → Lambda@Edge returns `402 Payment Required` with `X-Payment-Response` header containing price/network/facilitator info
2. Client pays USDC on Base network (testnet: Base Sepolia) via x402 facilitator
3. Client retries request with payment token in `X-Payment-Token` header
4. Lambda@Edge verifies token with facilitator → forwards to origin on success

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Infrastructure | AWS CDK 2.232.1 (TypeScript) |
| Lambda Runtime | Node.js / TypeScript |
| Code Quality | Biome 2.4.8 (formatter + linter) |
| Testing | Jest 29 + ts-jest |
| Package Manager | Bun (use `bun install`, not `npm install`) |
| TypeScript | 5.9.3, strict mode, ES2022 target |

## Skills to Use

This project has custom skills that should be used proactively:

- **`x402-dev`** — Use when implementing x402 payment logic (client, server middleware, facilitator config, network selection). Contains complete patterns for Lambda@Edge integration.
- **`aws-cdk-architect`** — Use when designing or implementing CDK stacks (construct selection, stack splitting, security patterns, testing strategies).

## CDK Environment

The stack is environment-agnostic by default (no account/region hardcoded in `bin/cdk.ts`). Lambda@Edge functions **must** be deployed to `us-east-1` and associated with a CloudFront distribution. Uncomment the `env` property in `bin/cdk.ts` when deploying to a specific account.

## x402 Network Configuration

- **Development**: Base Sepolia testnet (recommended for initial development)
- **Production**: Base mainnet with USDC
- Facilitator endpoint: configured per network in x402 references (`/.claude/skills/x402-dev/references/networks.md`)
