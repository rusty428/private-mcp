// S3 bucket names must be globally unique — account ID suffix set via .env
// At Lambda runtime, AWS_ACCOUNT_ID is not needed (bucket names come from env vars).
// At CDK synth time, .env is loaded by dotenv before this module is evaluated.
const ACCOUNT_ID = process.env.AWS_ACCOUNT_ID;
if (!ACCOUNT_ID && process.env.CDK_DEFAULT_ACCOUNT) {
  // Running inside CDK — .env should have been loaded
  throw new Error('AWS_ACCOUNT_ID is not set in .env — required for bucket naming');
}
const accountSuffix = ACCOUNT_ID || 'unknown';

export const VECTOR_BUCKET_NAME = `private-mcp-thoughts-${accountSuffix}`;
export const VECTOR_INDEX_NAME = 'thoughts';
export const VECTOR_DIMENSIONS = 1024;
export const EMBEDDING_MODEL_ID = 'amazon.titan-embed-text-v2:0';
export const CLASSIFICATION_MODEL_ID = 'anthropic.claude-3-haiku-20240307-v1:0';
export const THOUGHTS_TABLE_NAME = 'private-mcp-thoughts-v2';
export const THOUGHTS_TABLE_V1_NAME = 'private-mcp-thoughts';
export const SETTINGS_TABLE_NAME = 'private-mcp-settings';
export const TEAMS_TABLE_NAME = 'private-mcp-teams';
export const USERS_TABLE_NAME = 'private-mcp-users';
export const API_KEYS_TABLE_NAME = 'private-mcp-api-keys';
export const CONFIG_BUCKET_NAME = `private-mcp-config-${accountSuffix}`;
