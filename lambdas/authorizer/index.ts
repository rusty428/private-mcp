import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';
import { hashApiKey } from './functions/hashApiKey';
import { lookupApiKey } from './functions/lookupApiKey';

function generatePolicy(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context?: Record<string, string>
): APIGatewayAuthorizerResult {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{
        Action: 'execute-api:Invoke',
        Effect: effect,
        Resource: resource,
      }],
    },
    ...(context ? { context } : {}),
  };
}

export const handler = async (
  event: APIGatewayTokenAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> => {
  const apiKey = event.authorizationToken;

  if (!apiKey) {
    return generatePolicy('anonymous', 'Deny', event.methodArn);
  }

  try {
    const keyHash = hashApiKey(apiKey);
    const keyRecord = await lookupApiKey(keyHash);

    if (!keyRecord) {
      return generatePolicy('anonymous', 'Deny', event.methodArn);
    }

    // Allow all methods on this API (wildcard the method/path)
    const arnParts = event.methodArn.split(':');
    const apiGatewayArnParts = arnParts[5].split('/');
    const wildcardArn = `${arnParts.slice(0, 5).join(':')}:${apiGatewayArnParts[0]}/${apiGatewayArnParts[1]}/*`;

    return generatePolicy(keyRecord.username, 'Allow', wildcardArn, {
      user_id: keyRecord.username,
      username: keyRecord.username,
      team_id: keyRecord.team_id,
      role: 'admin',
    });
  } catch (error) {
    console.error('Authorizer error:', error);
    return generatePolicy('anonymous', 'Deny', event.methodArn);
  }
};
