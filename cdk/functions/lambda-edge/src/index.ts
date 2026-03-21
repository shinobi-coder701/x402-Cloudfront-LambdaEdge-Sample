// Handler exports for Lambda deployment
export { handler as originRequestHandler } from "./origin-request";
export { handler as originResponseHandler } from "./origin-response";

// Re-export library for custom integrations
export * from "./lib";
