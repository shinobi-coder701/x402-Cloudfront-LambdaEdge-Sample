#!/usr/bin/env node
/**
 * CDK App entry point — x402 CloudFront + Lambda@Edge demo
 *
 * Required environment variables (read at synth time, baked into Lambda@Edge bundle):
 *
 *   PAY_TO_ADDRESS   Wallet address to receive USDC payments
 *                    e.g. export PAY_TO_ADDRESS=0xYourAddress
 *
 * Optional:
 *   X402_NETWORK     CAIP-2 network ID  (default: eip155:84532 = Base Sepolia)
 *   FACILITATOR_URL  x402 facilitator   (default: https://x402.org/facilitator)
 *
 * Deploy:
 *   PAY_TO_ADDRESS=0x... npx cdk deploy
 */
import * as cdk from "aws-cdk-lib/core";
import { CdkStack } from "../lib/cdk-stack";

const app = new cdk.App();
new CdkStack(app, "CdkStack", {});
